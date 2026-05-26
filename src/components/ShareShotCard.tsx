import { Copy, Download, ExternalLink, Instagram, MessageCircle, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ShareCopyPack, ShareCopyStatus } from "../types";

type ShareShotCardProps = {
  score: number;
  videoUrl: string | null;
  status: ShareCopyStatus;
  copy: ShareCopyPack | null;
};

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

function fullCaption(copy: ShareCopyPack) {
  return `${copy.instagramCaption}\n\n${copy.hashtags.join(" ")}`;
}

export function ShareShotCard({ score, videoUrl, status, copy }: ShareShotCardProps) {
  const [actionNote, setActionNote] = useState<string | null>(null);

  if (score < 80) {
    return null;
  }

  const isLoading = status === "loading" || !copy;

  async function handleCopy(text: string, note: string) {
    await copyText(text);
    setActionNote(note);
  }

  async function shareNative() {
    if (!copy) return;
    const text = fullCaption(copy);
    if (navigator.share) {
      await navigator.share({
        title: "CoachLens Court swing",
        text,
      });
      return;
    }
    await handleCopy(text, "Caption copied. Paste it into Instagram or Snapchat.");
  }

  async function copyAndOpenInstagram() {
    if (!copy) return;
    await handleCopy(fullCaption(copy), "Instagram caption copied. Opening Instagram...");
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
  }

  async function copyAndOpenSnapchat() {
    if (!copy) return;
    await handleCopy(copy.snapchatCaption, "Snapchat caption copied. Opening Snapchat...");
    window.open("https://www.snapchat.com/", "_blank", "noopener,noreferrer");
  }

  function downloadClip() {
    if (!videoUrl) return;
    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = "coachlens-swing-clip.mp4";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setActionNote("Clip download started.");
  }

  return (
    <section className="share-shot-card">
      <div className="share-shot-card__header">
        <div className="share-shot-card__icon">
          <Sparkles size={24} />
        </div>
        <div>
          <p className="mini-label">Share your shot</p>
          <h2>That was a clean swing.</h2>
        </div>
      </div>

      <p className="share-shot-card__lead">
        Your score cleared 80. This swing deserves to be posted.
      </p>

      {isLoading ? (
        <div className="share-loading">Generating Instagram and Snapchat captions...</div>
      ) : (
        <>
          <div className="share-copy-grid">
            <article>
              <div className="share-copy-title">
                <Instagram size={18} />
                Instagram caption
              </div>
              <p>{copy.instagramCaption}</p>
              <button
                className="share-mini-button"
                type="button"
                onClick={() => void handleCopy(fullCaption(copy), "Instagram caption copied.")}
              >
                <Copy size={16} />
                Copy
              </button>
            </article>

            <article>
              <div className="share-copy-title">
                <MessageCircle size={18} />
                Snapchat caption
              </div>
              <p>{copy.snapchatCaption}</p>
              <button
                className="share-mini-button"
                type="button"
                onClick={() => void handleCopy(copy.snapchatCaption, "Snapchat caption copied.")}
              >
                <Copy size={16} />
                Copy
              </button>
            </article>

            <article>
              <div className="share-copy-title">
                <Sparkles size={18} />
                Highlight text
              </div>
              <p>{copy.highlightText}</p>
              <button
                className="share-mini-button"
                type="button"
                onClick={() => void handleCopy(copy.highlightText, "Highlight text copied.")}
              >
                <Copy size={16} />
                Copy
              </button>
            </article>
          </div>

          <div className="caption-style-list">
            {copy.styles.map((item) => (
              <button
                className="caption-style-pill"
                key={item.style}
                type="button"
                onClick={() => void handleCopy(`${item.caption}\n\n${copy.hashtags.join(" ")}`, `${item.style} caption copied.`)}
              >
                <strong>{item.style}</strong>
                <span>{item.caption}</span>
              </button>
            ))}
          </div>

          <div className="hashtag-row">
            {copy.hashtags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>

          <div className="share-actions">
            <button className="button button--primary" type="button" onClick={() => void shareNative()}>
              <Send size={18} />
              Share caption
            </button>
            <button className="button button--secondary" type="button" onClick={() => void copyAndOpenInstagram()}>
              <Instagram size={18} />
              Copy + open Instagram
              <ExternalLink size={15} />
            </button>
            <button className="button button--secondary" type="button" onClick={() => void copyAndOpenSnapchat()}>
              <MessageCircle size={18} />
              Copy + open Snapchat
              <ExternalLink size={15} />
            </button>
            {videoUrl ? (
              <button className="button button--secondary" type="button" onClick={downloadClip}>
                <Download size={18} />
                Download clip
              </button>
            ) : null}
          </div>

          {actionNote ? <p className="share-action-note">{actionNote}</p> : null}

          <p className="share-shot-card__note">
            Captions from {copy.source === "fallback" ? "local fallback" : `${copy.source} (${copy.model})`}. Posting still happens in Instagram or Snapchat.
          </p>
        </>
      )}
    </section>
  );
}
