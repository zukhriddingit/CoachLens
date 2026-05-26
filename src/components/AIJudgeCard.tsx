import { BrainCircuit, CheckCircle2, HelpCircle, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import type { AIJudgeReview, AIJudgeStatus } from "../types";

type AIJudgeCardProps = {
  status: AIJudgeStatus;
  review: AIJudgeReview | null;
  onRetry: () => void;
  canRetry: boolean;
};

function AgreementIcon({ agreement }: { agreement: AIJudgeReview["agreement"] }) {
  if (agreement === "Agree") return <CheckCircle2 size={21} />;
  if (agreement === "Disagree") return <XCircle size={21} />;
  return <HelpCircle size={21} />;
}

export function AIJudgeCard({ status, review, onRetry, canRetry }: AIJudgeCardProps) {
  if (status === "idle") return null;

  if (status === "loading") {
    return (
      <article className="ai-judge-card ai-judge-card--loading">
        <div className="insight-card__title">
          <BrainCircuit size={20} />
          AI Coach Review
        </div>
        <p>Asking the AI coach judge to review the pose-engine correction...</p>
      </article>
    );
  }

  if (!review) {
    return null;
  }

  return (
    <article className={`ai-judge-card ai-judge-card--${review.source}`}>
      <div className="ai-judge-card__header">
        <div>
          <p className="mini-label">Multimodal judge</p>
          <h3>AI Coach Review</h3>
        </div>
        <div className="agreement-pill">
          <AgreementIcon agreement={review.agreement} />
          {review.agreement}
        </div>
      </div>

      <div className="ai-judge-card__body">
        <div>
          <strong>Visual rationale</strong>
          <p>{review.visualRationale}</p>
        </div>
        <div>
          <strong>Safer wording</strong>
          <p>{review.saferWording}</p>
        </div>
        <div>
          <strong>Confidence note</strong>
          <p>{review.confidenceNote}</p>
        </div>
      </div>

      <div className="ai-judge-card__footer">
        <span>
          <ShieldAlert size={17} />
          Model: {review.model}. The pose engine remains the source of measurements; the AI coach is a review layer.
        </span>
        {canRetry ? (
          <button className="retry-ai-button" type="button" onClick={onRetry}>
            <RotateCcw size={16} />
            Retry AI review
          </button>
        ) : null}
      </div>
    </article>
  );
}
