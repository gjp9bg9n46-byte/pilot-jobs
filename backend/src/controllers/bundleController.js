'use strict';

// ── Bundled reads ─────────────────────────────────────────────────────────────
// Three screens each opened with four or five separate requests that ALWAYS run
// together. From Cairo one request costs ~275 ms of network before the server
// does anything, so a five-call screen paid ~1.4 s in round trips alone even
// when every handler was instant.
//
// Each bundle re-uses the EXISTING handler rather than reimplementing it, so a
// bundled payload can never drift from the endpoint it mirrors. One part failing
// returns null for that part plus an `errors` entry — a slow medical lookup must
// not blank out a whole screen. The single endpoints stay for the web app and
// for older app builds.

const prefs = require('./logbookPrefsController');
const scan = require('./logbookScanController');
const flightLogs = require('./flightLogController');
const profile = require('./profileController');
const jobs = require('./jobController');
const cv = require('./cvController');

// Run an Express handler against a stub response and hand back {status, body}.
function collect(handler, req, query = {}) {
  return new Promise((resolve) => {
    let status = 200;
    const res = {
      status(code) { status = code; return res; },
      json(body) { resolve({ status, body }); return res; },
      send(body) { resolve({ status, body }); return res; },
    };
    const sub = Object.create(req);
    sub.query = { ...(req.query || {}), ...query };
    sub.params = req.params || {};
    sub.body = {};
    sub.method = 'GET';
    Promise.resolve(handler(sub, res, (err) => resolve({ status: 500, body: null, err })))
      .catch((err) => resolve({ status: 500, body: null, err }));
  });
}

// Build a bundle from [name, handler, query] parts, all in parallel.
async function bundle(req, parts) {
  const settled = await Promise.all(parts.map(([, handler, query]) => collect(handler, req, query)));
  const out = {};
  const errors = {};
  parts.forEach(([name], i) => {
    const r = settled[i];
    if (r.status >= 400 || r.err) {
      out[name] = null;
      errors[name] = (r.body && r.body.error) || (r.err && r.err.message) || `failed (${r.status})`;
    } else {
      out[name] = r.body;
    }
  });
  if (Object.keys(errors).length) out.errors = errors;
  return out;
}

// GET /logbook/bootstrap — everything the Logbook tab opens with (was 4 calls).
exports.logbookBootstrap = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page = Math.max(Number(req.query.page) || 1, 1);
    res.json(await bundle(req, [
      ['prefs', prefs.getPrefs],
      ['scanQuota', scan.quota],
      ['summary', flightLogs.summary],
      ['flights', flightLogs.getLogs, { page: String(page), limit: String(limit) }],
    ]));
  } catch (err) { next(err); }
};

// GET /profile/overview — everything the Profile tab opens with (was 5 calls).
exports.profileOverview = async (req, res, next) => {
  try {
    res.json(await bundle(req, [
      ['profile', profile.getProfile],
      ['readiness', profile.getReadiness],
      ['logbook', flightLogs.summary],
      ['applications', jobs.getMyApplications],
      ['cv', cv.getCvDocument],
    ]));
  } catch (err) { next(err); }
};

module.exports.collect = collect;
module.exports.bundle = bundle;
