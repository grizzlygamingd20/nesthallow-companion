import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleTalk, talkOpenAI, talkClaude, mergeRoles } from "../lib/core.mjs";

const TOKEN = "t".repeat(32);
const ENV = { DEVICE_TOKEN: TOKEN, OPENAI_API_KEY: "sk-test", ANTHROPIC_API_KEY: "ak-test" };

function wav(n = 400) {
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0, "ascii");
  b.write("WAVE", 8, "ascii");
  return b;
}
function req(body, token = TOKEN, method = "POST") {
  return new Request("https://x/api/talk", {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

let calls;
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.endsWith("/audio/transcriptions")) return Response.json({ text: "What moth is this?" });
    if (u.endsWith("/chat/completions")) {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.modalities, ["text", "audio"]);
      assert.equal(body.messages[0].role, "system");
      assert.equal(body.messages.at(-1).content[0].type, "input_audio");
      return Response.json({ choices: [{ message: { audio: { data: wav().toString("base64"), transcript: "A luna moth!" } } }] });
    }
    if (u.endsWith("/messages")) {
      const body = JSON.parse(init.body);
      assert.equal(init.headers["x-api-key"], "ak-test");
      assert.equal(body.messages[0].role, "user");
      return Response.json({ content: [{ type: "text", text: "A luna moth, Keeper." }] });
    }
    if (u.endsWith("/audio/speech")) {
      const body = JSON.parse(init.body);
      assert.equal(body.response_format, "wav");
      return new Response(wav());
    }
    throw new Error("unexpected url " + u);
  };
});

test("rejects a wrong token", async () => {
  const r = await handleTalk(req({ provider: "openai", audio: wav().toString("base64") }, "x".repeat(32)), ENV);
  assert.equal(r.status, 401);
});

test("rejects a non-WAV payload", async () => {
  const r = await handleTalk(req({ provider: "openai", audio: Buffer.alloc(300).toString("base64") }), ENV);
  assert.equal(r.status, 400);
});

test("openai path returns audio, reply and the Keeper's words", async () => {
  const r = await handleTalk(req({ provider: "openai", audio: wav().toString("base64"), history: [{ role: "assistant", text: "hi" }] }), ENV);
  const j = await r.json();
  assert.equal(r.status, 200, j.error);
  assert.equal(j.replyText, "A luna moth!");
  assert.equal(j.userText, "What moth is this?");
  assert.ok(Buffer.from(j.audio, "base64").subarray(0, 4).toString() === "RIFF");
});

test("claude path chains transcribe, Claude, speech", async () => {
  const r = await handleTalk(req({ provider: "claude", audio: wav().toString("base64"), history: [{ role: "assistant", text: "hello" }, { role: "user", text: "hey" }] }), ENV);
  const j = await r.json();
  assert.equal(r.status, 200, j.error);
  assert.equal(j.replyText, "A luna moth, Keeper.");
  assert.deepEqual(calls.map((c) => c.url.split("/").slice(-2).join("/")), ["audio/transcriptions", "v1/messages", "audio/speech"]);
});

test("mergeRoles drops a leading assistant turn and merges repeats", () => {
  const m = mergeRoles([
    { role: "assistant", content: "a" },
    { role: "user", content: "b" },
    { role: "user", content: "c" },
  ]);
  assert.deepEqual(m, [{ role: "user", content: "b\nc" }]);
});
