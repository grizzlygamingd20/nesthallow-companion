// Applies migrations/*.sql in name order, once each, inside a transaction.
// Runs before every `next build`, so a preview deployment always has the schema it expects.
//
// No DATABASE_URL: skipped locally (so `npm run build` works offline), but a build on
// Vercel without a database fails loudly rather than deploying a broken app.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const url = (process.env.DATABASE_URL || "").trim();

if (!url) {
  if (process.env.VERCEL) {
    console.error("migrate: DATABASE_URL is not set. Connect the Neon database to this Vercel project.");
    process.exit(1);
  }
  console.log("migrate: no DATABASE_URL, skipping (local build).");
  process.exit(0);
}

const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url) || url.includes("host=/");
const sql = postgres(url, { max: 1, ssl: local ? false : "require", onnotice: () => {} });

try {
  // One migrator at a time, even if two preview builds start together.
  await sql`select pg_advisory_lock(727274)`;
  await sql`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const name of files) {
    if (done.has(name)) continue;
    const text = await readFile(path.join(dir, name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    console.log(`migrate: applied ${name}`);
    applied++;
  }
  console.log(applied ? `migrate: ${applied} applied.` : "migrate: schema is up to date.");
} catch (e) {
  console.error("migrate: failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql`select pg_advisory_unlock(727274)`.catch(() => {});
  await sql.end();
}
