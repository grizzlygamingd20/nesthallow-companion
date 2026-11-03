import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { isOriginalPathname, makeDisplayCopy, originalPathname, sha256Hex } from "../lib/media.ts";

// A 3000 x 2000 JPEG carrying camera EXIF with a GPS position, like a phone photo.
async function phonePhoto() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 140, b: 100 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "TestPhone", Model: "Field 1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "39/1 44/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "104/1 59/1 0/1" },
    })
    .toBuffer();
}

test("the test photo really carries GPS (so the next test means something)", async () => {
  const meta = await sharp(await phonePhoto()).metadata();
  assert.ok(meta.exif && meta.exif.length > 0);
  assert.match(meta.exif.toString("latin1"), /TestPhone/);
});

test("display copy has no metadata and fits 1600 px", async () => {
  const original = await phonePhoto();
  const copy = await makeDisplayCopy(original);
  const meta = await sharp(copy.data).metadata();
  assert.equal(meta.exif, undefined, "no EXIF (so no GPS) in the display copy");
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.iptc, undefined);
  assert.equal(meta.format, "jpeg");
  assert.equal(Math.max(copy.width, copy.height), 1600);
  assert.equal(copy.width, 1600);
  assert.equal(copy.height, 1067);
});

test("making the display copy never changes the original", async () => {
  const original = await phonePhoto();
  const before = sha256Hex(original);
  await makeDisplayCopy(original);
  assert.equal(sha256Hex(original), before);
});

test("small photos are not enlarged", async () => {
  const small = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#fff" } }).png().toBuffer();
  const copy = await makeDisplayCopy(small);
  assert.deepEqual([copy.width, copy.height], [400, 300]);
});

test("not a photo is rejected", async () => {
  await assert.rejects(makeDisplayCopy(Buffer.from("definitely not an image")));
});

test("upload names: only random originals/ paths are accepted", () => {
  const p = originalPathname("image/jpeg", "3f2a9c1e5b7d4e8a");
  assert.equal(p, "originals/3f2a9c1e5b7d4e8a.jpg");
  assert.ok(isOriginalPathname(p));
  for (const bad of ["display/abcdefgh.jpg", "originals/../x.jpg", "originals/short.jpg", "originals/abcdefgh.gif", "/originals/abcdefgh.jpg"]) {
    assert.equal(isOriginalPathname(bad), false, bad);
  }
});
