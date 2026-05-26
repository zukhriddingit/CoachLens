import type { CoachingResult, ShareCopyPack } from "../types";

const API_BASE =
  import.meta.env.VITE_COURTLENS_API_URL ?? import.meta.env.VITE_COACHLENS_API_URL ?? "http://127.0.0.1:8787";

export function fallbackShareCopy(result: CoachingResult): ShareCopyPack {
  return {
    instagramCaption: `Clean swing check: ${result.score}/100. Smooth timing, better spacing, and one rep closer.`,
    snapchatCaption: "This swing deserves the story.",
    highlightText: "Smooth timing. Clean contact. Great follow-through.",
    hashtags: ["#CourtLens", "#Tennis", "#Forehand", "#SwingCheck", "#TennisTraining"],
    styles: [
      { style: "Hype", caption: "Locked in. This one felt clean." },
      { style: "Athlete", caption: "Working on consistency one swing at a time." },
      { style: "Casual", caption: "Forehand check passed. We take those." },
      { style: "Motivational", caption: "Hours of practice paying off, one swing at a time." },
    ],
    model: "local-fallback",
    source: "fallback",
  };
}

export async function requestShareCopy(result: CoachingResult): Promise<ShareCopyPack> {
  try {
    const response = await fetch(`${API_BASE}/api/share-copy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ result }),
    });

    if (!response.ok) {
      return fallbackShareCopy(result);
    }

    const data = await response.json();
    return data.shareCopy ?? fallbackShareCopy(result);
  } catch {
    return fallbackShareCopy(result);
  }
}
