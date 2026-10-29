'use strict';

// Every photo an iPhone takes is HEIF with an HEVC payload.
//
// sharp's prebuilt binary reads the HEIF *container* — metadata comes back
// looking healthy — but carries no HEVC decoder, so the decode dies with
// "Support for this compression format has not been built in: HEVC
// (libde265)" and a run of "source: bad seek" lines. That reached a pilot as
// a red banner on the Scan screen.
//
// The fixture is a real HEVC-in-HEIF file, not a renamed JPEG: a renamed JPEG
// would decode happily in sharp and test nothing.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { prepareScanImage, toDecodable } = require('../imagePrep');

const HEIC = fs.readFileSync(path.join(__dirname, 'fixtures/iphone-photo.heic'));
const JPEG = fs.readFileSync(path.join(__dirname, 'fixtures/photo.jpg'));

test('the fixture really is HEVC inside HEIF', async () => {
  // ftyp brand near the start of the file.
  assert.match(HEIC.subarray(0, 32).toString('latin1'), /heic|heix|hevc|mif1/);
  const meta = await sharp(HEIC).metadata();
  assert.strictEqual(meta.format, 'heif', 'sharp should still recognise the container');
});

test('sharp alone cannot decode it — this is the bug', async () => {
  await assert.rejects(
    () => sharp(HEIC).rotate().toBuffer(),
    (err) => /bad seek|libde265|compression format|heif/i.test(err.message),
    'if this stops throwing, sharp gained an HEVC decoder and the fallback can go',
  );
});

test('toDecodable turns it into something sharp can read', async () => {
  const out = await toDecodable(HEIC);
  const meta = await sharp(out).metadata();
  assert.strictEqual(meta.format, 'jpeg');
  assert.strictEqual(meta.width, 1400);
  assert.strictEqual(meta.height, 1000);
});

test('and a JPEG is passed straight through, byte for byte', async () => {
  const out = await toDecodable(JPEG);
  assert.ok(out.equals(JPEG), 'the common path must not pay for the fallback');
});

test('prepareScanImage accepts an iPhone photo end to end', async () => {
  const prep = await prepareScanImage(HEIC, 'image/heic');
  assert.strictEqual(prep.mimeType, 'image/jpeg');
  assert.ok(prep.width > 0 && prep.height > 0);
  assert.ok(prep.buffer.length > 0);
  // And the result is a real JPEG, not a buffer we merely labelled one.
  assert.strictEqual((await sharp(prep.buffer).metadata()).format, 'jpeg');
});

test('a PDF is still passed through untouched', async () => {
  const pdf = Buffer.from('%PDF-1.4 not really a pdf');
  const prep = await prepareScanImage(pdf, 'application/pdf');
  assert.strictEqual(prep.mimeType, 'application/pdf');
  assert.ok(prep.buffer.equals(pdf));
});

test('a file that is not an image at all still throws, for the caller to catch', async () => {
  await assert.rejects(() => prepareScanImage(Buffer.from('this is not an image'), 'image/jpeg'));
});
