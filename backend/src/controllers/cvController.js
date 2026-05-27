const prisma = require('../config/database');
const { imageSize } = require('image-size');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function detectMime(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
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
  // /-/strip_meta/all/ strips EXIF/GPS; /-/format/jpeg/ ensures JPEG output (required by @react-pdf/renderer)
  return `https://ucarecdn.com/${data.file}/-/strip_meta/all/-/format/jpeg/`;
}

async function deleteFromUploadcare(url) {
  const m = url.match(/ucarecdn\.com\/([a-f0-9-]{36})/);
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

    const [
      pilot, certificates, ratings, medicals,
      training, rtw, cvData, logAgg, aircraftRows,
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
          multiEngineTime: true, turbineTime: true,
          instrumentTime: true, nightTime: true,
          landingsDay: true, landingsNight: true,
        },
      }),
      prisma.flightLog.findMany({
        where: { pilotId, aircraftType: { not: '' } },
        select: { aircraftType: true },
        distinct: ['aircraftType'],
        orderBy: { date: 'desc' },
        take: 20,
      }),
    ]);

    const { passwordHash, fcmToken, ...safePilot } = pilot;

    const totals = {
      totalTime:       logAgg._sum.totalTime       ?? 0,
      picTime:         logAgg._sum.picTime         ?? 0,
      sicTime:         logAgg._sum.sicTime         ?? 0,
      multiEngineTime: logAgg._sum.multiEngineTime ?? 0,
      turbineTime:     logAgg._sum.turbineTime     ?? 0,
      instrumentTime:  logAgg._sum.instrumentTime  ?? 0,
      nightTime:       logAgg._sum.nightTime       ?? 0,
      landingsDay:     logAgg._sum.landingsDay     ?? 0,
      landingsNight:   logAgg._sum.landingsNight   ?? 0,
    };

    res.json({
      pilot: safePilot,
      certificates,
      ratings,
      medicals,
      training,
      rtw,
      totals,
      aircraftTypes: aircraftRows.map(r => r.aircraftType),
      cv: cvData ?? { education: [], languages: [], skills: [], other: [] },
    });
  } catch (err) {
    next(err);
  }
};

// PUT /cv — upsert user-entered CV fields
exports.updateCvData = async (req, res, next) => {
  try {
    const { education, languages, skills, other } = req.body;
    const cvData = await prisma.cvData.upsert({
      where:  { pilotId: req.pilot.id },
      create: { pilotId: req.pilot.id, education: education ?? [], languages: languages ?? [], skills: skills ?? [], other: other ?? [] },
      update: { education, languages, skills, other },
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

    let dims;
    try { dims = imageSize(buffer); } catch { dims = null; }
    if (!dims || dims.width < 200 || dims.height < 200) {
      return res.status(400).json({ error: 'Image must be at least 200×200 pixels' });
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
