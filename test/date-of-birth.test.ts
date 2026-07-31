import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readDateOfBirth } from '../src/date-of-birth.ts';

/** Every test pins `now`, so none of this rots on 1 January. */
const NOW = new Date(2026, 6, 31); // 2026-07-31, local time — matches how the
                                   // function builds its own dates.

test('reads a plain date', () => {
  const result = readDateOfBirth('800101', NOW);

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.dateOfBirth, {
    year: 1980,
    month: 1,
    day: 1,
    iso: '1980-01-01',
    centuryAssumed: '1900s',
  });
});

test('a two-digit year at or below the current one reads as the 2000s', () => {
  const result = readDateOfBirth('050612', NOW);

  assert.equal(result.ok && result.dateOfBirth.year, 2005);
  assert.equal(result.ok && result.dateOfBirth.centuryAssumed, '2000s');
});

test('a two-digit year above the current one reads as the 1900s', () => {
  const result = readDateOfBirth('270101', NOW);

  assert.equal(result.ok && result.dateOfBirth.year, 1927);
  assert.equal(result.ok && result.dateOfBirth.centuryAssumed, '1900s');
});

test('a date that would land in the future is pushed back a century', () => {
  // yy=26 is not above 26, so the first reading is 2026 — but 31 December 2026
  // has not happened yet on 31 July 2026, so 1926 is the only reading left.
  const result = readDateOfBirth('261231', NOW);

  assert.equal(result.ok && result.dateOfBirth.year, 1926);
  assert.equal(result.ok && result.dateOfBirth.centuryAssumed, '1900s');
});

test('the same year stays in the 2000s when the date has already passed', () => {
  const result = readDateOfBirth('260101', NOW);

  assert.equal(result.ok && result.dateOfBirth.year, 2026);
  assert.equal(result.ok && result.dateOfBirth.centuryAssumed, '2000s');
});

test('rejects a month outside 1-12', () => {
  for (const yymmdd of ['800001', '801301', '809901']) {
    const result = readDateOfBirth(yymmdd, NOW);
    assert.equal(result.ok, false, `${yymmdd} should fail`);
    assert.equal(!result.ok && result.reason, 'invalid-month');
  }
});

test('rejects a day that does not exist in that month', () => {
  // The Date constructor rolls these over silently, which is the whole reason
  // the round-trip check is there.
  for (const yymmdd of ['800431', '800230', '800631', '801131']) {
    const result = readDateOfBirth(yymmdd, NOW);
    assert.equal(result.ok, false, `${yymmdd} should fail`);
    assert.equal(!result.ok && result.reason, 'invalid-date');
  }
});

test('rejects 29 February in a non-leap year', () => {
  const result = readDateOfBirth('990229', NOW);

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'invalid-date');
});

test('accepts 29 February in a leap year', () => {
  assert.equal(readDateOfBirth('960229', NOW).ok, true); // 1996
  assert.equal(readDateOfBirth('000229', NOW).ok, true); // 2000 — divisible by 400
});

test('rejects 29 February in 1900, which was not a leap year', () => {
  // Divisible by 100 but not 400. Reachable only via the future-pushback path,
  // so this also exercises that the round-trip check runs after the pushback.
  const result = readDateOfBirth('000229', new Date(1999, 0, 1));

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, 'invalid-date');
});

test('the iso field is not shifted by the local timezone', () => {
  // A regression guard: `new Date(1980, 0, 1).toISOString()` is 1979-12-31 in
  // any timezone east of UTC. The iso string is built from the parts instead.
  const result = readDateOfBirth('800101', NOW);

  assert.equal(result.ok && result.dateOfBirth.iso, '1980-01-01');
  assert.equal(result.ok && result.dateOfBirth.iso.slice(0, 4), '1980');
});

test('pads single-digit months and days', () => {
  const result = readDateOfBirth('800102', NOW);

  assert.equal(result.ok && result.dateOfBirth.iso, '1980-01-02');
});
