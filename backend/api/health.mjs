import { checkAuth, config, json, HttpError } from "../lib/core.mjs";

// GET /api/health  - the app's "Test connection" button. Reports which keys are configured, never their values.
export function GET(request) {
  try {
    checkAuth(request.headers);
    return json(200, {
      ok: true,
      openai: Boolean(process.env.OPENAI_API_KEY),
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      models: { openai: config.openaiAudioModel, claude: config.claudeModel, voice: config.voice },
    });
  } catch (e) {
    return json(e instanceof HttpError ? e.status : 500, { ok: false, error: e.message });
  }
}
