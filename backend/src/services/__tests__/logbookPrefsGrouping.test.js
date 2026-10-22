'use strict';

// How the flight list is grouped is a per-pilot setting shared by web and app,
// so choosing Day on the phone is still Day on the laptop.

const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const store = { logbookPrefs: {}, role: 'FIRST_OFFICER', staffNumber: null };
const origLoad = Module._load;
Module._load = function (request) {
  if (request.endsWith('config/database')) {
    return {
      pilot: {
        findUnique: async () => ({ ...store }),
        update: async ({ data }) => { Object.assign(store, data); return { ...store }; },
      },
    };
  }
  return origLoad.apply(this, arguments);
};
const prefs = require('../../controllers/logbookPrefsController');
Module._load = origLoad;

const call = (fn, body = {}) => new Promise((resolve, reject) => {
  let code = 200;
  const res = { status: (c) => { code = c; return res; }, json: (b) => resolve({ code, body: b }) };
  Promise.resolve(fn({ pilot: { id: 'p1' }, body }, res, reject)).catch(reject);
});

test('a pilot who has never chosen gets Month', async () => {
  store.logbookPrefs = {};
  const r = await call(prefs.getPrefs);
  assert.equal(r.body.grouping, 'month');
});

test('choosing Day is remembered, and read back the same on either platform', async () => {
  store.logbookPrefs = {};
  const put = await call(prefs.updatePrefs, { grouping: 'day' });
  assert.equal(put.code, 200);
  assert.equal(store.logbookPrefs.grouping, 'day');
  const get = await call(prefs.getPrefs);
  assert.equal(get.body.grouping, 'day');
});

test('an unknown grouping is refused and the previous choice survives', async () => {
  store.logbookPrefs = { grouping: 'day' };
  const r = await call(prefs.updatePrefs, { grouping: 'fortnight' });
  assert.equal(r.code, 422);
  assert.equal(store.logbookPrefs.grouping, 'day');
});

test('updating another preference leaves the grouping alone', async () => {
  store.logbookPrefs = { grouping: 'day' };
  await call(prefs.updatePrefs, { timeFormat: 'decimal' });
  assert.equal(store.logbookPrefs.grouping, 'day');
  assert.equal(store.logbookPrefs.timeFormat, 'decimal');
});
