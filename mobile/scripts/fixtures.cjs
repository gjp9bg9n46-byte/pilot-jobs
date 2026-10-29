#!/usr/bin/env node
/* eslint-disable no-console */
// Refresh the preflight fixtures from PROD, read-only.
//
// The point of preflight is that the screens meet the shape of data the
// owner's account actually holds — 511 flights, 59 airports, imported rows
// with no PIC/SIC split, a remark that is the string "0". Inventing that
// shape by hand is how the last three regressions got through.
//
//   node scripts/fixtures.cjs
//
// Nothing is written to the database. The files land in .preflight-fixtures/,
// which is git-ignored: they are a copy of one pilot's logbook.
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '../../backend');
const OUT = path.join(__dirname, '..', '.preflight-fixtures');
const EMAIL = process.env.PREFLIGHT_EMAIL || 'mohamed.alaa.abdelazim@gmail.com';

const prisma = require(path.join(BACKEND, 'src/config/database'));
const bundles = require(path.join(BACKEND, 'src/controllers/bundleController'));
const profileController = require(path.join(BACKEND, 'src/controllers/profileController'));
const flightLogController = require(path.join(BACKEND, 'src/controllers/flightLogController'));
const jobController = require(path.join(BACKEND, 'src/controllers/jobController'));
const airlineController = require(path.join(BACKEND, 'src/controllers/airlineController'));

function call(handler, req) {
  return new Promise((resolve, reject) => {
    const res = { json: resolve, status: () => res };
    handler({ query: {}, params: {}, body: {}, ...req }, res, reject);
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const pilot = await prisma.pilot.findFirst({ where: { email: EMAIL } });
  if (!pilot) throw new Error(`no pilot ${EMAIL}`);

  const bootstrap = await call(bundles.logbookBootstrap, { pilot, query: { page: '1', limit: '20' } });
  const airports = await call(profileController.getAirports, { pilot });
  const carryForward = await call(profileController.getCarryForward, { pilot });

  // One real flight to open: an imported row, because those are the ones
  // with no PIC/SIC split and a remark of "0".
  const flight = await prisma.flightLog.findFirst({
    where: { pilotId: pilot.id, source: 'IMPORTED' },
    orderBy: { date: 'desc' },
  });

  const write = (n, v) => {
    fs.writeFileSync(path.join(OUT, n), JSON.stringify(v, null, 1));
    console.log(`  ${n}  ${(fs.statSync(path.join(OUT, n)).size / 1024).toFixed(0)}KB`);
  };
  write('bootstrap.json', bootstrap);
  write('airports.json', airports);
  write('flight.json', flight);
  // The Jobs tab, the Airlines tab and one job's own page. The jobs list has
  // to include the standing campaign row — a match shape with no percentage,
  // which is what took the tab down.
  // The whole list, not page 1: the campaign row sorts LAST, so a 20-row page
  // would not contain the case that broke the tab.
  const jobs = await call(jobController.getJobs, { pilot, query: { page: '1', limit: '400' } });
  const airlines = await call(airlineController.listAirlines ?? airlineController.getAirlines, { pilot, query: { page: '1', limit: '20' } });
  const campaign = (jobs.jobs || []).find((j) => j.isCampaign) || (jobs.jobs || [])[0];
  const job = campaign
    ? await call(jobController.getJob, { pilot, params: { id: campaign.id } })
    : null;
  write('jobs.json', jobs);
  write('airlines.json', airlines);
  write('job.json', job);
  console.log(`  campaign row in the list: ${(jobs.jobs || []).some((j) => j.isCampaign) ? 'yes' : 'NO — the fixture misses the case that broke'}`);

  write('rest.json', {
    carryForward,
    me: { id: pilot.id, firstName: pilot.firstName, lastName: pilot.lastName, role: pilot.role, email: 'test@example.invalid' },
    profile: { id: pilot.id, firstName: pilot.firstName, lastName: pilot.lastName, role: pilot.role, ratings: [], certificates: [] },
  });

  console.log(`\nflights ${bootstrap.flights?.total}  airports ${airports.airports?.length}  routes ${airports.routes?.length}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
