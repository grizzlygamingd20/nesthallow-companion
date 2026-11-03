import "server-only";
import postgres from "postgres";

let client: postgres.Sql | null = null;

/** The Naturalist's only database connection. Only API routes and server pages call this. */
export function db(): postgres.Sql {
  if (client) return client;
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL is not set. Connect the Neon database in Vercel.");
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  client = postgres(url, { max: 3, ssl: local ? false : "require", prepare: false, idle_timeout: 20 });
  return client;
}
