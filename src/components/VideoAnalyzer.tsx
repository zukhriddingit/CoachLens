import { useEffect, useRef, useState } from "react";
import type { CoachingResult, FramePose, Point2D } from "../types";
import {
  RIGHT_ANKLE,
  RIGHT_ELBOW,
  RIGHT_HIP,
  RIGHT_KNEE,
  RIGHT_SHOULDER,
  RIGHT_WRIST,
  safeLandmark,
} from "../lib/biomechanics";

type VideoAnalyzerProps = {
  videoUrl: string | null;
  frames: FramePose[];
  result: CoachingResult | null;
  isDemo: boolean;
};

const mockPose: Record<number, Point2D> = {
  [RIGHT_SHOULDER]: { x: 0.5, y: 0.32, visibility: 0.9 },
  [RIGHT_ELBOW]: { x: 0.59, y: 0.44, visibility: 0.9 },
  [RIGHT_WRIST]: { x: 0.67, y: 0.51, visibility: 0.9 },
  [RIGHT_HIP]: { x: 0.48, y: 0.57, visibility: 0.9 },
  [RIGHT_KNEE]: { x: 0.53, y: 0.74, visibility: 0.9 },
  [RIGHT_ANKLE]: { x: 0.59, y: 0.9, visibility: 0.9 },
};

type RenderRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function projectPoint(point: Point2D, rect: RenderRect): Point2D {
  return {
    ...point,
    x: rect.x + point.x * rect.width,
    y: rect.y + point.y * rect.height,
  };
}

function drawPoint(ctx: CanvasRenderingContext2D, point: Point2D, radius = 5) {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawLine(ctx: CanvasRenderingContext2D, a: Point2D, b: Point2D) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function getContactFrame(frames: FramePose[], contactTime: number | null): FramePose | null {
  if (!frames.length) return null;
  if (contactTime === null) return frames[Math.floor(frames.length / 2)];

  return frames.reduce((closest, frame) =>
    Math.abs(frame.time - contactTime) < Math.abs(closest.time - contactTime) ? frame : closest,
  );
}

function drawCourtPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#10251f");
  gradient.addColorStop(1, "#0c141a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(210, 255, 221, 0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(width * 0.11, height * 0.12, width * 0.78, height * 0.76);
  ctx.beginPath();
  ctx.moveTo(width * 0.5, height * 0.12);
  ctx.lineTo(width * 0.5, height * 0.88);
  ctx.moveTo(width * 0.11, height * 0.5);
  ctx.lineTo(width * 0.89, height * 0.5);
  ctx.stroke();
}

function getRenderedVideoRect(video: HTMLVideoElement | null, width: number, height: number): RenderRect {
  if (!video?.videoWidth || !video.videoHeight) {
    return { x: 0, y: 0, width, height };
  }

  const videoAspect = video.videoWidth / video.videoHeight;
  const frameAspect = width / height;

  if (videoAspect > frameAspect) {
    const renderedHeight = width / videoAspect;
    return {
      x: 0,
      y: (height - renderedHeight) / 2,
      width,
      height: renderedHeight,
    };
  }

  const renderedWidth = height * videoAspect;
  return {
    x: (width - renderedWidth) / 2,
    y: 0,
    width: renderedWidth,
    height,
  };
}

export function VideoAnalyzer({ videoUrl, frames, result, isDemo }: VideoAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoMetadataVersion, setVideoMetadataVersion] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth * window.devicePixelRatio;
    const height = canvas.clientHeight * window.devicePixelRatio;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);

    if (!videoUrl || isDemo || !frames.length) {
      drawCourtPlaceholder(ctx, width, height);
    }

    const renderRect = videoUrl && !isDemo ? getRenderedVideoRect(videoRef.current, width, height) : { x: 0, y: 0, width, height };

    const contact = getContactFrame(frames, result?.features.contactFrameTime ?? null);
    const points = contact?.landmarks ?? mockPose;
    const getPoint = (index: number) =>
      Array.isArray(points) ? safeLandmark(points, index) : points[index] ?? null;

    const shoulder = getPoint(RIGHT_SHOULDER);
    const elbow = getPoint(RIGHT_ELBOW);
    const wrist = getPoint(RIGHT_WRIST);
    const hip = getPoint(RIGHT_HIP);
    const knee = getPoint(RIGHT_KNEE);
    const ankle = getPoint(RIGHT_ANKLE);
    const projected = [shoulder, elbow, wrist, hip, knee, ankle].map((point) =>
      point ? projectPoint(point, renderRect) : null,
    );
    const [projectedShoulder, projectedElbow, projectedWrist, projectedHip, projectedKnee, projectedAnkle] =
      projected;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#7df7b1";
    ctx.lineWidth = 6;
    ctx.shadowColor = "rgba(125, 247, 177, 0.5)";
    ctx.shadowBlur = 14;

    if (projectedShoulder && projectedElbow) drawLine(ctx, projectedShoulder, projectedElbow);
    if (projectedElbow && projectedWrist) drawLine(ctx, projectedElbow, projectedWrist);
    if (projectedHip && projectedShoulder) drawLine(ctx, projectedHip, projectedShoulder);
    if (projectedHip && projectedKnee) drawLine(ctx, projectedHip, projectedKnee);
    if (projectedKnee && projectedAnkle) drawLine(ctx, projectedKnee, projectedAnkle);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "#f7ff7d";
    projected.forEach((point) => {
      if (point) drawPoint(ctx, point);
    });

    const trail =
      frames.length > 1
        ? frames
            .map((frame) => safeLandmark(frame.landmarks, RIGHT_WRIST))
            .filter((point): point is Point2D => Boolean(point))
        : [
            { x: 0.36, y: 0.59 },
            { x: 0.46, y: 0.55 },
            { x: 0.56, y: 0.52 },
            { x: 0.67, y: 0.51 },
            { x: 0.76, y: 0.42 },
          ];

    trail.forEach((point, index) => {
      const projectedTrailPoint = projectPoint(point, renderRect);
      ctx.globalAlpha = 0.24 + (index / Math.max(1, trail.length - 1)) * 0.76;
      ctx.fillStyle = "#79c7ff";
      drawPoint(ctx, projectedTrailPoint, 3 + index * 0.04);
    });
    ctx.globalAlpha = 1;

    if (projectedWrist) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(projectedWrist.x, projectedWrist.y, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [frames, isDemo, result, videoMetadataVersion, videoUrl]);

  return (
    <div className="video-analyzer">
      <div className="video-frame">
        {videoUrl && !isDemo ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={() => setVideoMetadataVersion((version) => version + 1)}
          />
        ) : null}
        <canvas ref={canvasRef} aria-label="Pose overlay and wrist trail" />
        <div className="video-badge">Estimated contact window</div>
      </div>
      <div className="video-analyzer__caption">
        Pose overlay highlights the hitting arm, torso link, stance line, and wrist trail.
      </div>
    </div>
  );
}
