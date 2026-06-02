'use strict';
/**
 * ⚠ DATABASE SAFETY
 * DO NOT use --force-reset. Use prisma migrate dev for development
 * and prisma migrate deploy for production.
 * Force-reset wipes ALL data with no recovery path.
 * Run scripts/backup-db.js before any destructive schema operation.
 */

require('dotenv').config({ path: '/Users/mohamedalaa/pilot-jobs/backend/.env' });

const prisma = require('/Users/mohamedalaa/pilot-jobs/backend/src/config/database');
const {
  getPilotFlightTotals,
  computeMatchBreakdown,
  getQualifiedMedicalClasses,
} = require('/Users/mohamedalaa/pilot-jobs/backend/src/services/matchingService');
const { EDU_RANK, parseElpLevel } = require('/Users/mohamedalaa/pilot-jobs/backend/src/lib/eduRank');

const EU_COUNTRIES_RTW = new Set([
  'austria','belgium','bulgaria','croatia','cyprus','czech republic',
  'denmark','estonia','finland','france','germany','greece',
  'hungary','ireland','italy','latvia','lithuania','luxembourg',
  'malta','netherlands','poland','portugal','romania','slovakia',
  'slovenia','spain','sweden',
]);

async function main() {
  // Load pilot
  const pilot = await prisma.pilot.findUnique({
    where: { email: 'mohamed.alaa.abdelazim@gmail.com' },
    include: { certificates: true, ratings: true, medicals: true, rightToWork: true },
  });
  if (!pilot) { console.error('Pilot not found'); return; }
  console.log(`Pilot: ${pilot.firstName} ${pilot.lastName} | role: ${pilot.role} | edu: ${pilot.education}`);

  const totals = await getPilotFlightTotals(pilot.id);
  console.log('Totals:', JSON.stringify(totals));
  console.log('Certs:', pilot.certificates.map(c => `${c.type}/${c.issuingAuthority}/${c.englishLevel||''}`));
  console.log('Ratings:', pilot.ratings.map(r => r.aircraftType));
  console.log('Medicals:', pilot.medicals.map(m => m.medicalClass));
  console.log('RTW:', pilot.rightToWork.map(r => r.country));
  console.log('');

  // Build the same WHERE the qualifiedOnly filter builds
  const normalise = (t) => (t === 'ATP' ? ['ATP','ATPL'] : t === 'ATPL' ? ['ATPL','ATP'] : [t]);
  const normaliseAuth = (a) => (['CAA_UK','CAA-UK'].includes(a)||a==='CAA') ? ['CAA','CAA_UK','CAA-UK'] : [a];
  const flightCerts = pilot.certificates.filter(c => c.type !== 'ELP');
  const certTypes = [...new Set(flightCerts.flatMap(c => normalise(c.type)))];
  const certAuthorities = [...new Set(flightCerts.flatMap(c => normaliseAuth(c.issuingAuthority)))];
  const ratingTypes = pilot.ratings.map(r => r.aircraftType.toUpperCase());
  const qualifiedMedicals = getQualifiedMedicalClasses(pilot.medicals);
  const elpCert = pilot.certificates.find(c => c.type === 'ELP');
  const pilotElpLevel = parseElpLevel(elpCert?.englishLevel);

  const andConditions = [];

  andConditions.push(certTypes.length > 0
    ? { OR: [{ reqCertificates: { isEmpty: true } }, { reqCertificates: { hasSome: certTypes } }] }
    : { reqCertificates: { isEmpty: true } });

  andConditions.push(certAuthorities.length > 0
    ? { OR: [{ reqAuthorities: { isEmpty: true } }, { reqAuthorities: { hasSome: certAuthorities } }] }
    : { reqAuthorities: { isEmpty: true } });

  andConditions.push({ OR: [{ reqMinTotalHours: null }, { reqMinTotalHours: { lte: totals.totalTime ?? 0 } }] });
  andConditions.push({ OR: [{ reqMinPicHours: null }, { reqMinPicHours: { lte: totals.picTime ?? 0 } }] });

  andConditions.push(ratingTypes.length > 0
    ? { OR: [{ reqAircraftTypes: { isEmpty: true } }, { reqAircraftTypes: { hasSome: ratingTypes } }] }
    : { reqAircraftTypes: { isEmpty: true } });

  andConditions.push(qualifiedMedicals
    ? { OR: [{ reqMedicalClass: null }, { reqMedicalClass: { in: qualifiedMedicals } }] }
    : { reqMedicalClass: null });

  andConditions.push({ OR: [{ reqMinMultiEngineHours: null }, { reqMinMultiEngineHours: { lte: totals.multiEngineTime ?? 0 } }] });
  andConditions.push({ OR: [{ reqMinTurbineHours: null }, { reqMinTurbineHours: { lte: totals.turbineTime ?? 0 } }] });
  andConditions.push({ OR: [{ reqMinInstrumentHours: null }, { reqMinInstrumentHours: { lte: totals.instrumentTime ?? 0 } }] });
  andConditions.push({ OR: [{ reqMinCrossCountryHours: null }, { reqMinCrossCountryHours: { lte: totals.crossCountryTime ?? 0 } }] });

  if (pilot.education != null) {
    const pilotEduRank = EDU_RANK[pilot.education] ?? 0;
    const validEdus = Object.entries(EDU_RANK).filter(([,r]) => r <= pilotEduRank).map(([e]) => e);
    andConditions.push({ OR: [{ reqEducation: null }, { reqEducation: { in: validEdus } }] });
  } else {
    andConditions.push({ reqEducation: null });
  }

  andConditions.push(pilotElpLevel != null
    ? { OR: [{ reqEnglishLevel: null }, { reqEnglishLevel: { lte: pilotElpLevel } }] }
    : { reqEnglishLevel: null });

  if (!pilot.willingToRelocate) andConditions.push({ reqWillingToRelocate: { not: true } });

  if (pilot.role) andConditions.push({ OR: [{ role: null }, { role: pilot.role }] });

  // RTW
  if (pilot.rightToWork.length === 0) {
    andConditions.push({ reqWorkAuthorization: null });
  } else {
    const rtwCountries = pilot.rightToWork.map(r => r.country.toLowerCase().trim());
    const rtwOptions = [{ reqWorkAuthorization: null }, { reqWorkAuthorization: 'required' }];
    if (rtwCountries.some(c => EU_COUNTRIES_RTW.has(c))) rtwOptions.push({ reqWorkAuthorization: 'EU' });
    if (rtwCountries.some(c => ['united states','usa','us'].includes(c))) rtwOptions.push({ reqWorkAuthorization: 'US' });
    if (rtwCountries.some(c => ['united kingdom','uk','great britain'].includes(c))) rtwOptions.push({ reqWorkAuthorization: 'UK' });
    andConditions.push({ OR: rtwOptions });
  }

  const where = { status: 'ACTIVE', AND: andConditions };
  const jobs = await prisma.job.findMany({ where, take: 1000 });
  console.log(`qualifiedOnly returned: ${jobs.length} jobs`);

  // Now run breakdown on each and find any with missing/marginal
  let failCount = 0;
  const examples = [];

  for (const job of jobs) {
    const bd = computeMatchBreakdown(pilot, totals, job);
    if (bd.missing.length > 0 || bd.marginal.length > 0) {
      failCount++;
      if (examples.length < 5) {
        examples.push({
          id: job.id, company: job.company, title: job.title.slice(0, 50),
          matched: bd.matched.length,
          marginal: bd.marginal,
          missing: bd.missing,
        });
      }
    }
  }

  console.log(`\nJobs with missing/marginal items that slipped through: ${failCount} / ${jobs.length}`);
  if (examples.length) {
    console.log('\nExamples:');
    examples.forEach((e, i) => {
      console.log(`\n[${i+1}] ${e.id}`);
      console.log(`    ${e.company} — ${e.title}`);
      console.log(`    matched: ${e.matched} | marginal: ${JSON.stringify(e.marginal)} | missing: ${JSON.stringify(e.missing)}`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
