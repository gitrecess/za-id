import { luhnValid } from './luhn.ts';
import { readDateOfBirth } from './date-of-birth.ts';
import type { Century, DateOfBirth } from './date-of-birth.ts';

export type { Century, DateOfBirth };

export interface ZaIdOptions {
  /**
   * Reference date for the century inference on the two-digit year. Defaults
   * to the current date. Pin it to keep results reproducible.
   */
  now?: Date;
}

/** Why a number was rejected. Stable across versions — safe to branch on. */
export type ZaIdFailureReason =
  | 'not-digits'
  | 'wrong-length'
  | 'invalid-month'
  | 'invalid-date'
  | 'checksum';

/**
 * What the citizenship digit says. `unknown` covers any value other than 0 or
 * 1 — those do occur, and they are reported rather than treated as fatal.
 */
export type Citizenship = 'citizen' | 'permanent-resident' | 'unknown';

/**
 * The sex recorded by the Department of Home Affairs, which is not necessarily
 * how somebody describes themselves. It can be changed — the Alteration of Sex
 * Description and Sex Status Act 49 of 2003 provides for exactly that, and the
 * number is reissued when it happens. This reports what the digits say.
 */
export type RecordedSex = 'female' | 'male';

export interface ZaIdFailure {
  valid: false;
  reason: ZaIdFailureReason;
  /** Human-readable, in English. Do not parse it — branch on `reason`. */
  message: string;
}

export interface ZaIdSuccess {
  valid: true;
  /** The input with whitespace removed: exactly thirteen digits. */
  idNumber: string;
  dateOfBirth: DateOfBirth;
  sex: RecordedSex;
  /** Digits 7–10: a sequence number within the day of birth. */
  sequence: number;
  citizenship: Citizenship;
  /** Digit 11, verbatim, so an `unknown` citizenship can still be inspected. */
  citizenshipDigit: string;
  /** Digit 13. Present because it passed; exposed for display. */
  checksumDigit: string;
}

export type ZaIdResult = ZaIdFailure | ZaIdSuccess;

/**
 * Parse and validate a South African ID number, returning everything the
 * digits say.
 *
 * Runs entirely in your own process. There is no network call in this package
 * and no dependency that could make one.
 *
 * ```ts
 * const result = parseZaId('800101 5009 08 7');
 * if (result.valid) console.log(result.dateOfBirth.iso, result.sex);
 * else console.log(result.reason, result.message);
 * ```
 *
 * A `valid: true` result means the number is *well-formed* — the format, date
 * and checksum all agree. It does not mean the number was ever issued, or that
 * it belongs to the person presenting it. A checksum is arithmetic, and
 * arithmetic can be satisfied deliberately. Only the Department of Home Affairs
 * can confirm issuance, through the National Population Register.
 *
 * Digit 12 is deliberately not decoded. It was a race classification digit
 * under apartheid and has been unused since 1994; there is nothing in that
 * position anyone needs today.
 */
export function parseZaId(id: string, options: ZaIdOptions = {}): ZaIdResult {
  const now = options.now ?? new Date();

  // Whitespace is stripped rather than rejected — grouped forms like
  // "800101 5009 08 7" are how people actually paste these.
  const digits = id.replace(/\s/g, '');

  if (!/^\d*$/.test(digits)) {
    return {
      valid: false,
      reason: 'not-digits',
      message: 'An ID number is digits only.',
    };
  }

  if (digits.length !== 13) {
    return {
      valid: false,
      reason: 'wrong-length',
      message: `An ID number is exactly 13 digits, and this is ${digits.length}.`,
    };
  }

  // Order matters, and matches the tool page: the date is checked before the
  // checksum so that an obviously impossible date reports as such rather than
  // as a checksum failure, which tells the user nothing actionable.
  const dob = readDateOfBirth(digits.slice(0, 6), now);

  if (!dob.ok) {
    return { valid: false, reason: dob.reason, message: dob.message };
  }

  if (!luhnValid(digits)) {
    return {
      valid: false,
      reason: 'checksum',
      message:
        'The checksum fails — the first twelve digits do not agree with the last one. ' +
        'Usually a single mistyped digit, or two of them swapped.',
    };
  }

  const sequence = Number(digits.slice(6, 10));
  const citizenshipDigit = digits[10]!;

  return {
    valid: true,
    idNumber: digits,
    dateOfBirth: dob.dateOfBirth,
    sex: sequence < 5000 ? 'female' : 'male',
    sequence,
    // A digit other than 0 or 1 does not invalidate the number. It is out of
    // spec, and reporting it as `unknown` alongside the raw digit lets the
    // caller decide what that is worth; silently failing the whole number
    // would be a worse answer than an honest one.
    citizenship:
      citizenshipDigit === '0'
        ? 'citizen'
        : citizenshipDigit === '1'
          ? 'permanent-resident'
          : 'unknown',
    citizenshipDigit,
    checksumDigit: digits[12]!,
  };
}

/**
 * Whether a South African ID number is well-formed.
 *
 * A convenience over {@link parseZaId} for the common case. Use `parseZaId`
 * when you want to know *why* a number failed, or want the decoded fields.
 */
export function isValidZaId(id: string, options: ZaIdOptions = {}): boolean {
  return parseZaId(id, options).valid;
}
