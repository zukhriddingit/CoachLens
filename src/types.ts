export type Point2D = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type FramePose = {
  time: number;
  landmarks: Point2D[];
  confidence: number;
};

export type SwingFeatures = {
  avgConfidence: number;
  contactFrameTime: number | null;
  maxWristSpeed: number;
  elbowAngleAtContact: number | null;
  shoulderHipSeparation: number | null;
  wristForwardReach: number | null;
  followThroughHeight: number | null;
  stanceStability: number | null;
};

export type SwingSegment = {
  start: number;
  end: number;
  peakTime: number;
  confidence: "High" | "Medium" | "Low";
  reason: string;
};

export type CoachingResult = {
  score: number;
  title: string;
  mainFix: string;
  whyItMatters: string;
  evidence: string[];
  drill: string;
  coachQuestion: string;
  confidence: "High" | "Medium" | "Low";
  limitations: string[];
  features: SwingFeatures;
  ruleId?: string;
  recheckNote?: string;
};

export type AIJudgeReview = {
  agreement: "Agree" | "Uncertain" | "Disagree";
  visualRationale: string;
  saferWording: string;
  confidenceNote: string;
  model: string;
  source: "gemini" | "openrouter" | "mock" | "unavailable";
};

export type AIJudgeStatus = "idle" | "loading" | "ready" | "error";

export type CaptionStyle = "Hype" | "Athlete" | "Casual" | "Motivational";

export type ShareCopyPack = {
  instagramCaption: string;
  snapchatCaption: string;
  highlightText: string;
  hashtags: string[];
  styles: Array<{
    style: CaptionStyle;
    caption: string;
  }>;
  model: string;
  source: "gemini" | "openrouter" | "fallback";
};

export type ShareCopyStatus = "idle" | "loading" | "ready" | "error";

export type SportProfile = {
  sport: "tennis" | "pickleball";
  stroke: "forehand";
  targetElbowAngleRange: [number, number];
  targetWristReachRange: [number, number];
  targetFollowThrough: "high" | "compact";
  coachingCopy: Record<string, string>;
};

export type AnalysisStatus =
  | "idle"
  | "loading"
  | "extracting"
  | "phase"
  | "feedback"
  | "complete"
  | "error";
