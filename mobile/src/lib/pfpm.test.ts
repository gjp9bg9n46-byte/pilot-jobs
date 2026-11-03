import { strict as assert } from 'node:assert';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { decide, formatLeg, normaliseSector, MAX_SECTORS } from './pfpm.ts';

const NAMES = ['Captain', 'First Officer'];
// A scripted "random" so the assertions are about the rule, not about luck.
const feed = (bits: number[]) => { let i = 0; return () => bits[i++ % bits.length]; };

test('alternate: one coin decides leg 1, then the roles swap each leg', () => {
  const legs = decide({
    names: NAMES, sectors: ['A–B', 'B–C', 'C–D', 'D–E'], alternate: true, randomBit: feed([1]),
  });
  assert.deepEqual(legs.map((l) => l.pf), [1, 0, 1, 0]);
  // and the PM is always the other one
  legs.forEach((l) => assert.notEqual(l.pf, l.pm));
});

test('alternate consumes exactly ONE bit, however many legs', () => {
  let calls = 0;
  decide({
    names: NAMES, sectors: ['A–B', 'B–C', 'C–D'], alternate: true,
    randomBit: () => { calls += 1; return 0; },
  });
  assert.equal(calls, 1);
});

test('not alternating: every leg draws its own bit', () => {
  let calls = 0;
  const legs = decide({
    names: NAMES, sectors: ['A–B', 'B–C', 'C–D'], alternate: false,
    randomBit: () => { calls += 1; return calls % 2; },
  });
  // one bit for the (discarded) first draw plus one per leg
  assert.equal(calls, 4);
  assert.equal(legs.length, 3);
});

test('a bare run with no sectors still returns one leg', () => {
  const legs = decide({ names: NAMES, sectors: [], alternate: true, randomBit: feed([0]) });
  assert.equal(legs.length, 1);
  assert.equal(legs[0].sector, '');
  assert.equal(formatLeg(legs[0]), 'PF Captain · PM First Officer');
});

test('sectors are capped at six', () => {
  const many = Array.from({ length: 10 }, (_, i) => `A${i}–B${i}`);
  const legs = decide({ names: NAMES, sectors: many, alternate: true, randomBit: feed([0]) });
  assert.equal(legs.length, MAX_SECTORS);
});

test('the bit maps straight onto the role — 0 is pilot 1, 1 is pilot 2', () => {
  const zero = decide({ names: NAMES, sectors: ['A–B'], alternate: false, randomBit: () => 0 });
  assert.equal(zero[0].pf, 0);
  assert.equal(zero[0].pfName, 'Captain');
  const one = decide({ names: NAMES, sectors: ['A–B'], alternate: false, randomBit: () => 1 });
  assert.equal(one[0].pf, 1);
  assert.equal(one[0].pfName, 'First Officer');
});

test('the real CSPRNG stays close to even over 4000 draws', () => {
  // Guards the wiring, not the algorithm: a byte's LOW BIT must be used, since
  // something like (byte % 2) on a biased source would show up here.
  const bit = () => randomBytes(1)[0] & 1;
  let pf0 = 0;
  const N = 4000;
  for (let i = 0; i < N; i += 1) {
    const [leg] = decide({ names: NAMES, sectors: ['A–B'], alternate: false, randomBit: bit });
    if (leg.pf === 0) pf0 += 1;
  }
  // ±4σ on a fair coin is about ±126 here; a stuck or biased bit fails loudly.
  assert.ok(Math.abs(pf0 - N / 2) < 160, `split was ${pf0}/${N}`);
});

test('sector text is normalised to an en dash, whatever was typed', () => {
  assert.equal(normaliseSector('cai-mxp'), 'CAI–MXP');
  assert.equal(normaliseSector('CAI to MXP'), 'CAI–MXP');
  assert.equal(normaliseSector(' cai / mxp '), 'CAI–MXP');
  assert.equal(normaliseSector('LHR'), 'LHR');
  assert.equal(normaliseSector(''), '');
});
