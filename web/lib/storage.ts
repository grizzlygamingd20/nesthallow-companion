import "server-only";
import { get, put } from "@vercel/blob";

// Every photo lives in a PRIVATE Vercel Blob store: no file has a public URL.
// Reads go through /api/v1/media/[id], which checks the Keeper's sign-in first.

export async function readPrivate(pathname: string): Promise<{ stream: ReadableStream<Uint8Array>; type: string; size: number } | null> {
  const r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200) return null;
  return { stream: r.stream, type: r.blob.contentType, size: r.blob.size };
}

export async function readPrivateBytes(pathname: string): Promise<Uint8Array | null> {
  const r = await readPrivate(pathname);
  if (!r) return null;
  return new Uint8Array(await new Response(r.stream).arrayBuffer());
}

export async function writePrivate(pathname: string, data: Buffer, contentType: string): Promise<string> {
  const r = await put(pathname, data, { access: "private", contentType, addRandomSuffix: false });
  return r.pathname;
}
