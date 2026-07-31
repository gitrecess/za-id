# @iamlukia/za-id

Validate and decode South African ID numbers.

- **Zero runtime dependencies.** Nothing to audit but this.
- **No network call.** Runs entirely in your own process — there is no API
  behind it, and no dependency that could add one. An ID number is about as
  sensitive an identifier as there is; it should not leave your machine to be
  checked.
- **Fully typed**, with a discriminated result so a failed parse cannot be
  read as a successful one.
- **Deterministic.** The two-digit year needs a reference date to resolve;
  that date is an argument, not a hidden read of the system clock.
- Works in Node, Deno, Bun, Cloudflare Workers and the browser. Published as
  ESM; CommonJS callers on Node ≥ 22.12 can `require()` it directly.

```bash
npm install @iamlukia/za-id
```

## Usage

```ts
import { parseZaId, isValidZaId } from '@iamlukia/za-id';

isValidZaId('8001015009087'); // true

const result = parseZaId('800101 5009 08 7'); // spaces are fine

if (result.valid) {
  result.dateOfBirth.iso;            // '1980-01-01'
  result.dateOfBirth.centuryAssumed; // '1900s'
  result.sex;                        // 'male'
  result.citizenship;                // 'citizen'
} else {
  result.reason;  // 'checksum'
  result.message; // human-readable, for display
}
```

Branch on `reason`, never on `message` — the wording may change between
versions, the reasons will not.

| `reason` | Meaning |
| :--- | :--- |
| `not-digits` | Something other than digits and whitespace. |
| `wrong-length` | Not exactly thirteen digits. |
| `invalid-month` | Digits 3–4 are not a month. |
| `invalid-date` | A day that does not exist in that month. |
| `checksum` | The Luhn check fails. |

### Pinning the reference date

Two digits of year cannot say which century. The convention — used here and
almost everywhere — is that a year at or below the current one means the
2000s, anything above it means the 1900s, and a date landing in the future is
pushed back a hundred years.

That makes the result depend on *when* you ask. Pass `now` to fix it:

```ts
parseZaId('8001015009087', { now: new Date('2020-01-01') });
```

Useful for reproducible tests, and for backfilling historical records where
the capture date is the honest reference rather than today.

`centuryAssumed` comes back with every successful result, so you can show the
assumption rather than presenting a guess as a fact. For anyone born more
than about a century ago, that guess is wrong.

## What the thirteen digits mean

Reading left to right: **1–6** date of birth as `YYMMDD`; **7–10** a sequence
number within that day, where 0000–4999 was issued to people registered female
and 5000–9999 to people registered male; **11** citizenship, 0 for South
African citizen and 1 for permanent resident; **12** a historical artefact,
see below; **13** a Luhn checksum over the twelve digits in front of it.

The sex digit records what the Department of Home Affairs has on file, which
is not necessarily how somebody describes themselves. It can be changed — the
Alteration of Sex Description and Sex Status Act 49 of 2003 provides for
exactly that, and the number is reissued when it happens. This library reports
what the digits say, not what is true about a person. The field is named
`sex` rather than `gender` for that reason.

**Digit 12 is not decoded, and will not be.** It was a race classification
digit under apartheid and has been unused since 1994. There is nothing in that
position anyone needs today, and shipping the lookup table would be a strange
thing to publish.

## What a valid result does and does not mean

`valid: true` means the number is *well-formed*: the format, the date and the
checksum all agree. It does not mean the number was ever issued, and it does
not mean it belongs to the person presenting it.

A checksum is arithmetic, and arithmetic can be satisfied deliberately — you
can invent a number that passes every check here and belongs to nobody. Only
the Department of Home Affairs can confirm that a number was issued and to
whom, through the National Population Register. If you are verifying somebody's
identity for anything that matters, this tells you the number is plausible,
and that is all it tells you.

The Luhn check has one further blind spot worth knowing: it catches every
single mistyped digit and every adjacent transposition **except** swapping a
`0` and a `9`, which doubling leaves unchanged. There is a test asserting
exactly that, so it is a known property rather than a surprise.

## Alternatives

`za-id` and `za-id-validator` on npm cover similar ground. This one exists
because it has no dependencies (`za-id` pulls in `moment`), ships TypeScript
types, takes an injectable reference date, and reports which century it
assumed instead of silently picking one. If those do not matter to you, the
others work.

## Related

The same logic runs as a browser tool at
[iamlukia.com/tools/sa-id-validator](https://iamlukia.com/tools/sa-id-validator/),
where you can paste a number and see it decoded without installing anything.

That page carries its own hand-written copy of this logic on purpose — it
ships uncompiled so the "nothing leaves your browser" claim is checkable in
view-source. The two are kept in step by hand.

## Licence

MIT
