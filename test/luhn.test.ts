import { test } from 'node:test';
import assert from 'node:assert/strict';

import { luhnValid } from '../src/luhn.ts';

test('accepts known-good ID numbers', () => {
  for (const id of [
    '8001015009087',
    '8001010009082',
    '9002155678011',
    '0002294999004',
    '9602295000008',
  ]) {
    assert.equal(luhnValid(id), true, `${id} should pass`);
  }
});

test('rejects a single mistyped digit', () => {
  // The mistake Luhn exists to catch. Walk every position and change the digit
  // to something else; a single-digit substitution must never still validate.
  const valid = '8001015009087';

  for (let i = 0; i < valid.length; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === valid[i]) continue;
      const typo = valid.slice(0, i) + d + valid.slice(i + 1);
      assert.equal(luhnValid(typo), false, `${typo} should fail (position ${i})`);
    }
  }
});

test('rejects two swapped adjacent digits, except the 0/9 pair', () => {
  // The other mistake Luhn exists to catch — with one documented blind spot,
  // asserted separately below. Only pairs that actually differ count; swapping
  // two identical digits is not a change.
  const valid = '8001015009087';

  for (let i = 0; i < valid.length - 1; i++) {
    const a = valid[i]!;
    const b = valid[i + 1]!;

    if (a === b) continue;
    if ((a === '0' && b === '9') || (a === '9' && b === '0')) continue;

    const swapped = valid.slice(0, i) + b + a + valid.slice(i + 2);

    assert.equal(luhnValid(swapped), false, `${swapped} should fail (positions ${i}/${i + 1})`);
  }
});

test('cannot detect a 0/9 transposition — a known limitation of Luhn', () => {
  // Not a defect in this implementation. Doubling maps 0 to 0 and 9 to 9
  // (18 → 1+8), so swapping an adjacent 0 and 9 leaves the checksum
  // untouched. It is the one transposition Luhn misses, and it is the reason
  // a passing checksum means "plausible", never "correct".
  //
  // Asserted rather than merely commented, so that a future change claiming to
  // catch it has to come here and say so.
  assert.equal(luhnValid('8001015009087'), true); // the original
  assert.equal(luhnValid('8001015090087'), true); // 0 and 9 swapped at 8/9
  assert.equal(luhnValid('8001015000987'), true); // and at 9/10
});

test('thirteen zeros sum to zero, which is a multiple of ten', () => {
  // Documenting the edge rather than defending it: Luhn alone cannot reject
  // this, and it is parseZaId's date check that does — 000000 is month 00.
  assert.equal(luhnValid('0000000000000'), true);
});
