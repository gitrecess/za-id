import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isValidZaId, parseZaId } from '../src/index.ts';
import { luhnValid } from '../src/luhn.ts';

const NOW = new Date(2026, 6, 31); // 2026-07-31

test('decodes a well-formed number', () => {
  const result = parseZaId('8001015009087', { now: NOW });

  assert.equal(result.valid, true);
  if (!result.valid) return; // narrowing for the compiler

  assert.equal(result.idNumber, '8001015009087');
  assert.equal(result.dateOfBirth.iso, '1980-01-01');
  assert.equal(result.dateOfBirth.centuryAssumed, '1900s');
  assert.equal(result.sex, 'male');
  assert.equal(result.sequence, 5009);
  assert.equal(result.citizenship, 'citizen');
  assert.equal(result.citizenshipDigit, '0');
  assert.equal(result.checksumDigit, '7');
});

test('a sequence below 5000 records female', () => {
  const result = parseZaId('8001010009082', { now: NOW });

  assert.equal(result.valid && result.sex, 'female');
  assert.equal(result.valid && result.sequence, 9);
});

test('citizenship digit 1 is a permanent resident', () => {
  // Citizenship is the eleventh digit — index 10, not index 11. Getting this
  // off by one still yields a plausible-looking answer, which is exactly why
  // it is asserted on a fixture built around that position.
  const result = parseZaId('9002155678102', { now: NOW });

  assert.equal(result.valid && result.citizenship, 'permanent-resident');
  assert.equal(result.valid && result.citizenshipDigit, '1');
});

test('a citizenship digit outside 0-1 is reported, not rejected', () => {
  // Out of spec, but it occurs. Failing the whole number would be a worse
  // answer than an honest "this digit is not one I recognise".
  const result = parseZaId('8506124321207', { now: NOW });

  assert.equal(result.valid, true);
  assert.equal(result.valid && result.citizenship, 'unknown');
  assert.equal(result.valid && result.citizenshipDigit, '2');
});

test('whitespace is stripped, not rejected', () => {
  const grouped = parseZaId('800101 5009 08 7', { now: NOW });
  const plain = parseZaId('8001015009087', { now: NOW });

  assert.deepEqual(grouped, plain);
  assert.equal(grouped.valid && grouped.idNumber, '8001015009087');
});

test('handles tabs, newlines and leading or trailing space', () => {
  assert.equal(isValidZaId('  8001015009087\t\n', { now: NOW }), true);
});

test('rejects anything that is not a digit', () => {
  for (const input of ['800101500908X', 'not an id', '8001-01-5009087', '800101500908.7']) {
    const result = parseZaId(input, { now: NOW });
    assert.equal(result.valid, false, `${input} should fail`);
    assert.equal(!result.valid && result.reason, 'not-digits');
  }
});

test('a non-string argument fails rather than throwing', () => {
  // The realistic caller is untyped JavaScript handing over a number field
  // straight out of JSON.parse. A validation library is the one place a caller
  // should never need a try.
  for (const input of [8001015009087, null, undefined, {}, ['8001015009087']]) {
    // @ts-expect-error — the signature asks for a string; this is the
    // JavaScript caller's path, and it must not throw.
    const result = parseZaId(input, { now: NOW });

    assert.equal(result.valid, false, `${String(input)} should fail`);
    assert.equal(!result.valid && result.reason, 'not-digits');
  }

  // @ts-expect-error — same, through the convenience wrapper.
  assert.equal(isValidZaId(8001015009087, { now: NOW }), false);
});

test('rejects non-ASCII digits', () => {
  // Arabic-Indic digits look like digits and are not. \d must not match them.
  const result = parseZaId('٨٠٠١٠١٥٠٠٩٠٨٧', { now: NOW });

  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, 'not-digits');
});

test('rejects the wrong number of digits', () => {
  for (const input of ['', '   ', '800101500908', '80010150090871', '1']) {
    const result = parseZaId(input, { now: NOW });
    assert.equal(result.valid, false, `"${input}" should fail`);
    assert.equal(!result.valid && result.reason, 'wrong-length');
  }
});

test('a partial number is a hard failure, not a partial success', () => {
  // The tool page shows "7 of 13 digits" while you type. That is keystroke UI;
  // a library called with a short string has been given a bad value.
  const result = parseZaId('8001015', { now: NOW });

  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, 'wrong-length');
  assert.match(!result.valid ? result.message : '', /7/);
});

test('reports the date before the checksum', () => {
  // Both are wrong in these; the date is the one a user can act on.
  //
  // The fixtures must fail the checksum too, or this proves nothing — with a
  // valid check digit the date is the only thing left to fail, so the test
  // passes whichever order the two run in. An earlier pair did exactly that.
  // The luhnValid assertions below are what stop that happening again.
  assert.equal(luhnValid('8004315009089'), false, 'fixture must fail Luhn too');
  const impossibleDay = parseZaId('8004315009089', { now: NOW });
  assert.equal(!impossibleDay.valid && impossibleDay.reason, 'invalid-date');

  assert.equal(luhnValid('8013015009083'), false, 'fixture must fail Luhn too');
  const impossibleMonth = parseZaId('8013015009083', { now: NOW });
  assert.equal(!impossibleMonth.valid && impossibleMonth.reason, 'invalid-month');
});

test('rejects a failing checksum', () => {
  const result = parseZaId('8001015009088', { now: NOW });

  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, 'checksum');
});

test('thirteen zeros fail on the month, not the checksum', () => {
  // Luhn alone accepts this; the date check is what catches it.
  const result = parseZaId('0000000000000', { now: NOW });

  assert.equal(result.valid, false);
  assert.equal(!result.valid && result.reason, 'invalid-month');
});

test('isValidZaId forwards its options rather than only its id', () => {
  // The wrapper is `return parseZaId(id, options).valid`, so asserting it
  // returns the same boolean as the thing it calls cannot fail — no fixture
  // can make a one-line delegation disagree with itself. That is what this
  // test used to do. Same failure mode as 54619d2, the check-order test whose
  // fixtures both had valid Luhn digits: green throughout, constraining
  // nothing.
  //
  // The property worth pinning is that `options` survives the hop. It needs a
  // fixture whose *verdict* moves with `now`, which the previous five did not
  // have: 29 Feb 2000 is a leap day and 29 Feb 1900 is not, so pinning `now`
  // before 2000 pushes the century inference back into a year where the date
  // does not exist. A wrapper that dropped `options` would answer true twice.
  assert.equal(isValidZaId('0002294999004', { now: NOW }), true);
  assert.equal(isValidZaId('0002294999004', { now: new Date(1999, 0, 1) }), false);

  // And the reason, so the delegation is pinned past the boolean too.
  const pushedBack = parseZaId('0002294999004', { now: new Date(1999, 0, 1) });
  assert.equal(!pushedBack.valid && pushedBack.reason, 'invalid-date');
});

test('an Invalid Date in now throws rather than assuming a century', () => {
  // The value being asserted here is loudness. Before 0.3.0 this call
  // returned a perfectly ordinary success reporting 1980 — every comparison
  // against NaN is false, so the inference took its else branch and the
  // caller had no way to tell. A wrong answer with no signal is worse than
  // any error.
  assert.throws(
    () => parseZaId('8001015009087', { now: new Date('garbage') }),
    RangeError,
  );
  assert.throws(
    () => isValidZaId('8001015009087', { now: new Date('garbage') }),
    RangeError,
  );

  // A real date still works, including one that decides nothing here.
  assert.equal(isValidZaId('8001015009087', { now: NOW }), true);
});

test('now defaults to the current date', () => {
  // Not asserting a decoded year — that would rot. Only that omitting the
  // option works and produces the same verdict.
  assert.equal(isValidZaId('8001015009087'), true);
});

test('the same input and now always give the same result', () => {
  const a = parseZaId('0512310001007', { now: NOW });
  const b = parseZaId('0512310001007', { now: NOW });

  assert.deepEqual(a, b);
  assert.equal(a.valid && a.dateOfBirth.year, 2005);
});

test('failure results carry a message but callers branch on reason', () => {
  const result = parseZaId('8001015009088', { now: NOW });

  assert.equal(result.valid, false);
  if (result.valid) return;

  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
  // The decoded fields must not be reachable on a failure. These two lines are
  // the guarantee itself rather than a comment about one: `npm run typecheck`
  // fails if the union ever stops discriminating, and fails just as loudly
  // — unused '@ts-expect-error' directive — if it starts allowing them.
  // @ts-expect-error — `dateOfBirth` does not exist on a failure result.
  result.dateOfBirth;
  // @ts-expect-error — nor does `sex`.
  result.sex;

  // Asserted at runtime too, as a backstop: types cannot see a shape change
  // that leaves the declarations alone.
  assert.equal('dateOfBirth' in result, false);
  assert.equal('sex' in result, false);
});

test('digit 12 is never decoded', () => {
  // The apartheid-era race classification digit. It is not exposed under any
  // key, and this test is here so that adding one is a deliberate act that
  // breaks a test rather than a quiet addition.
  const result = parseZaId('8001015009087', { now: NOW });

  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.deepEqual(Object.keys(result).sort(), [
    'checksumDigit',
    'citizenship',
    'citizenshipDigit',
    'dateOfBirth',
    'idNumber',
    'sequence',
    'sex',
    'valid',
  ]);
});
