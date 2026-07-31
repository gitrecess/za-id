/** Which century the two-digit year was read as. Always a guess — see below. */
export type Century = '1900s' | '2000s';

export interface DateOfBirth {
  year: number;
  /** 1–12, not the 0–11 the Date constructor uses. */
  month: number;
  day: number;
  /** `YYYY-MM-DD`. Built by hand, not via `toISOString()` — see the note below. */
  iso: string;
  /**
   * Which century was assumed. Reported rather than hidden, because the ID
   * number itself contains nothing that distinguishes 1926 from 2026 and any
   * consumer displaying a date of birth should be able to say so.
   */
  centuryAssumed: Century;
}

export type DateOfBirthResult =
  | { ok: true; dateOfBirth: DateOfBirth }
  | { ok: false; reason: 'invalid-month' | 'invalid-date'; message: string };

/** Zero-pad to `width` digits. */
function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Read the leading `YYMMDD` of an ID number into a date, or say why it is not
 * one.
 *
 * Two digits of year cannot say which century, so the convention here — the
 * usual one — is that a year at or below the current one means the 2000s and
 * anything above it means the 1900s, with a date landing in the future pushed
 * back a hundred years. For anyone born more than about a century ago that
 * guess is wrong, which is why `centuryAssumed` comes back with the result.
 *
 * @param yymmdd Exactly six digits. Callers screen for that.
 * @param now Reference date for the century inference. Injected rather than
 *   read from the clock so that the result is a pure function of its inputs:
 *   tests stay stable across new year's day, and a caller backfilling
 *   historical records can pin it to the date the record was captured.
 */
export function readDateOfBirth(yymmdd: string, now: Date): DateOfBirthResult {
  const yy = Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));

  if (month < 1 || month > 12) {
    return {
      ok: false,
      reason: 'invalid-month',
      message: `Digits 3 and 4 are the month, and ${yymmdd.slice(2, 4)} is not one.`,
    };
  }

  let year = yy <= now.getFullYear() % 100 ? 2000 + yy : 1900 + yy;
  let date = new Date(year, month - 1, day);

  // Nobody is born tomorrow. If the 2000s reading is still in the future, the
  // 1900s reading is the only one that can be right.
  if (date > now) {
    year -= 100;
    date = new Date(year, month - 1, day);
  }

  // Round-trip check: the Date constructor rolls 31 April over into 1 May
  // rather than complaining, so compare the parts back out again.
  const roundTrips =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  if (!roundTrips) {
    return {
      ok: false,
      reason: 'invalid-date',
      message: `${yymmdd} is not a real date — day ${day} does not exist in that month.`,
    };
  }

  return {
    ok: true,
    dateOfBirth: {
      year,
      month,
      day,
      // Not `date.toISOString().slice(0, 10)`. That `Date` is local midnight,
      // so anywhere east of UTC it serialises to the previous day — a silent
      // off-by-one that only shows up for consumers in some timezones. The
      // parts are already known; format them directly.
      iso: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
      centuryAssumed: year < 2000 ? '1900s' : '2000s',
    },
  };
}
