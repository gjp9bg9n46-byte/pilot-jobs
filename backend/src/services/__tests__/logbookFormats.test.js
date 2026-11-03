'use strict';

const test = require('node:test');
const assert = require('node:assert');
const F = require('../logbookFormats');

// ── The layouts are data, so the data has to hold together ──────────────────

test('every layout fills the page exactly once', () => {
  for (const id of F.FORMAT_IDS) {
    const fmt = F.getFormat(id);
    const w = F.widths(fmt);
    const sum = w.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 100) < 0.01, `${id} columns sum to ${sum}, not 100`);
  }
});

test('both header rows span the same width as the columns', () => {
  for (const id of F.FORMAT_IDS) {
    const fmt = F.getFormat(id);
    const h = F.header(fmt);
    const top = h.top.reduce((a, x) => a + x.w, 0);
    const sub = h.sub.reduce((a, x) => a + x.w, 0);
    assert.ok(Math.abs(top - 100) < 0.05, `${id} top header spans ${top}`);
    assert.ok(Math.abs(sub - 100) < 0.05, `${id} sub header spans ${sub}`);
    assert.strictEqual(h.sub.length, fmt.columns.length, `${id} needs one sub cell per column`);
  }
});

test('every column points at a value we know how to format', () => {
  for (const id of F.FORMAT_IDS) {
    for (const col of F.getFormat(id).columns) {
      assert.ok(F.KINDS[col.key], `${id}.${col.key} has no kind`);
    }
  }
});

test('the totals label stops where the first summable column starts', () => {
  for (const id of F.FORMAT_IDS) {
    const fmt = F.getFormat(id);
    const span = F.labelSpan(fmt);
    assert.ok(span > 0, `${id} would merge nothing`);
    for (let i = 0; i < span; i++) {
      assert.strictEqual(F.KINDS[fmt.columns[i].key], 'text', `${id} would hide a total under the label`);
    }
  }
});

// No layout may be presented as the authority's own form — we follow the
// columns their book uses, which is a different claim.
test('no layout claims to be official or approved', () => {
  for (const f of F.formatList()) {
    const text = `${f.label} ${f.note}`.toLowerCase();
    for (const word of ['official', 'approved', 'accepted', 'certified']) {
      assert.ok(!text.includes(word), `${f.id} says "${word}"`);
    }
    assert.match(f.label, /layout$/, `${f.id} should be called a layout`);
  }
});

// ── Picking a layout from the licence ───────────────────────────────────────

test('an authority chooses its own layout', () => {
  const cases = [
    ['EASA', 'easa'], ['UK CAA', 'easa'], ['ECAA', 'easa'], ['CARC', 'easa'], ['DGAC Morocco', 'easa'],
    ['FAA', 'faa'],
    ['TCCA', 'tcca'], ['Transport Canada', 'tcca'],
    ['CASA', 'casa'],
    ['DGCA India', 'dgca'],
  ];
  for (const [authority, id] of cases) {
    assert.strictEqual(F.formatForAuthority(authority), id, `${authority} → ${id}`);
  }
});

// Kuwait's DGCA is not India's. Matching "DGCA" alone would have handed a
// Kuwaiti pilot an Indian logbook.
test('DGCA Kuwait is not DGCA India', () => {
  assert.strictEqual(F.formatForAuthority('DGCA Kuwait'), 'icao');
  assert.strictEqual(F.formatForAuthority('DGCA India'), 'dgca');
});

test('an authority we have no layout for gets the ICAO one', () => {
  for (const a of ['GCAA', 'GACA', 'QCAA', 'BCAA', 'CAA Oman', 'CAAC', 'Other', 'unknown', '', null, undefined]) {
    assert.strictEqual(F.formatForAuthority(a), 'icao', `${String(a)} should fall back to ICAO`);
  }
});

test('the highest licence decides, not whichever came first', () => {
  assert.strictEqual(F.defaultFormatFor([
    { type: 'CPL', issuingAuthority: 'EASA' },
    { type: 'ATPL', issuingAuthority: 'FAA' },
  ]), 'faa');
});

test('an unrecognised authority on the top licence looks further down', () => {
  assert.strictEqual(F.defaultFormatFor([
    { type: 'ATPL', issuingAuthority: 'unknown' },
    { type: 'CPL', issuingAuthority: 'CASA' },
  ]), 'casa');
});

test('no licence at all still gives a usable layout', () => {
  assert.strictEqual(F.defaultFormatFor([]), 'icao');
  assert.strictEqual(F.defaultFormatFor(null), 'icao');
});

test('a rating is not a licence', () => {
  assert.strictEqual(F.defaultFormatFor([{ type: 'MEDICAL', issuingAuthority: 'FAA' }]), 'icao');
});

// ── The EASA layout is the one already in pilots' hands ─────────────────────
// Phase 4 shipped it; a pilot who exported last week must get the same sheet.
test('the EASA layout is unchanged', () => {
  const fmt = F.getFormat('easa');
  assert.deepStrictEqual(fmt.columns.map((c) => c.key), [
    'date', 'depPlace', 'depTime', 'arrPlace', 'arrTime', 'type', 'reg',
    'multiPilot', 'total', 'picName', 'landingsDay', 'landingsNight',
    'night', 'ifr', 'pic', 'coPilot', 'dual', 'remarks',
  ]);
  assert.deepStrictEqual(F.widths(fmt), [
    5.2, 4.2, 4.2, 4.2, 4.2, 5.4, 6, 5, 5, 9, 3.6, 3.6, 5, 5, 5, 5, 5, 15.4,
  ]);
});

test('the FAA layout carries what 61.51 asks for', () => {
  const keys = F.getFormat('faa').columns.map((c) => c.key);
  for (const k of ['catClass', 'xc', 'night', 'insActual', 'insSim', 'approaches',
    'landingsDay', 'landingsNight', 'dual', 'pic', 'coPilot', 'instructor', 'total']) {
    assert.ok(keys.includes(k), `FAA layout is missing ${k}`);
  }
  // An FAA page is self-certified; there is no PIC-name column to fill.
  assert.ok(!keys.includes('picName'));
});

test('getFormat is forgiving about case and refuses what it does not know', () => {
  assert.strictEqual(F.getFormat('EASA').id, 'easa');
  assert.strictEqual(F.getFormat('nope'), null);
  assert.strictEqual(F.getFormat(''), null);
});

// A header cell that spans three columns has to SAY so, or an HTML table
// quietly puts it in one slot and every column after it lands in the wrong
// place. This caught exactly that.
test('the header row accounts for every column', () => {
  for (const id of F.FORMAT_IDS) {
    const fmt = F.getFormat(id);
    const h = F.header(fmt);
    const spanned = h.top.reduce((a, x) => a + x.span, 0);
    assert.strictEqual(spanned, fmt.columns.length, `${id} header spans ${spanned} of ${fmt.columns.length} columns`);
    // A cell that spans both rows leaves a spacer behind it, and only one.
    const spacers = h.sub.filter((x) => x.spacer).length;
    const rowspans = h.top.filter((x) => x.rowspan === 2).length;
    assert.strictEqual(spacers, rowspans, `${id} has ${spacers} spacers for ${rowspans} two-row cells`);
  }
});
