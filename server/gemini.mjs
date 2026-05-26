import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PORT = Number(process.env.COACHLENS_API_PORT ?? 8787);
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

function aiProvider() {
  return process.env.AI_PROVIDER ?? "auto";
}

function geminiModel() {
  return process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
}

function openRouterModel() {
  return process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v3.1:free";
}

function activeModel() {
  return aiProvider() === "openrouter" ? openRouterModel() : geminiModel();
}

function geminiFailure(statusCode, error) {
  if (aiProvider() === "gemini") {
    return {
      statusCode,
      payload: { error },
    };
  }

  return null;
}

async function loadLocalEnv() {
  try {
    const envText = await readFile(join(process.cwd(), ".env.local"), "utf8");
    for (const line of envText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...valueParts] = trimmed.split("=");
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  } catch {
    // Missing .env.local is fine. The endpoint returns setup guidance.
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Swing-Start, X-Swing-End, X-File-Extension",
    "Content-Type": "application/json",
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function readBinaryBody(request, maxBytes = MAX_VIDEO_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Video is too large. Keep uploads under 80 MB for this MVP."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
}

function safeExtension(value) {
  const normalized = String(value ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["mp4", "mov", "webm", "m4v"].includes(normalized)) return normalized;
  return "mp4";
}

function safeJsonParse(text) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function buildPrompt(payload) {
  return [
    "You are the AI Coach Review layer for CoachLens Court, a cautious tennis forehand micro-coach.",
    "Your job is to judge whether the pose-engine correction is visually plausible from sampled frames and measurements.",
    "Do not diagnose injury. Do not claim professional coaching accuracy. Do not pretend ball contact is exact.",
    "Use the phrases 'estimated contact window' and 'single-camera heuristic' when relevant.",
    "Return only strict JSON with this shape:",
    '{"agreement":"Agree|Uncertain|Disagree","visualRationale":"one short paragraph","saferWording":"one safer coaching sentence","confidenceNote":"one short caveat"}',
    "",
    `Pose-engine correction title: ${payload.result?.title ?? "unknown"}`,
    `Main fix: ${payload.result?.mainFix ?? "unknown"}`,
    `Why it matters: ${payload.result?.whyItMatters ?? "unknown"}`,
    `Evidence bullets: ${(payload.result?.evidence ?? []).join(" | ")}`,
    `Computed features: ${JSON.stringify(payload.result?.features ?? {})}`,
    "",
    "Judge the correction against the visual frames. If frames are blurred, occluded, or missing, choose Uncertain.",
  ].join("\n");
}

function buildSharePrompt(payload) {
  return [
    "You create short social captions for CoachLens Court tennis forehand clips.",
    "The player scored at least 80, so the copy should be upbeat and share-worthy without claiming professional accuracy.",
    "Do not mention injury, diagnosis, or exact biomechanics. Keep it sports-social, concise, and natural.",
    "Return only strict JSON with this shape:",
    '{"instagramCaption":"string","snapchatCaption":"string","highlightText":"string","hashtags":["string"],"styles":[{"style":"Hype|Athlete|Casual|Motivational","caption":"string"}]}',
    "",
    `Score: ${payload.result?.score ?? "unknown"}/100`,
    `Correction title: ${payload.result?.title ?? "unknown"}`,
    `Main fix: ${payload.result?.mainFix ?? "unknown"}`,
    `Confidence: ${payload.result?.confidence ?? "unknown"}`,
    `Evidence: ${(payload.result?.evidence ?? []).join(" | ")}`,
    "",
    "Include 4 to 7 relevant hashtags. Captions can include tasteful emoji.",
  ].join("\n");
}

async function callGemini(payload) {
  if (aiProvider() === "openrouter") {
    return callOpenRouterReview(payload, "OpenRouter selected as AI provider.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const forcedFailure = geminiFailure(
      503,
      "Gemini is not configured. Add GEMINI_API_KEY to .env.local and restart npm run dev.",
    );
    if (forcedFailure) return forcedFailure;
    return callOpenRouterReview(payload, "Gemini is not configured.");
  }

  const frameParts = (payload.frames ?? []).slice(0, 4).map((frame) => ({
    inlineData: {
      mimeType: frame.mimeType ?? "image/jpeg",
      data: frame.data,
    },
  }));

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(payload) }, ...frameParts],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const forcedFailure = geminiFailure(response.status, data.error?.message ?? "Gemini request failed.");
    if (forcedFailure) return forcedFailure;
    return callOpenRouterReview(payload, data.error?.message ?? "Gemini request failed.");
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    const forcedFailure = geminiFailure(502, "Gemini returned no text.");
    if (forcedFailure) return forcedFailure;
    return callOpenRouterReview(payload, "Gemini returned no text.");
  }

  try {
    const parsed = safeJsonParse(text);
    return {
      statusCode: 200,
      payload: {
        review: {
          agreement: parsed.agreement,
          visualRationale: parsed.visualRationale,
          saferWording: parsed.saferWording,
          confidenceNote: parsed.confidenceNote,
          model: geminiModel(),
          source: "gemini",
        },
      },
    };
  } catch {
    const forcedFailure = geminiFailure(502, "Gemini returned invalid JSON.");
    if (forcedFailure) return forcedFailure;
    return callOpenRouterReview(payload, "Gemini returned invalid JSON.");
  }
}

async function callOpenRouterReview(payload, reason = "Gemini unavailable.") {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      payload: {
        error: `${reason} OpenRouter is not configured. Add OPENROUTER_API_KEY to .env.local and restart npm run dev.`,
      },
    };
  }

  const imageParts = (payload.frames ?? []).slice(0, 4).map((frame) => ({
    type: "image_url",
    image_url: {
      url: `data:${frame.mimeType ?? "image/jpeg"};base64,${frame.data}`,
    },
  }));

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://127.0.0.1:5173",
      "X-Title": "CoachLens Court",
    },
    body: JSON.stringify({
      model: openRouterModel(),
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildPrompt(payload) }, ...imageParts],
        },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      statusCode: response.status,
      payload: {
        error: data.error?.message ?? `${reason} OpenRouter request failed.`,
      },
    };
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    return {
      statusCode: 502,
      payload: { error: `${reason} OpenRouter returned no text.` },
    };
  }

  try {
    const parsed = safeJsonParse(text);
    return {
      statusCode: 200,
      payload: {
        review: {
          agreement: parsed.agreement,
          visualRationale: parsed.visualRationale,
          saferWording: parsed.saferWording,
          confidenceNote: parsed.confidenceNote,
          model: openRouterModel(),
          source: "openrouter",
        },
      },
    };
  } catch {
    return {
      statusCode: 502,
      payload: { error: `${reason} OpenRouter returned invalid JSON.` },
    };
  }
}

function fallbackShareCopy(payload) {
  const score = payload.result?.score ?? 80;
  return {
    instagramCaption: `Clean swing check: ${score}/100. Smooth timing, better spacing, and one rep closer.`,
    snapchatCaption: "This swing deserves the story.",
    highlightText: "Smooth timing. Clean contact. Great follow-through.",
    hashtags: ["#CoachLensCourt", "#Tennis", "#Forehand", "#SwingCheck", "#TennisTraining"],
    styles: [
      { style: "Hype", caption: "Locked in. This one felt clean." },
      { style: "Athlete", caption: "Working on consistency one swing at a time." },
      { style: "Casual", caption: "Forehand check passed. We take those." },
      { style: "Motivational", caption: "Hours of practice paying off, one swing at a time." },
    ],
    model: "local-fallback",
    source: "fallback",
  };
}

async function callGeminiShareCopy(payload) {
  if (aiProvider() === "openrouter") {
    return callOpenRouterShareCopy(payload);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (aiProvider() === "gemini") {
      return {
        statusCode: 200,
        payload: { shareCopy: fallbackShareCopy(payload) },
      };
    }
    return callOpenRouterShareCopy(payload);
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildSharePrompt(payload) }],
        },
      ],
      generationConfig: {
        temperature: 0.75,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    if (aiProvider() === "gemini") {
      return {
        statusCode: 200,
        payload: { shareCopy: fallbackShareCopy(payload) },
      };
    }
    return callOpenRouterShareCopy(payload);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) {
    if (aiProvider() === "gemini") {
      return {
        statusCode: 200,
        payload: { shareCopy: fallbackShareCopy(payload) },
      };
    }
    return callOpenRouterShareCopy(payload);
  }

  try {
    const parsed = safeJsonParse(text);
    return {
      statusCode: 200,
      payload: {
        shareCopy: {
          instagramCaption: parsed.instagramCaption,
          snapchatCaption: parsed.snapchatCaption,
          highlightText: parsed.highlightText,
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 8) : fallbackShareCopy(payload).hashtags,
          styles: Array.isArray(parsed.styles) ? parsed.styles.slice(0, 4) : fallbackShareCopy(payload).styles,
          model: geminiModel(),
          source: "gemini",
        },
      },
    };
  } catch {
    if (aiProvider() === "gemini") {
      return {
        statusCode: 200,
        payload: { shareCopy: fallbackShareCopy(payload) },
      };
    }
    return callOpenRouterShareCopy(payload);
  }
}

async function callOpenRouterShareCopy(payload) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      payload: { shareCopy: fallbackShareCopy(payload) },
    };
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://127.0.0.1:5173",
      "X-Title": "CoachLens Court",
    },
    body: JSON.stringify({
      model: openRouterModel(),
      messages: [
        {
          role: "user",
          content: buildSharePrompt(payload),
        },
      ],
      temperature: 0.75,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return {
      statusCode: 200,
      payload: { shareCopy: fallbackShareCopy(payload) },
    };
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    return {
      statusCode: 200,
      payload: { shareCopy: fallbackShareCopy(payload) },
    };
  }

  try {
    const parsed = safeJsonParse(text);
    return {
      statusCode: 200,
      payload: {
        shareCopy: {
          instagramCaption: parsed.instagramCaption,
          snapchatCaption: parsed.snapchatCaption,
          highlightText: parsed.highlightText,
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 8) : fallbackShareCopy(payload).hashtags,
          styles: Array.isArray(parsed.styles) ? parsed.styles.slice(0, 4) : fallbackShareCopy(payload).styles,
          model: openRouterModel(),
          source: "openrouter",
        },
      },
    };
  } catch {
    return {
      statusCode: 200,
      payload: { shareCopy: fallbackShareCopy(payload) },
    };
  }
}

await loadLocalEnv();

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      openrouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
      aiProvider: aiProvider(),
      model: activeModel(),
      geminiModel: geminiModel(),
      openrouterModel: openRouterModel(),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/trim-swing") {
    let workspace = "";
    try {
      const start = Number(request.headers["x-swing-start"]);
      const end = Number(request.headers["x-swing-end"]);
      const extension = safeExtension(request.headers["x-file-extension"]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        sendJson(response, 400, { error: "Invalid swing timestamps." });
        return;
      }

      const videoBuffer = await readBinaryBody(request);
      workspace = await mkdtemp(join(tmpdir(), "coachlens-trim-"));
      const inputPath = join(workspace, `input.${extension}`);
      const outputPath = join(workspace, "swing-clip.mp4");
      await writeFile(inputPath, videoBuffer);

      await runCommand(ffmpegPath(), [
        "-y",
        "-ss",
        Math.max(0, start).toFixed(3),
        "-i",
        inputPath,
        "-t",
        Math.max(0.2, end - start).toFixed(3),
        "-movflags",
        "+faststart",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        outputPath,
      ]);

      response.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Swing-Start, X-Swing-End, X-File-Extension",
        "Content-Type": "video/mp4",
      });
      createReadStream(outputPath)
        .on("close", () => {
          if (workspace) void rm(workspace, { recursive: true, force: true });
        })
        .pipe(response);
    } catch (error) {
      if (workspace) void rm(workspace, { recursive: true, force: true });
      sendJson(response, 500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to trim video. Install FFmpeg or use the original clip fallback.",
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/api/share-copy") {
    try {
      const body = await readJsonBody(request);
      const result = await callGeminiShareCopy(body);
      sendJson(response, result.statusCode, result.payload);
    } catch (error) {
      sendJson(response, 200, {
        shareCopy: fallbackShareCopy({}),
        warning: error instanceof Error ? error.message : "Share copy fallback used.",
      });
    }
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/coach-review") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const result = await callGemini(body);
    sendJson(response, result.statusCode, result.payload);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `CoachLens AI proxy could not start because http://127.0.0.1:${PORT} is already in use.`,
    );
    console.error("Stop the existing dev server or run: lsof -ti tcp:8787 | xargs kill");
    process.exit(1);
  }

  throw error;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`CoachLens AI proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`AI provider: ${aiProvider()}`);
  console.log(`Active model: ${activeModel()}`);
});
