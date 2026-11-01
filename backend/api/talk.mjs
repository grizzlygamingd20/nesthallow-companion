import { handleTalk } from "../lib/core.mjs";

// POST /api/talk  { provider: "openai" | "claude", audio: <base64 WAV>, history: [{role, text}] }
export function POST(request) {
  return handleTalk(request);
}
