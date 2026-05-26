import { Activity, BadgeCheck, BrainCircuit, Target } from "lucide-react";

type HeroProps = {
  onDemo: () => void;
};

export function Hero({ onDemo }: HeroProps) {
  return (
    <section className="hero">
      <div className="hero__content">
        <div className="eyebrow">
          <span className="pulse-dot" />
          Evidence-linked coaching for hackathon demos
        </div>
        <h1>CourtLens</h1>
        <p className="hero__subtitle">AI micro-coaching for tennis forehands</p>
        <p className="hero__tagline">One clip -&gt; one fix -&gt; one drill</p>
        <div className="hero__actions">
          <a className="button button--primary" href="#upload">
            <Target size={18} />
            Analyze a clip
          </a>
          <button className="button button--ghost" type="button" onClick={onDemo}>
            <BadgeCheck size={18} />
            Use sample demo
          </button>
        </div>
      </div>

      <div className="hero__court" aria-label="Stylized tennis court preview">
        <div className="court-lines">
          <div className="court-net" />
          <div className="court-service court-service--top" />
          <div className="court-service court-service--bottom" />
          <div className="court-player">
            <span />
          </div>
          <div className="court-trail court-trail--one" />
          <div className="court-trail court-trail--two" />
          <div className="court-trail court-trail--three" />
        </div>
        <div className="hero__metric">
          <Activity size={17} />
          Pose landmarks to coaching signals
        </div>
        <div className="hero__metric hero__metric--lower">
          <BrainCircuit size={17} />
          One coachable fix, not a noisy report
        </div>
      </div>
    </section>
  );
}
