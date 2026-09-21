const prisma = require('../config/database');
const { imageSize } = require('image-size');

// HEIC/HEIF (iPhone/Mac default) is accepted too — Uploadcare converts it to
// JPEG on delivery (the `/-/format/jpeg/` op below), which @react-pdf needs.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// ISO-BMFF (HEIC/HEIF) brands that appear right after the `ftyp` box marker.
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif']);

function detectMime(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  // HEIC/HEIF: bytes 4–7 are 'ftyp', bytes 8–11 are the major brand.
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (HEIF_BRANDS.has(brand)) return 'image/heif';
  }
  return null;
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// Resolve THIS project's CDN host. Newer Uploadcare projects deliver from a
// dedicated domain (e.g. abc123.ucarecd.net), NOT the shared ucarecdn.com —
// hitting the wrong host 404s every file. The REST file-info's original_file_url
// carries the correct host, so we read it once per upload (env override +
// ucarecdn.com fallback for older projects).
async function resolveCdnHost(uuid) {
  if (process.env.UPLOADCARE_CDN_HOST) return process.env.UPLOADCARE_CDN_HOST;
  try {
    const info = await fetch(`https://api.uploadcare.com/files/${uuid}/`, {
      headers: {
        Authorization: `Uploadcare.Simple ${process.env.UPLOADCARE_PUBLIC_KEY}:${process.env.UPLOADCARE_SECRET_KEY}`,
        Accept: 'application/vnd.uploadcare-v0.7+json',
      },
    });
    if (info.ok) {
      const j = await info.json();
      const m = String(j.original_file_url || '').match(/^https?:\/\/([^/]+)\//);
      if (m) return m[1];
    }
  } catch { /* fall through to default */ }
  return 'ucarecdn.com';
}

async function uploadToUploadcare(buffer, mime) {
  const form = new FormData();
  form.append('UPLOADCARE_PUB_KEY', process.env.UPLOADCARE_PUBLIC_KEY);
  form.append('UPLOADCARE_STORE', '1');
  form.append('file', new Blob([buffer], { type: mime }), 'photo.jpg');

  const res = await fetch('https://upload.uploadcare.com/base/', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Uploadcare upload failed: ${res.status}`);
  const data = await res.json();
  if (!data.file) throw new Error('No UUID in Uploadcare response');
  const host = await resolveCdnHost(data.file);
  // /-/format/jpeg/ ensures JPEG output — required by @react-pdf/renderer and
  // it converts HEIC/WebP too. (strip_meta isn't available on this plan.)
  return `https://${host}/${data.file}/-/format/jpeg/`;
}

async function deleteFromUploadcare(url) {
  const m = url.match(UUID_RE); // host-agnostic — matches ucarecdn.com AND project CDN domains
  if (!m) return;
  await fetch(`https://api.uploadcare.com/files/${m[1]}/`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Uploadcare.Simple ${process.env.UPLOADCARE_PUBLIC_KEY}:${process.env.UPLOADCARE_SECRET_KEY}`,
      'Accept': 'application/vnd.uploadcare-v0.7+json',
    },
  });
}

// GET /cv — aggregate all data needed to build a CV
exports.getCvData = async (req, res, next) => {
  try {
    const pilotId = req.pilot.id;

    const now = Date.now();
    const d90  = new Date(now - 90  * 86400000);
    const d12m = new Date(now - 365 * 86400000);

    const [
      pilot, certificates, ratings, medicals,
      training, rtw, cvData, logAgg, aircraftRows,
      rec90, rec12m,
    ] = await Promise.all([
      prisma.pilot.findUnique({ where: { id: pilotId } }),
      prisma.pilotCertificate.findMany({ where: { pilotId }, orderBy: { issueDate: 'desc' } }),
      prisma.pilotRating.findMany({ where: { pilotId } }),
      prisma.pilotMedical.findMany({ where: { pilotId }, orderBy: { expiryDate: 'desc' } }),
      prisma.pilotTrainingRecord.findMany({ where: { pilotId }, orderBy: { completedAt: 'desc' } }),
      prisma.pilotRightToWork.findMany({ where: { pilotId } }),
      prisma.cvData.findUnique({ where: { pilotId } }),
      prisma.flightLog.aggregate({
        where: { pilotId },
        _sum: {
          totalTime: true, picTime: true, sicTime: true,
          multiEngineTime: true, turbineTime: true, jetTime: true,
          instrumentTime: true, instrumentActualTime: true, instrumentSimTime: true,
          crossCountryTime: true, nightTime: true,
          landingsDay: true, landingsNight: true,
        },
      }),
      prisma.flightLog.groupBy({
        by: ['aircraftType'],
        where: { pilotId, aircraftType: { not: '' } },
        _sum: { totalTime: true },
        orderBy: { _sum: { totalTime: 'desc' } },
        take: 20,
      }),
      prisma.flightLog.aggregate({
        where: { pilotId, date: { gte: d90 } },
        _sum: { totalTime: true, landingsDay: true, landingsNight: true },
        _count: { _all: true },
      }),
      prisma.flightLog.aggregate({
        where: { pilotId, date: { gte: d12m } },
        _sum: { totalTime: true },
      }),
    ]);

    const { passwordHash, fcmToken, ...safePilot } = pilot;

    // pilot.carryForward is null when never set (migration sentinel — see profileController).
    // Add to all-time totals only; recency (rec90/rec12m) stays pure DB because
    // carry-forward has no date and cannot be bucketed into a time window.
    const cf = pilot.carryForward ?? {};

    const totals = {
      totalTime:            (logAgg._sum.totalTime            ?? 0) + (cf.totalTime            ?? 0),
      picTime:              (logAgg._sum.picTime              ?? 0) + (cf.picTime              ?? 0),
      sicTime:              (logAgg._sum.sicTime              ?? 0) + (cf.sicTime              ?? 0),
      multiEngineTime:      (logAgg._sum.multiEngineTime      ?? 0) + (cf.multiEngineTime      ?? 0),
      turbineTime:          (logAgg._sum.turbineTime          ?? 0) + (cf.turbineTime          ?? 0),
      jetTime:              (logAgg._sum.jetTime              ?? 0) + (cf.jetTime              ?? 0),
      instrumentTime:       (logAgg._sum.instrumentTime       ?? 0) + (cf.instrumentTime       ?? 0),
      instrumentActualTime: (logAgg._sum.instrumentActualTime ?? 0) + (cf.instrumentActualTime ?? 0),
      instrumentSimTime:    (logAgg._sum.instrumentSimTime    ?? 0) + (cf.instrumentSimTime    ?? 0),
      crossCountryTime:     (logAgg._sum.crossCountryTime     ?? 0) + (cf.crossCountryTime     ?? 0),
      nightTime:            (logAgg._sum.nightTime            ?? 0) + (cf.nightTime            ?? 0),
      landingsDay:          (logAgg._sum.landingsDay          ?? 0) + (cf.landingsDay          ?? 0),
      landingsNight:        (logAgg._sum.landingsNight        ?? 0) + (cf.landingsNight        ?? 0),
    };

    const recency = {
      hours90d:      rec90._sum.totalTime    ?? 0,
      landingsDay90: rec90._sum.landingsDay  ?? 0,
      landingsNight90: rec90._sum.landingsNight ?? 0,
      sectors90:     rec90._count._all       ?? 0,
      hours12m:      rec12m._sum.totalTime   ?? 0,
    };

    res.json({
      pilot: safePilot,
      certificates,
      ratings,
      medicals,
      training,
      rtw,
      totals,
      recency,
      aircraftTypes: aircraftRows.map(r => ({ type: r.aircraftType, hours: r._sum.totalTime ?? 0 })),
      cv: cvData ?? { education: [], languages: [], skills: [], other: [], typeRatings: [], licenses: [], medical: null, icaoEnglish: null, accentColor: '#0D1E35', summary: null },
    });
  } catch (err) {
    next(err);
  }
};

// PUT /cv — upsert user-entered CV fields
exports.updateCvData = async (req, res, next) => {
  try {
    const { education, languages, skills, other, typeRatings, licenses, medical, icaoEnglish, accentColor, summary } = req.body;
    const cvData = await prisma.cvData.upsert({
      where:  { pilotId: req.pilot.id },
      create: {
        pilotId: req.pilot.id,
        education: education ?? [], languages: languages ?? [],
        skills: skills ?? [], other: other ?? [],
        typeRatings: typeRatings ?? [], licenses: licenses ?? [],
        medical: medical ?? undefined, icaoEnglish: icaoEnglish ?? undefined,
        accentColor: accentColor ?? '#0D1E35',
        summary: summary ?? undefined,
      },
      update: { education, languages, skills, other, typeRatings, licenses, medical, icaoEnglish, accentColor, summary },
    });
    res.json(cvData);
  } catch (err) {
    next(err);
  }
};

// POST /cv/photo — upload headshot
exports.uploadPhoto = async (req, res, next) => {
  try {
    const pilotId = req.pilot.id;
    const buffer  = req.file?.buffer;
    if (!buffer) return res.status(400).json({ error: 'No file provided' });

    const mime = detectMime(buffer);
    if (!ALLOWED_MIME.has(mime)) {
      return res.status(400).json({ error: 'File must be JPEG, PNG, or WebP' });
    }

    // Dimension guard. When we can read dimensions, enforce a 200×200 floor.
    // HEIC dims aren't always readable here — Uploadcare validates + resizes it,
    // so we let a dimension-less HEIC through rather than falsely rejecting it.
    let dims = null;
    try { dims = imageSize(buffer); } catch { dims = null; }
    if (dims && (dims.width < 200 || dims.height < 200)) {
      return res.status(400).json({ error: 'Image must be at least 200×200 pixels' });
    }
    if (!dims && mime !== 'image/heic' && mime !== 'image/heif') {
      return res.status(400).json({ error: "Couldn't read that image — please try a JPEG or PNG." });
    }

    const existing = await prisma.cvData.findUnique({ where: { pilotId }, select: { photoUrl: true } });

    let photoUrl;
    try {
      photoUrl = await uploadToUploadcare(buffer, mime);
    } catch {
      return res.status(502).json({ error: 'Photo upload failed — please try again' });
    }

    if (existing?.photoUrl) {
      deleteFromUploadcare(existing.photoUrl).catch(() => {});
    }

    const cvData = await prisma.cvData.upsert({
      where:  { pilotId },
      create: { pilotId, photoUrl },
      update: { photoUrl },
    });

    res.json({ photoUrl: cvData.photoUrl });
  } catch (err) {
    next(err);
  }
};

// DELETE /cv/photo — remove headshot
exports.deletePhoto = async (req, res, next) => {
  try {
    const pilotId = req.pilot.id;
    const existing = await prisma.cvData.findUnique({ where: { pilotId }, select: { photoUrl: true } });
    if (!existing?.photoUrl) return res.status(404).json({ error: 'No photo to delete' });

    try { await deleteFromUploadcare(existing.photoUrl); } catch { /* non-fatal */ }

    await prisma.cvData.update({ where: { pilotId }, data: { photoUrl: null } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
