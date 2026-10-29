// What the cache can and cannot hold.
//
// Every "must be caught" case below is a value that works on the launch that
// fetched it and breaks on the next one. The Map is the one that actually
// shipped, twice.
import test from 'node:test';
import assert from 'node:assert';
import { findUnJsonSafe, describeJsonProblem } from './jsonSafe.ts';

const caught = (v: unknown) => findUnJsonSafe(v);

test('plain JSON is fine', () => {
  for (const v of [
    null, 0, -1.5, '', 'CAI', true, false,
    [], {}, [1, 'a', null, { b: [2] }],
    { airports: [{ code: 'CAI', lat: 30.1, lon: 31.4, name: null }] },
  ]) assert.strictEqual(caught(v), null, JSON.stringify(v));
});

test('a Map is caught — the bug that took the Logbook down', () => {
  const p = caught({ byCode: new Map([['CAI', { code: 'CAI' }]]) });
  assert.ok(p);
  assert.strictEqual(p.path, 'byCode');
  assert.strictEqual(p.found, 'Map');
  assert.match(p.why, /comes back as \{\}/);
  assert.match(p.why, /build the Map in select/);
});

test('a Set is caught', () => {
  const p = caught({ seen: new Set(['a']) });
  assert.strictEqual(p?.found, 'Set');
});

test('a Date is caught — it comes back as a string', () => {
  const p = caught({ airports: [{ code: 'CAI', firstDate: new Date('2024-03-12') }] });
  assert.ok(p);
  assert.strictEqual(p.path, 'airports[0].firstDate');
  assert.strictEqual(p.found, 'Date');
  assert.match(p.why, /comes back as a string/);
});

test('a class instance is caught — its methods do not survive', () => {
  // No parameter properties: Node strips types, it does not compile them.
  class Airport {
    code: string;
    constructor(code: string) { this.code = code; }
    label() { return this.code; }
  }
  const p = caught({ home: new Airport('CAI') });
  assert.strictEqual(p?.found, 'Airport');
  assert.match(p.why, /loses its prototype/);
});

test('undefined is caught, in an object and in an array', () => {
  assert.strictEqual(caught({ a: undefined })?.found, 'undefined');
  const inArray = caught({ xs: [1, undefined, 3] });
  assert.strictEqual(inArray?.path, 'xs[1]');
});

test('values JSON quietly turns into null', () => {
  assert.strictEqual(caught({ n: NaN })?.found, 'NaN');
  assert.strictEqual(caught({ n: Infinity })?.found, 'Infinity');
});

test('things JSON.stringify throws on', () => {
  assert.strictEqual(caught({ n: 1n })?.found, 'bigint');
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.match(String(caught(circular)?.found), /circular/);
});

test('functions and symbols are dropped', () => {
  assert.strictEqual(caught({ fn: () => 1 })?.found, 'function');
  assert.strictEqual(caught({ s: Symbol('x') })?.found, 'symbol');
});

test('it names the first offender, with a path worth reading', () => {
  const p = caught({ a: 1, b: { c: [{ d: new Date() }] } });
  assert.strictEqual(p?.path, 'b.c[0].d');
  assert.match(
    describeJsonProblem('["profile","airports"]', p),
    /\["profile","airports"\]: data\.b\.c\[0\]\.d is a Date/,
  );
});

test('the real airports payload passes', () => {
  // The shape the query holds now: a plain array from the server.
  assert.strictEqual(caught({
    airports: [{ code: 'CAI', icao: 'HECA', iata: 'CAI', name: 'Cairo', city: 'Cairo', country: 'EG', lat: 30.112, lon: 31.397, count: 132, firstDate: '2024-03-12T00:00:00.000Z', lastDate: '2026-10-24T00:00:00.000Z' }],
    routes: [{ from: 'CAI', to: 'JED', count: 63 }],
  }), null);
});
