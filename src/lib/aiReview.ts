import type { AIJudgeReview, CoachingResult } from "../types";

type ReviewFrame = {
  label: string;
  data: string;
  mimeType: "image/jpeg";
};

const API_BASE = import.meta.env.VITE_COACHLENS_API_URL ?? "http://127.0.0.1:8787";

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Number.isFinite(video.duration) && video.videoWidth > 0) {
      resolve();
      return;
    }
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Unable to load video metadata for AI review."));
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.onerror = () => reject(new Error("Unable to sample review frame."));
    video.currentTime = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.05));
  });
}

function stripDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/jpeg;base64,/, "");
}

export async function captureReviewFrames(videoUrl: string | null, contactTime: number | null): Promise<ReviewFrame[]> {
  if (!videoUrl) return [];

  const video = document.createElement("video");
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  await waitForMetadata(video);

  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return [];

  const center = contactTime ?? Math.min(video.duration * 0.5, 2);
  const samples = [
    { label: "pre-contact", time: Math.max(0.1, center - 0.45) },
    { label: "estimated-contact-window", time: center },
    { label: "follow-through", time: Math.min(Math.max(0.1, video.duration - 0.1), center + 0.45) },
  ];

  const frames: ReviewFrame[] = [];
  for (const sample of samples) {
    await seek(video, sample.time);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    frames.push({
      label: sample.label,
      data: stripDataUrl(canvas.toDataURL("image/jpeg", 0.68)),
      mimeType: "image/jpeg",
    });
  }

  return frames;
}

export function mockAIReview(reason = "Gemini is not configured yet."): AIJudgeReview {
  const missingKey = reason.includes("GEMINI_API_KEY") || reason.toLowerCase().includes("not configured");
  const setupHint = missingKey
    ? `${reason} Add GEMINI_API_KEY to .env.local and restart npm run dev for real visual review.`
    : `${reason} The model may be temporarily busy. You can retry the AI review without rerunning pose analysis.`;

  return {
    agreement: "Uncertain",
    visualRationale:
      missingKey
        ? "The pose engine produced a plausible coaching signal, but this panel is using a local fallback until the Gemini backend has an API key."
        : "The pose engine produced a plausible coaching signal, but the AI review could not complete, so CoachLens is showing a local fallback.",
    saferWording: "Treat this as a single-camera cue: try meeting the ball a little farther in front of your right hip.",
    confidenceNote: setupHint,
    model: "local-fallback",
    source: "unavailable",
  };
}

export async function requestAIReview(result: CoachingResult, videoUrl: string | null): Promise<AIJudgeReview> {
  try {
    const frames = await captureReviewFrames(videoUrl, result.features.contactFrameTime);
    const response = await fetch(`${API_BASE}/api/coach-review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        result,
        frames,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      return mockAIReview(data.error ?? "Gemini review failed.");
    }

    return data.review;
  } catch (error) {
    return mockAIReview(error instanceof Error ? error.message : "Gemini review failed.");
  }
}
