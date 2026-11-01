// Nesthallow companion backend: provider-independent core.
// One request in (the Keeper's recorded question as WAV + recent history), one spoken reply out.
// Used by the Android app now; the acorn and the fox will call the same endpoint later.

import { PERSONA } from "./persona.mjs";

const OPENAI = "https://api.openai.com/v1";
const ANTHROPIC = "https://api.anthropic.com/v1";

export const config = {
  openaiAudioModel: process.env.OPENAI_AUDIO_MODEL || "gpt-audio-1.5",
  transcribeModel: process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
  ttsModel: process.env.TTS_MODEL || "gpt-4o-mini-tts",
  claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
  voice: process.env.NESTHALLOW_VOICE || "coral",
  voiceStyle:
    process.env.NESTHALLOW_VOICE_STYLE ||
    "Warm, gentle and a little playful, like a small woodland creature who adores the listener. Unhurried, never theatrical.",
  maxHistory: 12,
  maxAudioBytes: 3_000_000, // about 90 s of 16 kHz mono WAV
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- auth ----------
export function checkAuth(headers, env = process.env) {
  const expected = env.DEVICE_TOKEN;
  if (!expected || expected.length < 24) {
    throw new HttpError(500, "Server is missing DEVICE_TOKEN (set it in Vercel, at least 24 characters).");
  }
  const got = (headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(got, expected)) throw new HttpError(401, "Wrong device token.");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- request parsing ----------
export function parseTalkRequest(body) {
  if (!body || typeof body !== "object") throw new HttpError(400, "Expected a JSON body.");
  const provider = body.provider === "claude" ? "claude" : body.provider === "openai" ? "openai" : null;
  if (!provider) throw new HttpError(400, "provider must be 'openai' or 'claude'.");
  if (typeof body.audio !== "string" || body.audio.length < 100) throw new HttpError(400, "audio (base64 WAV) is missing.");
  const audio = Buffer.from(body.audio, "base64");
  if (audio.length > config.maxAudioBytes) throw new HttpError(413, "Recording is too long (90 s max).");
  if (audio.subarray(0, 4).toString("ascii") !== "RIFF") throw new HttpError(400, "audio must be a WAV file.");
  const history = Array.isArray(body.history)
    ? body.history
        .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string" && t.text.trim())
        .slice(-config.maxHistory)
        .map((t) => ({ role: t.role, text: t.text.slice(0, 2000) }))
    : [];
  return { provider, audio, history };
}

// ---------- OpenAI helpers ----------
async function openaiJson(path, payload, key) {
  const r = await fetch(`${OPENAI}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new HttpError(502, `OpenAI ${path} failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return r;
}

export async function transcribe(audio, key) {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "question.wav");
  form.append("model", config.transcribeModel);
  const r = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!r.ok) throw new HttpError(502, `Transcription failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  return (j.text || "").trim();
}

async function speak(text, key) {
  const r = await openaiJson(
    "/audio/speech",
    { model: config.ttsModel, voice: config.voice, input: text, instructions: config.voiceStyle, response_format: "wav" },
    key
  );
  return Buffer.from(await r.arrayBuffer());
}

// ---------- providers ----------
// OpenAI: one speech-to-speech call. A parallel transcription gives us the Keeper's words for history and captions.
export async function talkOpenAI({ audio, history }, env = process.env) {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new HttpError(500, "Server is missing OPENAI_API_KEY.");
  const messages = [
    { role: "system", content: PERSONA },
    ...history.map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: [{ type: "input_audio", input_audio: { data: audio.toString("base64"), format: "wav" } }] },
  ];
  const [userText, completion] = await Promise.all([
    transcribe(audio, key).catch(() => ""),
    openaiJson(
      "/chat/completions",
      {
        model: config.openaiAudioModel,
        modalities: ["text", "audio"],
        audio: { voice: config.voice, format: "wav" },
        messages,
      },
      key
    ).then((r) => r.json()),
  ]);
  const msg = completion?.choices?.[0]?.message;
  if (!msg?.audio?.data) throw new HttpError(502, "OpenAI returned no audio.");
  return { userText, replyText: (msg.audio.transcript || "").trim(), audio: Buffer.from(msg.audio.data, "base64") };
}

// Claude: speech-to-text, then Claude, then text-to-speech (same voice as the OpenAI path).
export async function talkClaude({ audio, history }, env = process.env) {
  const oaKey = env.OPENAI_API_KEY;
  const anKey = env.ANTHROPIC_API_KEY;
  if (!oaKey) throw new HttpError(500, "Server is missing OPENAI_API_KEY (used for hearing and voice).");
  if (!anKey) throw new HttpError(500, "Server is missing ANTHROPIC_API_KEY.");
  const userText = await transcribe(audio, oaKey);
  if (!userText) throw new HttpError(422, "I couldn't hear any words in that recording.");
  const messages = mergeRoles([...history.map((t) => ({ role: t.role, content: t.text })), { role: "user", content: userText }]);
  const r = await fetch(`${ANTHROPIC}/messages`, {
    method: "POST",
    headers: { "x-api-key": anKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: config.claudeModel, max_tokens: 500, system: PERSONA, messages }),
  });
  if (!r.ok) throw new HttpError(502, `Claude failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const replyText = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
  if (!replyText) throw new HttpError(502, "Claude returned no text.");
  return { userText, replyText, audio: await speak(replyText, oaKey) };
}

// Claude needs alternating roles starting with "user".
export function mergeRoles(msgs) {
  const out = [];
  for (const m of msgs) {
    if (!out.length && m.role !== "user") continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += "\n" + m.content;
    else out.push({ ...m });
  }
  return out;
}

// ---------- handler ----------
export async function handleTalk(request, env = process.env, impl = { openai: talkOpenAI, claude: talkClaude }) {
  const started = Date.now();
  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST.");
    checkAuth(request.headers, env);
    let body;
    try {
      body = await request.json();
    } catch {
      throw new HttpError(400, "Body is not valid JSON.");
    }
    const req = parseTalkRequest(body);
    const result = await impl[req.provider](req, env);
    return json(200, {
      provider: req.provider,
      userText: result.userText,
      replyText: result.replyText,
      audio: result.audio.toString("base64"),
      mime: "audio/wav",
      ms: Date.now() - started,
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(e);
    return json(status, { error: e.message || "Unknown error" });
  }
}

export function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
