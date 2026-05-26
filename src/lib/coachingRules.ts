import type { CoachingResult, SportProfile, SwingFeatures } from "../types";

type RuleId = "camera" | "cramped" | "collapsed" | "rotation" | "finish" | "solid";

export const tennisForehandProfile: SportProfile = {
  sport: "tennis",
  stroke: "forehand",
  targetElbowAngleRange: [105, 165],
  targetWristReachRange: [0.72, 1.45],
  targetFollowThrough: "high",
  coachingCopy: {
    cramped: "Contact point looks cramped",
    collapsed: "Arm collapses near contact",
    rotation: "Use more torso rotation",
    finish: "Follow-through stops early",
  },
};

export const pickleballForehandProfile: SportProfile = {
  sport: "pickleball",
  stroke: "forehand",
  targetElbowAngleRange: [95, 150],
  targetWristReachRange: [0.55, 1.2],
  targetFollowThrough: "compact",
  coachingCopy: {
    cramped: "Contact spacing looks compact",
    collapsed: "Paddle-side arm collapses near contact",
    rotation: "Add controlled torso turn",
    finish: "Finish is too abrupt",
  },
};

function clampScore(score: number): number {
  return Math.max(40, Math.min(98, Math.round(score)));
}

function scoreFeatures(features: SwingFeatures): number {
  let score = 100;

  if (features.avgConfidence < 0.45) score -= 25;
  if (features.wristForwardReach !== null && features.wristForwardReach < tennisForehandProfile.targetWristReachRange[0]) score -= 14;
  if (features.elbowAngleAtContact !== null && features.elbowAngleAtContact < tennisForehandProfile.targetElbowAngleRange[0]) score -= 12;
  if (features.shoulderHipSeparation !== null && features.shoulderHipSeparation < 8) score -= 10;
  if (features.followThroughHeight !== null && features.followThroughHeight < 0.08) score -= 10;
  if (features.stanceStability !== null && features.stanceStability > 0.08) score -= 4;

  return clampScore(score);
}

function seconds(value: number | null): string {
  return value === null ? "not available" : `${value.toFixed(1)}s`;
}

function sharedLimitations(): string[] {
  return [
    "Single-camera heuristic",
    "Estimated contact window, not exact ball-contact detection",
    "Not a professional biomechanical diagnosis",
  ];
}

export function analyzeForehand(features: SwingFeatures): CoachingResult {
  const score = scoreFeatures(features);

  if (features.avgConfidence < 0.45) {
    return {
      score: Math.min(score, 62),
      title: "Camera angle needs improvement",
      mainFix: "Record from the side/front-side with your full body visible.",
      whyItMatters:
        "CourtLens needs clear pose landmarks for the feet, hips, shoulders, and racket-side arm before it can link a correction to reliable evidence.",
      evidence: [
        `Average pose confidence was ${features.avgConfidence.toFixed(2)}, below the 0.45 demo threshold.`,
        `Estimated contact window: ${seconds(features.contactFrameTime)}.`,
        "The analysis uses a single-camera heuristic, so missing landmarks lower confidence quickly.",
      ],
      drill: "Re-record one forehand with feet, hips, shoulders, and racket-side arm fully in frame.",
      coachQuestion: "Can you place the camera so your full body stays visible through the entire swing?",
      confidence: "Low",
      limitations: sharedLimitations(),
      features,
      ruleId: "camera",
    };
  }

  if (features.wristForwardReach !== null && features.wristForwardReach < tennisForehandProfile.targetWristReachRange[0]) {
    return {
      score,
      title: "Contact point looks cramped",
      mainFix: "Meet the ball farther in front of your right hip.",
      whyItMatters:
        "Your hitting wrist stays too close to the hip during the estimated contact window, which can make the forehand feel late and reduce extension.",
      evidence: [
        `Estimated contact window: ${seconds(features.contactFrameTime)}.`,
        `Right-wrist reach was ${features.wristForwardReach.toFixed(2)} torso lengths; CourtLens target starts near ${tennisForehandProfile.targetWristReachRange[0].toFixed(2)}.`,
        "Follow-through and elbow checks are secondary here; the strongest signal is spacing near the contact proxy.",
      ],
      drill:
        "Freeze-at-contact drill: shadow swing and pause with your hitting hand clearly in front of your front hip for 2 seconds. Do 10 reps.",
      coachQuestion: "At contact, did the ball feel like it was beside you instead of slightly in front?",
      confidence: features.avgConfidence > 0.7 ? "High" : "Medium",
      limitations: sharedLimitations(),
      features,
      ruleId: "cramped",
    };
  }

  if (features.elbowAngleAtContact !== null && features.elbowAngleAtContact < tennisForehandProfile.targetElbowAngleRange[0]) {
    return {
      score,
      title: "Arm collapses near contact",
      mainFix: "Keep comfortable space between your hitting elbow and ribs.",
      whyItMatters:
        "The elbow angle appears tight near the estimated contact window, which can reduce clean spacing.",
      evidence: [
        `Estimated contact window: ${seconds(features.contactFrameTime)}.`,
        `Right-elbow angle was ${features.elbowAngleAtContact.toFixed(0)} degrees; target range starts near ${tennisForehandProfile.targetElbowAngleRange[0]} degrees.`,
        "This is based on the racket-side shoulder, elbow, and wrist landmarks in a single-camera heuristic.",
      ],
      drill:
        "Spacing drill: place your non-hitting hand across your torso as a guide and shadow swing while keeping comfortable space between elbow and ribs.",
      coachQuestion: "Did your elbow feel tucked into your body during the swing?",
      confidence: features.avgConfidence > 0.7 ? "High" : "Medium",
      limitations: sharedLimitations(),
      features,
      ruleId: "collapsed",
    };
  }

  if (features.shoulderHipSeparation !== null && features.shoulderHipSeparation < 8) {
    return {
      score,
      title: "Use more torso rotation",
      mainFix: "Let the shoulders turn through the shot instead of swinging mostly with the arm.",
      whyItMatters:
        "The shoulder line changes only slightly relative to the hips, suggesting the swing is mostly arm-driven.",
      evidence: [
        `Estimated contact window: ${seconds(features.contactFrameTime)}.`,
        `Shoulder-hip separation was ${features.shoulderHipSeparation.toFixed(0)} degrees in the contact proxy frame.`,
        "The model compares shoulder and hip lines from the same video frame, so camera angle affects this estimate.",
      ],
      drill: "Unit-turn drill: start sideways, turn shoulders before the forward swing, then finish with chest facing the target.",
      coachQuestion: "Did you feel your chest rotate through the shot, or mostly your arm?",
      confidence: features.avgConfidence > 0.7 ? "High" : "Medium",
      limitations: sharedLimitations(),
      features,
      ruleId: "rotation",
    };
  }

  if (features.followThroughHeight !== null && features.followThroughHeight < 0.08) {
    return {
      score,
      title: "Follow-through stops early",
      mainFix: "Let the hitting hand continue up toward shoulder height after contact.",
      whyItMatters:
        "The wrist path after contact does not rise or continue much, which can limit topspin and control.",
      evidence: [
        `Estimated contact window: ${seconds(features.contactFrameTime)}.`,
        `Post-contact wrist rise measured ${features.followThroughHeight.toFixed(2)} normalized screen units.`,
        "CourtLens uses a single-camera heuristic, so this is a simple wrist-path signal rather than a full racket-path model.",
      ],
      drill: "High-finish drill: shadow swing and finish with your hitting hand near shoulder height.",
      coachQuestion: "Did your racket naturally finish high, or did it stop right after contact?",
      confidence: features.avgConfidence > 0.7 ? "High" : "Medium",
      limitations: sharedLimitations(),
      features,
      ruleId: "finish",
    };
  }

  return {
    score,
    title: "Forehand shape looks solid",
    mainFix: "Keep repeating the same contact point and finish shape.",
    whyItMatters:
      "Your spacing, elbow angle, and follow-through are within the simple CourtLens target range.",
    evidence: [
      `Estimated contact window: ${seconds(features.contactFrameTime)}.`,
      "Wrist reach, elbow angle, and follow-through landed inside the current tennis forehand profile.",
      "This is still a single-camera heuristic and not a professional biomechanical diagnosis.",
    ],
    drill: "Consistency drill: repeat 10 forehands trying to match the same contact point.",
    coachQuestion: "What cue helped you repeat the same contact point?",
    confidence: features.avgConfidence > 0.75 ? "High" : "Medium",
    limitations: sharedLimitations(),
    features,
    ruleId: "solid",
  };
}

function candidateSeverity(features: SwingFeatures, ruleId: RuleId): number {
  if (ruleId === "camera") return features.avgConfidence < 0.45 ? 1 - features.avgConfidence : 0;
  if (ruleId === "cramped" && features.wristForwardReach !== null) {
    return Math.max(0, tennisForehandProfile.targetWristReachRange[0] - features.wristForwardReach);
  }
  if (ruleId === "collapsed" && features.elbowAngleAtContact !== null) {
    return Math.max(0, (tennisForehandProfile.targetElbowAngleRange[0] - features.elbowAngleAtContact) / 100);
  }
  if (ruleId === "rotation" && features.shoulderHipSeparation !== null) {
    return Math.max(0, (8 - features.shoulderHipSeparation) / 16);
  }
  if (ruleId === "finish" && features.followThroughHeight !== null) {
    return Math.max(0, (0.08 - features.followThroughHeight) * 4);
  }
  return 0;
}

export function reanalyzeForehand(features: SwingFeatures, disputedRuleId?: string): CoachingResult {
  const candidates: RuleId[] = ["camera", "cramped", "collapsed", "rotation", "finish"];
  const alternate = candidates
    .filter((ruleId) => ruleId !== disputedRuleId)
    .map((ruleId) => ({ ruleId, severity: candidateSeverity(features, ruleId) }))
    .filter((candidate) => candidate.severity > 0)
    .sort((a, b) => b.severity - a.severity)[0];

  if (!alternate) {
    return {
      ...analyzeForehand(features),
      recheckNote:
        "AI coach review requested a re-check, but no stronger alternate signal was found. CourtLens kept the original measurement-led result.",
    };
  }

  const adjustedFeatures = { ...features };

  if (disputedRuleId === "cramped") {
    adjustedFeatures.wristForwardReach = tennisForehandProfile.targetWristReachRange[0];
  }
  if (disputedRuleId === "collapsed") {
    adjustedFeatures.elbowAngleAtContact = tennisForehandProfile.targetElbowAngleRange[0];
  }
  if (disputedRuleId === "rotation") {
    adjustedFeatures.shoulderHipSeparation = 8;
  }
  if (disputedRuleId === "finish") {
    adjustedFeatures.followThroughHeight = 0.08;
  }
  if (disputedRuleId === "camera") {
    adjustedFeatures.avgConfidence = 0.46;
  }

  const revised = analyzeForehand(adjustedFeatures);
  return {
    ...revised,
    recheckNote:
      revised.ruleId === disputedRuleId
        ? "AI coach review requested a re-check, but the same measurement signal remained strongest."
        : `AI coach review requested a re-check, so CourtLens skipped the disputed ${disputedRuleId ?? "first"} signal and selected the next strongest local measurement.`,
  };
}
