// Photo handling. The original is kept byte for byte (with its EXIF, GPS included) in
// private storage. Only the display copy is ever shown, and it carries no metadata at all.
// No framework imports, so this is unit-tested directly.

import { createHash } from "node:crypto";
import sharp from "sharp";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedType = (typeof ACCEPTED_TYPES)[number];
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const DISPLAY_MAX_EDGE = 1600;

export function isAcceptedType(t: string): t is AcceptedType {
  return (ACCEPTED_TYPES as readonly string[]).includes(t);
}

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Where a new original goes. Random, so names never collide and never reveal content. */
export function originalPathname(type: AcceptedType, random: string): string {
  const ext = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
  return `originals/${random}.${ext}`;
}

export function isOriginalPathname(p: string): boolean {
  return /^originals\/[A-Za-z0-9_-]{8,}\.(jpg|png|webp)$/.test(p);
}

export type DisplayCopy = { data: Buffer; width: number; height: number; type: "image/jpeg" };

/**
 * Makes the shareable copy: turned upright using the camera's orientation tag, shrunk to
 * fit 1600 px, re-encoded as JPEG. sharp writes no EXIF, ICC comments or GPS unless asked,
 * so the copy carries no location.
 */
export async function makeDisplayCopy(original: Uint8Array): Promise<DisplayCopy> {
  const { data, info } = await sharp(original, { failOn: "error" })
    .rotate()
    .resize({ width: DISPLAY_MAX_EDGE, height: DISPLAY_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, type: "image/jpeg" };
}
