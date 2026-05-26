import { useEffect, useMemo, useState } from "react";
import { Route } from "lucide-react";
import { AnalysisProgress } from "./components/AnalysisProgress";
import { Hero } from "./components/Hero";
import { ResultCard } from "./components/ResultCard";
import { UploadPanel } from "./components/UploadPanel";
import { analyzeVideoElement } from "./lib/pose";
import { demoResult } from "./lib/demoResult";
import { requestAIReview } from "./lib/aiReview";
import { detectSwingSegment } from "./lib/biomechanics";
import { trimSwingClip } from "./lib/videoTrim";
import { reanalyzeForehand } from "./lib/coachingRules";
import { requestShareCopy } from "./lib/shareCopy";
import type {
  AIJudgeReview,
  AIJudgeStatus,
  AnalysisStatus,
  CoachingResult,
  FramePose,
  ShareCopyPack,
  ShareCopyStatus,
  SwingSegment,
} from "./types";

const SUPPORTED_EXTENSIONS = [".mp4", ".mov", ".webm"];
const SUPPORTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isSupportedVideo(file: File | null): boolean {
  if (!file) return false;
  const lowerName = file.name.toLowerCase();
  return SUPPORTED_TYPES.includes(file.type) || SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function addDemoLimit(result: CoachingResult, note: string): CoachingResult {
  return {
    ...result,
    limitations: Array.from(new Set([...result.limitations, note])),
  };
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [result, setResult] = useState<CoachingResult | null>(null);
  const [frames, setFrames] = useState<FramePose[]>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiJudgeStatus, setAiJudgeStatus] = useState<AIJudgeStatus>("idle");
  const [aiJudgeReview, setAiJudgeReview] = useState<AIJudgeReview | null>(null);
  const [swingSegment, setSwingSegment] = useState<SwingSegment | null>(null);
  const [croppedVideoUrl, setCroppedVideoUrl] = useState<string | null>(null);
  const [cropNote, setCropNote] = useState<string | null>(null);
  const [recheckNote, setRecheckNote] = useState<string | null>(null);
  const [shareCopyStatus, setShareCopyStatus] = useState<ShareCopyStatus>("idle");
  const [shareCopy, setShareCopy] = useState<ShareCopyPack | null>(null);

  const videoUrl = useMemo(() => (file && isSupportedVideo(file) ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      if (croppedVideoUrl) {
        URL.revokeObjectURL(croppedVideoUrl);
      }
    };
  }, [croppedVideoUrl]);

  function handleFileSelect(nextFile: File | null) {
    setFile(nextFile);
    setResult(null);
    setFrames([]);
    setIsDemo(false);
    setStatus("idle");
    setAiJudgeStatus("idle");
    setAiJudgeReview(null);
    setSwingSegment(null);
    setCropNote(null);
    setRecheckNote(null);
    setShareCopyStatus("idle");
    setShareCopy(null);
    if (croppedVideoUrl) {
      URL.revokeObjectURL(croppedVideoUrl);
      setCroppedVideoUrl(null);
    }

    if (!nextFile) {
      setUploadError(null);
      return;
    }

    setUploadError(
      isSupportedVideo(nextFile)
        ? null
        : "That file type is not supported for real analysis. The sample demo remains available.",
    );
  }

  async function runDemo(note = "Sample demo fallback used for presentation reliability.") {
    setIsDemo(true);
    setFrames([]);
    setResult(null);
    setAiJudgeStatus("idle");
    setAiJudgeReview(null);
    setSwingSegment(null);
    setCropNote("Sample demo uses a pre-cropped swing preview.");
    setRecheckNote(null);
    setShareCopyStatus("idle");
    setShareCopy(null);
    if (croppedVideoUrl) {
      URL.revokeObjectURL(croppedVideoUrl);
      setCroppedVideoUrl(null);
    }
    setStatus("loading");
    await delay(350);
    setStatus("extracting");
    await delay(500);
    setStatus("phase");
    await delay(450);
    setStatus("feedback");
    await delay(450);
    setResult(addDemoLimit(demoResult, note));
    setStatus("complete");
  }

  async function runAIJudge(nextResult: CoachingResult, nextVideoUrl: string | null, allowRecheck = true) {
    setAiJudgeStatus("loading");
    setAiJudgeReview(null);
    const review = await requestAIReview(nextResult, nextVideoUrl);

    if (allowRecheck && (review.agreement === "Uncertain" || review.agreement === "Disagree")) {
      const revisedResult = reanalyzeForehand(nextResult.features, nextResult.ruleId);
      const changed = revisedResult.title !== nextResult.title || revisedResult.mainFix !== nextResult.mainFix;
      const note =
        revisedResult.recheckNote ??
        "AI coach review requested a re-check, so CoachLens ran a second local measurement pass.";
      const finalResult = changed ? revisedResult : { ...nextResult, recheckNote: note };

      setRecheckNote(changed ? note : `${note} The original correction stayed in place.`);
      setResult(finalResult);
      void runShareCopy(finalResult);

      if (changed) {
        const revisedReview = await requestAIReview(revisedResult, nextVideoUrl);
        setAiJudgeReview(revisedReview);
      } else {
        setAiJudgeReview(review);
      }
      setAiJudgeStatus("ready");
      return;
    }

    setRecheckNote(null);
    setAiJudgeReview(review);
    setAiJudgeStatus("ready");
  }

  function retryAIReview() {
    if (!result) return;
    void runAIJudge(result, croppedVideoUrl ?? videoUrl, false);
  }

  async function runShareCopy(nextResult: CoachingResult) {
    if (nextResult.score < 80) {
      setShareCopyStatus("idle");
      setShareCopy(null);
      return;
    }

    setShareCopyStatus("loading");
    const nextCopy = await requestShareCopy(nextResult);
    setShareCopy(nextCopy);
    setShareCopyStatus("ready");
  }

  async function cropSwingPreview(nextFile: File, nextFrames: FramePose[], duration: number): Promise<{
    segment: SwingSegment | null;
    url: string | null;
    note: string;
  }> {
    const segment = detectSwingSegment(nextFrames, duration);
    if (!segment) {
      return {
        segment: null,
        url: null,
        note: "Swing crop unavailable: pose motion was not stable enough to isolate one swing.",
      };
    }

    try {
      const clip = await trimSwingClip(nextFile, segment);
      return {
        segment,
        url: URL.createObjectURL(clip),
        note: `Auto-cropped from ${segment.start.toFixed(1)}s to ${segment.end.toFixed(1)}s (${segment.confidence.toLowerCase()} confidence).`,
      };
    } catch (error) {
      return {
        segment,
        url: null,
        note: error instanceof Error ? `Using original clip: ${error.message}` : "Using original clip: trim failed.",
      };
    }
  }

  async function handleAnalyze() {
    if (!file || !videoUrl || uploadError) {
      await runDemo(!file ? "No video uploaded, so CoachLens used the sample demo result." : "Unsupported file type, so CoachLens used the sample demo result.");
      return;
    }

    setStatus("loading");
    setResult(null);
    setFrames([]);
    setIsDemo(false);
    setAiJudgeStatus("idle");
    setAiJudgeReview(null);
    setSwingSegment(null);
    setCropNote(null);
    setRecheckNote(null);
    setShareCopyStatus("idle");
    setShareCopy(null);
    if (croppedVideoUrl) {
      URL.revokeObjectURL(croppedVideoUrl);
      setCroppedVideoUrl(null);
    }

    try {
      await delay(350);
      const video = document.createElement("video");
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";

      setStatus("extracting");
      const analysis = await analyzeVideoElement(video);
      setStatus("phase");
      await delay(450);
      setStatus("feedback");
      await delay(450);

      if (analysis.result) {
        const crop = await cropSwingPreview(file, analysis.frames, video.duration);
        setFrames(analysis.frames);
        setSwingSegment(crop.segment);
        setCroppedVideoUrl(crop.url);
        setCropNote(crop.note);
        setResult(analysis.result);
        setStatus("complete");
        void runAIJudge(analysis.result, crop.url ?? videoUrl);
        void runShareCopy(analysis.result);
      } else {
        const fallbackResult = addDemoLimit(
          demoResult,
          "MediaPipe did not return usable landmarks, so CoachLens used the sample demo result.",
        );
        setResult(fallbackResult);
        setCropNote("Using original clip: pose landmarks were not usable enough to isolate a swing.");
        setRecheckNote(null);
        setIsDemo(true);
        setStatus("complete");
        void runAIJudge(fallbackResult, videoUrl);
        void runShareCopy(fallbackResult);
      }
    } catch (error) {
      console.warn("CoachLens analysis failed", error);
      const fallbackResult = addDemoLimit(demoResult, "Real video analysis failed, so CoachLens used the sample demo result.");
      setResult(fallbackResult);
      setFrames([]);
      setCropNote("Using original clip: real analysis failed before swing cropping.");
      setRecheckNote(null);
      setIsDemo(true);
      setStatus("complete");
      void runAIJudge(fallbackResult, videoUrl);
      void runShareCopy(fallbackResult);
    }
  }

  useEffect(() => {
    if (status === "complete" && result && isDemo && aiJudgeStatus === "idle") {
      void runAIJudge(result, null);
    }
  }, [aiJudgeStatus, isDemo, result, status]);

  useEffect(() => {
    if (status === "complete" && result && result.score >= 80 && shareCopyStatus === "idle") {
      void runShareCopy(result);
    }
  }, [result, shareCopyStatus, status]);

  return (
    <main className="app-shell">
      <Hero onDemo={() => void runDemo()} />
      <UploadPanel
        file={file}
        status={status}
        uploadError={uploadError}
        onFileSelect={handleFileSelect}
        onAnalyze={() => void handleAnalyze()}
        onDemo={() => void runDemo()}
      />
      <AnalysisProgress status={status} />

      {result ? (
        <ResultCard
          result={result}
          videoUrl={croppedVideoUrl ?? videoUrl}
          frames={frames}
          isDemo={isDemo}
          swingSegment={swingSegment}
          cropNote={cropNote}
          recheckNote={recheckNote ?? result.recheckNote ?? null}
          aiJudgeStatus={aiJudgeStatus}
          aiJudgeReview={aiJudgeReview}
          shareCopyStatus={shareCopyStatus}
          shareCopy={shareCopy}
          onRetryAIReview={retryAIReview}
        />
      ) : null}

      <section className="proof-grid" aria-label="Hackathon positioning">
        <article className="proof-panel">
          <div className="proof-panel__header">
            <div className="proof-panel__icon">
              <Route size={21} />
            </div>
            <p className="mini-label">How it works</p>
          </div>
          <h2>From raw swing video to one coaching moment</h2>
          <ul>
            <li>Samples the clip at demo-safe frame rates.</li>
            <li>Uses pose landmarks for the right shoulder, elbow, wrist, hip, knee, and ankle.</li>
            <li>Converts motion into interpretable coaching signals.</li>
            <li>Returns one correction, one drill, and one Socratic question.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
