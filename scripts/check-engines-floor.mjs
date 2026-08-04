#!/usr/bin/env node
/**
 * Check that the built `dist/` actually loads and runs on the floor that
 * `package.json` declares in `engines.node`.
 *
 *   node scripts/check-engines-floor.mjs
 *
 * `engines.node` is metadata, and metadata nothing executes is a claim rather
 * than a fact. It sat at `>=22.12.0` for three releases while the emitted code
 * needed nothing of the sort — ESM plus a single `??` and one `padStart` — so
 * the floor was a policy number, not a measured one. Over-declaring is not
 * cosmetic: `npm` warns `EBADENGINE` below the floor, and the install becomes a
 * hard failure under `engine-strict=true` — or under any package manager
 * configured to enforce `engines`. (The plan and the task row name pnpm
 * specifically; that was not verifiable here, pnpm is not installed on this
 * machine, and its `engine-strict` defaults to false. Narrowed rather than
 * repeated.) Under-declaring is worse, and silent.
 *
 * **`npm test` owns whether the answers are right; this owns whether the
 * emitted artefact loads and executes on the floor.** Every assertion below is
 * a property of the runtime or of the build, never of the algorithm. That
 * boundary is what keeps this from drifting into a second test suite with no
 * parity check over it — and there is no parity check over it, which is why
 * the boundary has to be stated rather than assumed.
 *
 * **Five numbered claims below, and there must not be a sixth.** The budget is
 * counted in claims, not in `equal()` calls — three of the five spend two calls
 * on one claim, so counting calls gives seven and reads as a budget already
 * broken. A new *claim* belongs in `test/`, which runs on every Node in the CI
 * matrix and type-checks. The ceiling is the mechanism: without one this file
 * grows a plausible assertion at a time until it is a duplicate suite that only
 * ever runs on a single runtime.
 *
 * ## This is meant to fail on a developer's machine
 *
 * Assertion 1 pins `process.versions.node` to the floor **exactly**, so running
 * this on the `.nvmrc` Node (22.17.1) fails by design. That is not a bug and
 * must not be "fixed" by weakening it to `>=`: at that point it passes on
 * 22.17.1 having proved nothing whatever about 20.19, which is a check that
 * cannot fail — strictly worse than no gate, because it manufactures a green
 * tick. This repo has shipped exactly that bug once already (`54619d2`), which
 * is why `check-versions.mjs` carries a cannot-fail guard of its own.
 *
 * The same reasoning is why this is **not** in `prepublishOnly` and not in
 * `publish.yml`. It runs in one place: the `engines-floor` job in `ci.yml`,
 * which installs the floor version and nothing else. To watch it pass locally,
 * install that exact runtime and invoke it with that binary.
 *
 * ## What this does not check
 *
 * Only the paths these five assertions reach. A future `src/` edit that
 * introduces a post-floor API down a rare branch would still get through,
 * because `tsconfig`'s `lib` is `ES2022` and permits it. **Do not pre-emptively
 * lower `lib` to close that** — it costs real expressiveness in `src/` for a
 * hypothetical, and naming a residual is what this repo does everywhere else.
 *
 * It also says nothing about Deno, Bun, Workers or the browser, all of which
 * the README claims. Those have no `engines` field to be wrong.
 *
 * Exits 0 when the artefact runs on the declared floor, 1 on any failure.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deepEqual, equal } from 'node:assert/strict';

// Resolved from this file's own location rather than the working directory, so
// a stray `cd` cannot point it at another repo's manifest or another repo's
// build — the same reason `check-versions.mjs` reads its two files this way.
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const distUrl = new URL('../dist/index.js', import.meta.url);

// The floor is read, never restated. `ci.yml` reads the same field to decide
// which runtime to install, so the version exists once and both the pin and
// this assertion derive from it. Two copies of a version number is how the
// lockfile drifted two releases behind.
//
// The exact-shape match is deliberate. A compound range like
// `">=20.19.0 <21 || >=22.12.0"` has no single version to pin a job to, so
// rather than guess at which clause to test, fail and say so.
const declared = pkg.engines?.node;
const floor = /^>=(\d+\.\d+\.\d+)$/.exec(declared ?? '')?.[1];

if (!floor) {
  console.error(
    `engines.node is ${declared ?? '(missing)'}, which this check cannot pin a runtime to.`,
  );
  console.error('It must be exactly `>=X.Y.Z`. See the header.');
  process.exit(1);
}

// 1. The right runtime. Without this every assertion below is measuring
//    whatever Node happens to be on PATH, and the file becomes a check that
//    cannot fail. It also catches `setup-node` fuzzy-matching a range or a
//    cache handing the job a different binary than the one the log claims.
equal(
  process.versions.node,
  floor,
  `this must run on exactly the declared floor. engines.node says ${declared}, ` +
    `so run it on v${floor}; this process is v${process.versions.node}. ` +
    'On a dev machine that is expected — see this file’s header.',
);

// 2. The artefact parses and loads as ESM. `??` is the only post-ES2019 syntax
//    in `dist/`, and it fails at parse time on a runtime too old — before any
//    assertion could run — so a load failure here is the finding.
//
//    `typeof === 'function'` rather than a pinned export list, so adding an
//    export later is not a two-file change. What is exported is `test/`'s
//    business; that it loads at all is this file's.
const esm = await import(distUrl);
equal(typeof esm.parseZaId, 'function', 'dist/ must export parseZaId as a function');
equal(typeof esm.isValidZaId, 'function', 'dist/ must export isValidZaId as a function');

// 3. A CommonJS caller can `require()` it. This is the assertion that pins the
//    README's CommonJS sentence to the floor: set `engines.node` below 20.19.0
//    and this goes red, rather than the README going quietly wrong.
//
//    Deliberately NOT `process.features.require_module === true`. That flag is
//    `undefined` on Node 16 and 18 rather than `false`, so asserting it is a
//    proxy that fails for the wrong reason on exactly the runtimes where the
//    round-trip is what actually matters. Do the round trip.
//    The specifier is a **string**, not the `URL` above: `require()` validates
//    its argument as a string and throws `ERR_INVALID_ARG_TYPE` on a `URL`,
//    where dynamic `import()` accepts either. Anchoring the `createRequire` at
//    `import.meta.url` is what makes the relative path resolve from this file
//    rather than from the working directory, so the `cd` protection survives.
const cjs = createRequire(import.meta.url)('../dist/index.js');
equal(typeof cjs.parseZaId, 'function', 'require() of dist/ must yield parseZaId');

// The suite's pinned reference date, so nothing here rots on 1 January. Same
// value as `NOW` in `test/`, for the same reason.
const NOW = new Date(2026, 6, 31);

// 4. The artefact decodes. One projection rather than four separate equals,
//    because it is one claim — and a projection also fails informatively,
//    printing the whole shape rather than the first field that differs.
//
//    Under the job's `TZ=Africa/Johannesburg` this doubles as the
//    `toISOString()` regression at no extra assertion: that `Date` is local
//    midnight, so serialising it via `toISOString().slice(0, 10)` anywhere east
//    of UTC would say `1979-12-31` here.
const decoded = cjs.parseZaId('8001015009087', { now: NOW });
deepEqual(
  {
    valid: decoded.valid,
    iso: decoded.dateOfBirth?.iso,
    centuryAssumed: decoded.dateOfBirth?.centuryAssumed,
    sex: decoded.sex,
  },
  { valid: true, iso: '1980-01-01', centuryAssumed: '1900s', sex: 'male' },
  'the canonical fixture must decode identically on the floor',
);

// 5. Check order survived the build. `0000000000000` is the one failing fixture
//    that can tell order apart, because it passes Luhn (sum zero) — a build
//    that dropped or reordered the date check reports `valid: true` here, where
//    every other bad number reports `checksum` either way.
//
//    `reason` only, never `message`: the README says `reason` is stable and the
//    wording may be reworded.
const rejected = cjs.parseZaId('0000000000000', { now: NOW });
equal(rejected.valid, false, '0000000000000 must not be valid');
equal(rejected.reason, 'invalid-month', 'the date check must run before the checksum');

console.log(`Floor OK: Node v${process.versions.node} satisfies engines.node ${declared}`);
