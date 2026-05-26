import { AlertTriangle, BadgeCheck, BrainCircuit, Dumbbell, MessageCircleQuestion, Sparkles } from "lucide-react";
import type { AIJudgeReview, AIJudgeStatus, CoachingResult, FramePose, SwingSegment } from "../types";
import { VideoAnalyzer } from "./VideoAnalyzer";
import { AIJudgeCard } from "./AIJudgeCard";
import { ShareShotCard } from "./ShareShotCard";
import type { ShareCopyPack, ShareCopyStatus } from "../types";

type ResultCardProps = {
  result: CoachingResult;
  videoUrl: string | null;
  frames: FramePose[];
  isDemo: boolean;
  swingSegment: SwingSegment | null;
  cropNote: string | null;
  recheckNote: string | null;
  aiJudgeStatus: AIJudgeStatus;
  aiJudgeReview: AIJudgeReview | null;
  shareCopyStatus: ShareCopyStatus;
  shareCopy: ShareCopyPack | null;
  onRetryAIReview: () => void;
};

export function ResultCard({
  result,
  videoUrl,
  frames,
  isDemo,
  swingSegment,
  cropNote,
  recheckNote,
  aiJudgeStatus,
  aiJudgeReview,
  shareCopyStatus,
  shareCopy,
  onRetryAIReview,
}: ResultCardProps) {
  return (
    <section className="results">
      <div className="results__topline">
        <div>
          <p className="mini-label">Evidence-linked coaching</p>
          <h2>{result.title}</h2>
        </div>
        <div className="score-pill" aria-label={`CourtLens score ${result.score} out of 100`}>
          <span>{result.score}</span>
          <small>score</small>
        </div>
      </div>

      <div className="results-grid">
        <VideoAnalyzer videoUrl={videoUrl} frames={frames} result={result} isDemo={isDemo} />

        <div className="main-fix-card">
          <div className="card-label-row">
            <div className="card-icon">
              <Sparkles size={22} />
            </div>
            <p className="mini-label">Main fix</p>
          </div>
          <h3>{result.mainFix}</h3>
          <p>{result.whyItMatters}</p>
          <div className="confidence-row">
            <BadgeCheck size={18} />
            Confidence: {result.confidence}
          </div>
          {recheckNote ? (
            <div className="recheck-summary">
              <strong>AI review triggered re-check</strong>
              <span>{recheckNote}</span>
            </div>
          ) : null}
          <div className="crop-summary">
            <strong>Auto swing crop</strong>
            <span>{cropNote ?? "Analyzing the core swing window from pose movement."}</span>
            {swingSegment ? (
              <small>
                Window {swingSegment.start.toFixed(1)}s-{swingSegment.end.toFixed(1)}s, peak motion at{" "}
                {swingSegment.peakTime.toFixed(1)}s.
              </small>
            ) : null}
          </div>
        </div>
      </div>

      <ShareShotCard score={result.score} videoUrl={videoUrl} status={shareCopyStatus} copy={shareCopy} />

      <div className="insight-grid">
        <article className="insight-card">
          <div className="insight-card__title">
            <BrainCircuit size={20} />
            Evidence
          </div>
          <ul>
            {result.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="insight-card">
          <div className="insight-card__title">
            <Dumbbell size={20} />
            Recommended drill
          </div>
          <p>{result.drill}</p>
        </article>

        <article className="insight-card">
          <div className="insight-card__title">
            <MessageCircleQuestion size={20} />
            Coach question
          </div>
          <p>{result.coachQuestion}</p>
        </article>

        <article className="insight-card insight-card--muted">
          <div className="insight-card__title">
            <AlertTriangle size={20} />
            Confidence note
          </div>
          <ul>
            {result.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>

      <AIJudgeCard
        status={aiJudgeStatus}
        review={aiJudgeReview}
        onRetry={onRetryAIReview}
        canRetry={Boolean(aiJudgeReview && aiJudgeStatus === "ready")}
      />
    </section>
  );
}
