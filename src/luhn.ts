/**
 * Luhn checksum over all thirteen digits, doubling every second digit from the
 * right. A valid number sums to a multiple of ten.
 *
 * This deliberately runs over the whole number including the check digit,
 * rather than computing a check digit from the first twelve and comparing.
 * The two are arithmetically equivalent, and this is the form the tool page at
 * iamlukia.com/tools/sa-id-validator/ ships — keeping the two copies the same
 * shape is what makes them diffable by eye, which is the only thing guarding
 * against them drifting apart.
 *
 * @param digits A string of digits. Non-digit input is the caller's problem;
 *   `parseZaId` screens for it before getting here.
 */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let value = Number(digits[i]);

    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }

    sum += value;
    double = !double;
  }

  return sum % 10 === 0;
}
