// Runs the real migrations against a real Postgres and checks the integrity rules hold
// at the database level. Set TEST_DATABASE_URL to an EMPTY throwaway database; the test
// drops and recreates its schema. Skipped when the variable isn't set.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null;
const t = url ? test : test.skip;

async function rejects(p: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(p, (e: Error) => pattern.test(e.message));
}

before(async () => {
  if (!sql) return;
  await sql.unsafe("drop schema public cascade; create schema public;");
  execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url, VERCEL: "" }, stdio: "pipe" });
});
after(async () => sql?.end());

async function expedition(isSample = false) {
  const [e] = await sql!`insert into expeditions (title, started_at, is_sample, lat, lng)
    values ('Pond loop', now(), ${isSample}, 39.7, -105.0) returning id`;
  return e.id as string;
}
async function observation(expeditionId: string, isSample = false) {
  const [o] = await sql!`insert into observations (expedition_id, observed_at, original_notes, is_sample)
    values (${expeditionId}, now(), 'Two ducks by the reeds', ${isSample}) returning id`;
  return o.id as string;
}

t("migrations are idempotent", () => {
  const out = execFileSync("node", ["scripts/migrate.mjs"], { env: { ...process.env, DATABASE_URL: url, VERCEL: "" } }).toString();
  assert.match(out, /up to date/);
});

t("locations are private by default", async () => {
  const id = await expedition();
  const [e] = await sql!`select location_public from expeditions where id = ${id}`;
  assert.equal(e.location_public, false);
});

t("original field notes are write-once", async () => {
  const o = await observation(await expedition());
  await rejects(sql!`update observations set original_notes = 'Actually three' where id = ${o}`, /write-once/);
  await sql!`update observations set behaviour = 'dabbling' where id = ${o}`; // other fields stay editable
  const [row] = await sql!`select original_notes from observations where id = ${o}`;
  assert.equal(row.original_notes, "Two ducks by the reeds");
});

t("identifications are append-only and a correction supersedes", async () => {
  const o = await observation(await expedition());
  const [first] = await sql!`insert into identifications (observation_id, name_as_given, status, identified_by)
    values (${o}, 'Mallard', 'tentative', 'keeper') returning id`;
  await rejects(sql!`update identifications set status = 'confirmed' where id = ${first.id}`, /append-only/);
  await rejects(sql!`delete from identifications where id = ${first.id}`, /append-only/);
  const [second] = await sql!`insert into identifications (observation_id, name_as_given, status, identified_by, supersedes_id)
    values (${o}, 'Gadwall', 'confirmed', 'keeper', ${first.id}) returning id`;
  const current = await sql!`select id, name_as_given from current_identifications where observation_id = ${o}`;
  assert.deepEqual(current.map((r) => r.name_as_given), ["Gadwall"]);
  assert.equal(current[0].id, second.id);
  const all = await sql!`select count(*)::int as n from identifications where observation_id = ${o}`;
  assert.equal(all[0].n, 2, "the original guess is kept");
});

t("a correction can't supersede another observation's identification", async () => {
  const e = await expedition();
  const a = await observation(e);
  const b = await observation(e);
  const [ida] = await sql!`insert into identifications (observation_id, name_as_given, status, identified_by)
    values (${a}, 'Mallard', 'tentative', 'keeper') returning id`;
  await rejects(sql!`insert into identifications (observation_id, name_as_given, status, identified_by, supersedes_id)
    values (${b}, 'Gadwall', 'confirmed', 'keeper', ${ida.id})`, /same observation/);
});

t("identification confidence is consistent", async () => {
  const o = await observation(await expedition());
  await rejects(sql!`insert into identifications (observation_id, name_as_given, status, identified_by)
    values (${o}, 'Mallard', 'unknown', 'keeper')`, /check constraint/);
  await rejects(sql!`insert into identifications (observation_id, status, identified_by)
    values (${o}, 'confirmed', 'keeper')`, /check constraint/);
  await sql!`insert into identifications (observation_id, status, identified_by) values (${o}, 'unknown', 'keeper')`;
});

t("an AI can't record a field observation", async () => {
  await rejects(sql!`insert into research_notes (author, basis, body) values ('nesthallow', 'field_observation', 'I saw a heron')`, /check constraint/);
  await sql!`insert into research_notes (author, basis, body) values ('nesthallow', 'ai_interpretation', 'The wing bar suggests a gadwall')`;
  await sql!`insert into research_notes (author, basis, body) values ('keeper', 'field_observation', 'Heard it before seeing it')`;
});

t("research notes and sources are append-only", async () => {
  const [n] = await sql!`insert into research_notes (author, basis, body) values ('nesthallow', 'literature', 'Gadwalls winter here') returning id`;
  await sql!`insert into note_sources (note_id, citation) values (${n.id}, 'Field guide, p. 42')`;
  await rejects(sql!`update research_notes set body = 'changed' where id = ${n.id}`, /append-only/);
  await rejects(sql!`update note_sources set citation = 'changed' where note_id = ${n.id}`, /append-only/);
});

t("real records are never deleted; a photo's original never changes", async () => {
  const e = await expedition();
  const o = await observation(e);
  const [m] = await sql!`insert into media (observation_id, original_key, display_key, sha256, mime, bytes)
    values (${o}, 'originals/aaaaaaaaaa.jpg', 'display/aaaaaaaaaa.jpg', ${"a".repeat(64)}, 'image/jpeg', 1000) returning id`;
  await rejects(sql!`delete from expeditions where id = ${e}`, /never deleted/);
  await rejects(sql!`delete from observations where id = ${o}`, /never deleted/);
  await rejects(sql!`delete from media where id = ${m.id}`, /never deleted/);
  await rejects(sql!`update media set original_key = 'originals/bbbbbbbbbb.jpg' where id = ${m.id}`, /never change/);
  await rejects(sql!`update media set sha256 = ${"b".repeat(64)} where id = ${m.id}`, /never change/);
  await sql!`update media set caption = 'Drake, left' where id = ${m.id}`;
  await rejects(sql!`update expeditions set is_sample = true where id = ${e}`, /cannot change/);
});

t("sample data stays separate and purges cleanly", async () => {
  const real = await expedition(false);
  await rejects(observation(real, true), /must match/);
  const e = await expedition(true);
  const o = await observation(e, true);
  const [first] = await sql!`insert into identifications (observation_id, name_as_given, status, identified_by)
    values (${o}, 'Mallard', 'tentative', 'keeper') returning id`;
  await sql!`insert into identifications (observation_id, name_as_given, status, identified_by, supersedes_id)
    values (${o}, 'Gadwall', 'confirmed', 'keeper', ${first.id})`;
  await sql!`insert into observation_notes (observation_id, author, body) values (${o}, 'keeper', 'later note')`;
  await sql!`insert into media (observation_id, original_key, display_key, sha256, mime, bytes, is_sample)
    values (${o}, 'originals/cccccccccc.jpg', 'display/cccccccccc.jpg', ${"c".repeat(64)}, 'image/jpeg', 10, true)`;
  const [n] = await sql!`insert into research_notes (observation_id, author, basis, body, is_sample)
    values (${o}, 'nesthallow', 'question', 'Why the reeds?', true) returning id`;
  await sql!`insert into note_sources (note_id, citation) values (${n.id}, 'Sample source')`;

  const realBefore = await sql!`select count(*)::int as n from expeditions where not is_sample`;
  const [{ purge_sample_data: removed }] = await sql!`select purge_sample_data()`;
  assert.ok(removed >= 8);
  const left = await sql!`select count(*)::int as n from expeditions where is_sample`;
  assert.equal(left[0].n, 0);
  const realAfter = await sql!`select count(*)::int as n from expeditions where not is_sample`;
  assert.equal(realAfter[0].n, realBefore[0].n, "real expeditions untouched");
  // Outside the purge, the guard is back on.
  await rejects(sql!`delete from expeditions where id = ${real}`, /never deleted/);
});
