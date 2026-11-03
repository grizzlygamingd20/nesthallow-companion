import { db } from "@/lib/db";
import { jsonError, requireKeeperApi } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/v1/health: what's connected. Reports whether things are configured, never secrets.
export async function GET() {
  try {
    await requireKeeperApi();
    let database: { ok: boolean; migrations?: string[]; error?: string };
    try {
      const rows = await db()`select name from schema_migrations order by name`;
      database = { ok: true, migrations: rows.map((r) => r.name as string) };
    } catch (e) {
      database = { ok: false, error: (e as Error).message };
    }
    return Response.json({
      ok: database.ok,
      database,
      photoStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    });
  } catch (e) {
    return jsonError(e);
  }
}
