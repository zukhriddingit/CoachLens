import type { SwingSegment } from "../types";

const API_BASE =
  import.meta.env.VITE_COURTLENS_API_URL ?? import.meta.env.VITE_COACHLENS_API_URL ?? "http://127.0.0.1:8787";

function extensionFor(file: File): string {
  const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (match?.[1]) return match[1];
  if (file.type.includes("quicktime")) return "mov";
  if (file.type.includes("webm")) return "webm";
  return "mp4";
}

export async function trimSwingClip(file: File, segment: SwingSegment): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/trim-swing`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Swing-Start": segment.start.toFixed(3),
      "X-Swing-End": segment.end.toFixed(3),
      "X-File-Extension": extensionFor(file),
    },
    body: await file.arrayBuffer(),
  });

  if (!response.ok) {
    let message = "Unable to trim video.";
    try {
      const data = await response.json();
      message = data.error ?? message;
    } catch {
      // Keep default message for non-JSON failures.
    }
    throw new Error(message);
  }

  return response.blob();
}
