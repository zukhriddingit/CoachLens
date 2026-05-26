import type { CoachingResult } from "../types";

export const demoResult: CoachingResult = {
  score: 82,
  title: "Contact point looks slightly cramped",
  mainFix: "Meet the ball farther in front of your right hip.",
  whyItMatters:
    "In the estimated contact window, your hitting wrist stays close to your hip, which can make the swing late and reduce extension.",
  evidence: [
    "Estimated contact window: 2.1s",
    "Right wrist stayed close to the right hip compared with the target spacing profile.",
    "Follow-through continued upward, so the main issue is spacing rather than finish.",
  ],
  drill:
    "Freeze-at-contact drill: do 10 slow shadow swings and pause with your hitting hand clearly in front of your front hip.",
  coachQuestion: "When you hit the ball, did it feel beside your body or slightly in front?",
  confidence: "Medium",
  limitations: [
    "Single-camera heuristic",
    "No exact ball-contact detection",
    "Works best when the full body is visible from a side/front-side angle",
    "Not a professional biomechanical diagnosis",
  ],
  features: {
    avgConfidence: 0.76,
    contactFrameTime: 2.1,
    maxWristSpeed: 1.32,
    elbowAngleAtContact: 118,
    shoulderHipSeparation: 14,
    wristForwardReach: 0.61,
    followThroughHeight: 0.17,
    stanceStability: 0.04,
  },
};
