import { CheckCircle2, CircleDotDashed, Loader2 } from "lucide-react";
import type { AnalysisStatus } from "../types";

type AnalysisProgressProps = {
  status: AnalysisStatus;
};

const steps: Array<{ status: AnalysisStatus; label: string }> = [
  { status: "loading", label: "Loading video" },
  { status: "extracting", label: "Extracting pose landmarks" },
  { status: "phase", label: "Finding swing phase" },
  { status: "feedback", label: "Generating coaching feedback" },
];

function stepState(current: AnalysisStatus, step: AnalysisStatus) {
  const currentIndex = steps.findIndex((item) => item.status === current);
  const stepIndex = steps.findIndex((item) => item.status === step);

  if (current === "complete") return "done";
  if (current === "error") return stepIndex === 0 ? "current" : "pending";
  if (currentIndex > stepIndex) return "done";
  if (currentIndex === stepIndex) return "current";
  return "pending";
}

export function AnalysisProgress({ status }: AnalysisProgressProps) {
  if (status === "idle" || status === "complete") {
    return null;
  }

  return (
    <section className="analysis-panel" aria-live="polite">
      <div className="analysis-panel__header">
        <Loader2 className="spin" size={22} />
        <div>
          <p className="mini-label">Analysis running</p>
          <h2>Turning movement into one coaching signal</h2>
        </div>
      </div>
      <div className="progress-list">
        {steps.map((step) => {
          const state = stepState(status, step.status);
          return (
            <div className={`progress-step progress-step--${state}`} key={step.status}>
              {state === "done" ? <CheckCircle2 size={20} /> : <CircleDotDashed size={20} />}
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
