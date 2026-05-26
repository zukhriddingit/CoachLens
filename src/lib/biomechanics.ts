import type { FramePose, Point2D, SwingFeatures, SwingSegment } from "../types";

export const LEFT_SHOULDER = 11;
export const RIGHT_SHOULDER = 12;
export const LEFT_ELBOW = 13;
export const RIGHT_ELBOW = 14;
export const LEFT_WRIST = 15;
export const RIGHT_WRIST = 16;
export const LEFT_HIP = 23;
export const RIGHT_HIP = 24;
export const LEFT_KNEE = 25;
export const RIGHT_KNEE = 26;
export const LEFT_ANKLE = 27;
export const RIGHT_ANKLE = 28;

const MIN_VISIBILITY = 0.25;

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angle(a: Point2D, b: Point2D, c: Point2D): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);

  if (magAB === 0 || magCB === 0) {
    return 0;
  }

  const cosine = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function velocity(points: Array<{ point: Point2D; time: number }>): number[] {
  return points.slice(1).map((sample, index) => {
    const previous = points[index];
    const deltaTime = Math.max(0.001, sample.time - previous.time);
    return distance(sample.point, previous.point) / deltaTime;
  });
}

export function safeLandmark(landmarks: Point2D[], index: number): Point2D | null {
  const point = landmarks[index];
  if (!point) {
    return null;
  }

  if (point.visibility !== undefined && point.visibility < MIN_VISIBILITY) {
    return null;
  }

  return point;
}

export function averageVisibility(landmarks: Point2D[]): number {
  if (!landmarks.length) {
    return 0;
  }

  const visible = landmarks
    .map((point) => point.visibility ?? 0.75)
    .filter((score) => Number.isFinite(score));

  if (!visible.length) {
    return 0;
  }

  return visible.reduce((total, score) => total + score, 0) / visible.length;
}

function lineAngle(a: Point2D, b: Point2D): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function normalizedReach(wrist: Point2D, hip: Point2D, shoulder: Point2D): number {
  const torso = Math.max(0.001, distance(hip, shoulder));
  return Math.abs(wrist.x - hip.x) / torso;
}

function chooseContactFrame(frames: FramePose[]): { frame: FramePose; index: number } | null {
  const candidates = frames
    .map((frame, index) => {
      const wrist = safeLandmark(frame.landmarks, RIGHT_WRIST);
      const hip = safeLandmark(frame.landmarks, RIGHT_HIP);
      const shoulder = safeLandmark(frame.landmarks, RIGHT_SHOULDER);
      if (!wrist || !hip || !shoulder) {
        return null;
      }

      return {
        frame,
        index,
        reach: normalizedReach(wrist, hip, shoulder),
        confidence: frame.confidence,
      };
    })
    .filter(Boolean) as Array<{ frame: FramePose; index: number; reach: number; confidence: number }>;

  if (!candidates.length) {
    return null;
  }

  const wristSamples = candidates.map(({ frame }) => ({
    point: frame.landmarks[RIGHT_WRIST],
    time: frame.time,
  }));
  const wristSpeeds = velocity(wristSamples);
  const maxSpeed = Math.max(0.001, ...wristSpeeds);

  const ranked = candidates.map((candidate, candidateIndex) => {
    const speed = wristSpeeds[Math.max(0, candidateIndex - 1)] ?? wristSpeeds[0] ?? 0;
    return {
      ...candidate,
      score: candidate.reach * 0.7 + (speed / maxSpeed) * 0.3 + candidate.confidence * 0.1,
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return { frame: ranked[0].frame, index: ranked[0].index };
}

function computeStanceStability(frames: FramePose[]): number | null {
  const stanceIndices = [LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE, LEFT_ANKLE, RIGHT_ANKLE];
  const validFrames = frames.filter((frame) =>
    stanceIndices.every((index) => Boolean(safeLandmark(frame.landmarks, index))),
  );

  if (validFrames.length < 2) {
    return null;
  }

  const totalMotion = validFrames.slice(1).reduce((total, frame, frameIndex) => {
    const previous = validFrames[frameIndex];
    const frameMotion = stanceIndices.reduce((sum, index) => {
      const currentPoint = safeLandmark(frame.landmarks, index);
      const previousPoint = safeLandmark(previous.landmarks, index);
      return currentPoint && previousPoint ? sum + distance(currentPoint, previousPoint) : sum;
    }, 0);

    return total + frameMotion / stanceIndices.length;
  }, 0);

  return totalMotion / (validFrames.length - 1);
}

export function computeSwingFeatures(frames: FramePose[]): SwingFeatures {
  if (!frames.length) {
    return {
      avgConfidence: 0,
      contactFrameTime: null,
      maxWristSpeed: 0,
      elbowAngleAtContact: null,
      shoulderHipSeparation: null,
      wristForwardReach: null,
      followThroughHeight: null,
      stanceStability: null,
    };
  }

  const avgConfidence = frames.reduce((total, frame) => total + frame.confidence, 0) / frames.length;
  const wristSamples = frames
    .map((frame) => {
      const wrist = safeLandmark(frame.landmarks, RIGHT_WRIST);
      return wrist ? { point: wrist, time: frame.time } : null;
    })
    .filter(Boolean) as Array<{ point: Point2D; time: number }>;
  const maxWristSpeed = wristSamples.length > 1 ? Math.max(...velocity(wristSamples)) : 0;
  const contact = chooseContactFrame(frames);

  if (!contact) {
    return {
      avgConfidence,
      contactFrameTime: null,
      maxWristSpeed,
      elbowAngleAtContact: null,
      shoulderHipSeparation: null,
      wristForwardReach: null,
      followThroughHeight: null,
      stanceStability: computeStanceStability(frames),
    };
  }

  const landmarks = contact.frame.landmarks;
  const shoulder = safeLandmark(landmarks, RIGHT_SHOULDER);
  const elbow = safeLandmark(landmarks, RIGHT_ELBOW);
  const wrist = safeLandmark(landmarks, RIGHT_WRIST);
  const hip = safeLandmark(landmarks, RIGHT_HIP);
  const leftShoulder = safeLandmark(landmarks, LEFT_SHOULDER);
  const leftHip = safeLandmark(landmarks, LEFT_HIP);

  const elbowAngleAtContact = shoulder && elbow && wrist ? angle(shoulder, elbow, wrist) : null;
  const wristForwardReach = wrist && hip && shoulder ? normalizedReach(wrist, hip, shoulder) : null;
  const shoulderHipSeparation =
    leftShoulder && shoulder && leftHip && hip
      ? Math.abs(lineAngle(leftShoulder, shoulder) - lineAngle(leftHip, hip))
      : null;

  const postContact = frames.slice(contact.index);
  const postWristY = postContact
    .map((frame) => safeLandmark(frame.landmarks, RIGHT_WRIST)?.y)
    .filter((value): value is number => value !== undefined);
  const followThroughHeight =
    postWristY.length && shoulder
      ? Math.max(0, shoulder.y - Math.min(...postWristY))
      : null;

  return {
    avgConfidence,
    contactFrameTime: contact.frame.time,
    maxWristSpeed,
    elbowAngleAtContact,
    shoulderHipSeparation,
    wristForwardReach,
    followThroughHeight,
    stanceStability: computeStanceStability(frames),
  };
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function smooth(values: number[]): number[] {
  return values.map((value, index) => {
    const previous = values[Math.max(0, index - 1)];
    const next = values[Math.min(values.length - 1, index + 1)];
    return previous * 0.25 + value * 0.5 + next * 0.25;
  });
}

function segmentMotionScores(frames: FramePose[]): Array<{ time: number; score: number }> {
  const tracked = [
    { index: RIGHT_WRIST, weight: 1.6 },
    { index: RIGHT_ELBOW, weight: 1.1 },
    { index: RIGHT_SHOULDER, weight: 0.55 },
    { index: RIGHT_HIP, weight: 0.3 },
  ];

  const rawScores = frames.slice(1).map((frame, frameIndex) => {
    const previous = frames[frameIndex];
    const deltaTime = Math.max(0.001, frame.time - previous.time);
    let total = 0;
    let totalWeight = 0;

    for (const item of tracked) {
      const currentPoint = safeLandmark(frame.landmarks, item.index);
      const previousPoint = safeLandmark(previous.landmarks, item.index);
      if (currentPoint && previousPoint) {
        total += (distance(currentPoint, previousPoint) / deltaTime) * item.weight;
        totalWeight += item.weight;
      }
    }

    return {
      time: frame.time,
      score: totalWeight ? total / totalWeight : 0,
    };
  });

  const smoothed = smooth(rawScores.map((sample) => sample.score));
  return rawScores.map((sample, index) => ({
    ...sample,
    score: smoothed[index],
  }));
}

export function detectSwingSegment(frames: FramePose[], duration: number, bufferSeconds = 0.5): SwingSegment | null {
  if (frames.length < 6 || duration <= 0) {
    return null;
  }

  const scores = segmentMotionScores(frames).filter((sample) => Number.isFinite(sample.score));
  if (scores.length < 5) {
    return null;
  }

  const values = scores.map((sample) => sample.score);
  const peakScore = Math.max(...values);
  const baseline = percentile(values, 0.35);
  const activeThreshold = Math.max(0.12, baseline + (peakScore - baseline) * 0.28);
  const weakMotion = peakScore < 0.2 || peakScore < baseline * 1.45;

  if (weakMotion) {
    return {
      start: 0,
      end: Math.min(duration, 8),
      peakTime: frames[Math.floor(frames.length / 2)]?.time ?? 0,
      confidence: "Low",
      reason: "Motion stayed close to idle levels, so CourtLens kept the first short clip as a fallback.",
    };
  }

  const peakIndex = scores.findIndex((sample) => sample.score === peakScore);
  let startIndex = peakIndex;
  let quietCount = 0;
  for (let index = peakIndex; index >= 0; index -= 1) {
    if (scores[index].score < activeThreshold) quietCount += 1;
    else quietCount = 0;

    startIndex = index;
    if (quietCount >= 2) break;
  }

  let endIndex = peakIndex;
  quietCount = 0;
  for (let index = peakIndex; index < scores.length; index += 1) {
    if (scores[index].score < activeThreshold) quietCount += 1;
    else quietCount = 0;

    endIndex = index;
    if (quietCount >= 3) break;
  }

  const start = Math.max(0, scores[startIndex].time - bufferSeconds);
  const end = Math.min(duration, scores[endIndex].time + bufferSeconds);
  const segmentLength = end - start;

  return {
    start,
    end: segmentLength < 1.25 ? Math.min(duration, start + 1.25) : end,
    peakTime: scores[peakIndex].time,
    confidence: peakScore > baseline * 2.4 ? "High" : "Medium",
    reason:
      "Detected from right wrist, elbow, shoulder, and hip velocity crossing above the idle-motion baseline.",
  };
}
