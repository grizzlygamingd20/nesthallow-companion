import sharp from "sharp";
import { db } from "@/lib/db";
import { isAcceptedType, isOriginalPathname, makeDisplayCopy, sha256Hex } from "@/lib/media";
import { readPrivateBytes, writePrivate } from "@/lib/storage";
import { ApiError, jsonError, requireKeeperApi } from "@/lib/session";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMAT_TO_TYPE: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

type RegisterBody = { pathname?: string; observationId?: string; expeditionId?: string; caption?: string };

// POST /api/v1/media: registers an uploaded original. Hashes it, makes the metadata-free
// display copy, and links both to an observation or expedition. The original is never altered.
export async function POST(request: Request) {
  try {
    await requireKeeperApi();
    const body = (await request.json().catch(() => null)) as RegisterBody | null;
    if (!body || typeof body.pathname !== "string" || !isOriginalPathname(body.pathname)) {
      throw new ApiError(400, "pathname must be an uploaded original (originals/…).");
    }
    const observationId = body.observationId && UUID.test(body.observationId) ? body.observationId : null;
    const expeditionId = body.expeditionId && UUID.test(body.expeditionId) ? body.expeditionId : null;
    if (!observationId && !expeditionId) throw new ApiError(400, "Link the photo to an observation or an expedition.");
    const caption = typeof body.caption === "string" && body.caption.trim() ? body.caption.trim().slice(0, 2000) : null;

    const sql = db();
    // A photo belongs to the same world as its parent: sample photos only on sample records.
    const parent = observationId
      ? await sql`select is_sample, expedition_id from observations where id = ${observationId}`
      : await sql`select is_sample, id as expedition_id from expeditions where id = ${expeditionId}`;
    if (!parent.length) throw new ApiError(404, "That observation or expedition doesn't exist.");

    const existing = await sql`select id from media where original_key = ${body.pathname}`;
    if (existing.length) return Response.json({ id: existing[0].id, alreadyRegistered: true });

    const original = await readPrivateBytes(body.pathname);
    if (!original) throw new ApiError(404, "The uploaded photo wasn't found in storage.");

    // Trust the bytes, not the browser's label.
    const meta = await sharp(original).metadata().catch(() => null);
    const mime = meta?.format ? FORMAT_TO_TYPE[meta.format] : undefined;
    if (!mime || !isAcceptedType(mime)) throw new ApiError(415, "That file isn't a JPEG, PNG or WebP photo.");

    const sha256 = sha256Hex(original);
    const display = await makeDisplayCopy(original);
    const displayKey = await writePrivate(
      body.pathname.replace(/^originals\//, "display/").replace(/\.\w+$/, ".jpg"),
      display.data,
      display.type,
    );

    const [row] = await sql`
      insert into media (observation_id, expedition_id, original_key, display_key, sha256, mime, bytes,
                         width, height, caption, is_sample)
      values (${observationId}, ${observationId ? null : expeditionId}, ${body.pathname}, ${displayKey},
              ${sha256}, ${mime}, ${original.byteLength}, ${display.width}, ${display.height}, ${caption},
              ${parent[0].is_sample})
      returning id, created_at`;
    return Response.json({ id: row.id, sha256, width: display.width, height: display.height }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
