import { db } from "@/lib/db";
import { readPrivate } from "@/lib/storage";
import { ApiError, jsonError, requireKeeperApi } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/v1/media/:id            → the display copy (no metadata)
// GET /api/v1/media/:id?original=1 → the untouched original, GPS and all. Keeper only.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireKeeperApi();
    const { id } = await ctx.params;
    if (!UUID.test(id)) throw new ApiError(404, "No such photo.");
    const wantOriginal = new URL(request.url).searchParams.get("original") === "1";
    const rows = await db()`select original_key, display_key, mime from media where id = ${id}`;
    if (!rows.length) throw new ApiError(404, "No such photo.");
    const key = (wantOriginal ? rows[0].original_key : rows[0].display_key) as string;
    const file = await readPrivate(key);
    if (!file) throw new ApiError(404, "The photo file is missing from storage.");
    return new Response(file.stream, {
      headers: {
        "content-type": wantOriginal ? (rows[0].mime as string) : "image/jpeg",
        "content-length": String(file.size),
        // Private: the browser may keep it, shared caches may not.
        "cache-control": "private, max-age=86400",
        ...(wantOriginal ? { "content-disposition": `attachment; filename="${key.split("/").pop()}"` } : {}),
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
