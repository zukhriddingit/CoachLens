import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { FramePose } from "../types";
import { averageVisibility, computeSwingFeatures } from "./biomechanics";
import { analyzeForehand } from "./coachingRules";
import type { CoachingResult } from "../types";

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;

async function createPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
      );

      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    })();
  }

  return poseLandmarkerPromise;
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Number.isFinite(video.duration) && video.videoWidth > 0) {
      resolve();
      return;
    }

    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Unable to load video metadata."));
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleSeeked = () => {
      video.removeEventListener("seeked", handleSeeked);
      resolve();
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.onerror = () => reject(new Error("Unable to seek video."));
    video.currentTime = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.05));
  });
}

export async function extractPoseFrames(video: HTMLVideoElement): Promise<FramePose[] | null> {
  try {
    await waitForMetadata(video);

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return null;
    }

    const poseLandmarker = await createPoseLandmarker();
    const targetFps = video.duration > 10 ? 8 : 10;
    const sampleStep = 1 / targetFps;
    const maxSamples = Math.min(130, Math.ceil(video.duration * targetFps));
    const frames: FramePose[] = [];

    for (let index = 0; index < maxSamples; index += 1) {
      const time = Math.min(video.duration - 0.05, index * sampleStep);
      await seekVideo(video, time);
      const result = poseLandmarker.detectForVideo(video, Math.round(time * 1000));
      const landmarks = result.landmarks?.[0];

      if (landmarks?.length) {
        frames.push({
          time,
          landmarks: landmarks.map((point) => ({
            x: point.x,
            y: point.y,
            z: point.z,
            visibility: point.visibility,
          })),
          confidence: averageVisibility(landmarks),
        });
      }
    }

    return frames.length ? frames : null;
  } catch (error) {
    console.warn("MediaPipe pose extraction failed", error);
    return null;
  }
}

export async function analyzeVideoElement(video: HTMLVideoElement): Promise<{
  result: CoachingResult | null;
  frames: FramePose[];
}> {
  const frames = await extractPoseFrames(video);

  if (!frames?.length) {
    return { result: null, frames: [] };
  }

  const features = computeSwingFeatures(frames);
  return {
    result: analyzeForehand(features),
    frames,
  };
}
