import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { FileVideo, Play, UploadCloud } from "lucide-react";
import type { AnalysisStatus } from "../types";

type UploadPanelProps = {
  file: File | null;
  status: AnalysisStatus;
  uploadError: string | null;
  onFileSelect: (file: File | null) => void;
  onAnalyze: () => void;
  onDemo: () => void;
};

const SUPPORTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export function UploadPanel({
  file,
  status,
  uploadError,
  onFileSelect,
  onAnalyze,
  onDemo,
}: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isBusy = !["idle", "complete", "error"].includes(status);

  function pickFile(nextFile: File | null) {
    if (!nextFile) {
      onFileSelect(null);
      return;
    }

    if (!SUPPORTED_TYPES.includes(nextFile.type)) {
      onFileSelect(nextFile);
      return;
    }

    onFileSelect(nextFile);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    pickFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    pickFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <section className="upload-section" id="upload">
      <div className="section-heading">
        <p>Upload a forehand clip</p>
        <h2>Get one coachable fix in 20 seconds.</h2>
      </div>

      <div className="upload-grid">
        <button
          className={`upload-card ${isDragging ? "upload-card--dragging" : ""}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            onChange={handleInput}
            hidden
          />
          <div className="upload-card__icon">
            <UploadCloud size={30} />
          </div>
          <strong>{file ? file.name : "Drag and drop a tennis forehand video"}</strong>
          <span>Supported: mp4, mov, webm. Best with one right-handed player in frame.</span>
          {uploadError ? <p className="form-note form-note--warning">{uploadError}</p> : null}
        </button>

        <div className="upload-actions">
          <div>
            <p className="mini-label">Demo-safe fallback</p>
            <h3>Presentation never depends on perfect pose detection.</h3>
            <p>
              If MediaPipe fails or no video is uploaded, CoachLens Court can still show a realistic
              evidence-linked coaching moment.
            </p>
          </div>
          <div className="button-row">
            <button className="button button--primary" type="button" onClick={onAnalyze} disabled={isBusy}>
              <Play size={18} />
              Analyze
            </button>
            <button className="button button--secondary" type="button" onClick={onDemo} disabled={isBusy}>
              <FileVideo size={18} />
              Use sample demo
            </button>
          </div>
          <p className="form-note">
            Built for tennis forehands today. Same movement engine can support pickleball forehands next.
          </p>
        </div>
      </div>
    </section>
  );
}
