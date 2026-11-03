import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { ACCEPTED_TYPES, MAX_PHOTO_BYTES, isOriginalPathname } from "@/lib/media";
import { ApiError, jsonError, requireKeeperApi } from "@/lib/session";

// POST /api/v1/media/upload: hands the signed-in Keeper's browser a short-lived token to
// upload one original photo straight to private storage. Phone photos are larger than a
// Vercel function accepts, so the bytes skip the server; /api/v1/media then registers them.
export async function POST(request: Request) {
  try {
    await requireKeeperApi();
    const body = (await request.json()) as HandleUploadBody;
    if (body.type !== "blob.generate-client-token") throw new ApiError(400, "Unexpected upload request.");
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isOriginalPathname(pathname)) throw new ApiError(400, "Bad photo name.");
        return {
          allowedContentTypes: [...ACCEPTED_TYPES],
          maximumSizeInBytes: MAX_PHOTO_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
