#!/usr/bin/env node
/**
 * Check that `package-lock.json` agrees with `package.json` about the version.
 *
 *   node scripts/check-versions.mjs
 *
 * Nothing else asserts this, and nothing else would notice: `npm ci` tolerates
 * a version-only mismatch, and the published tarball takes its version from
 * `package.json`, so a stale lockfile fails silently rather than loudly. It did
 * — the lockfile said `0.1.0` while the package had gone to `0.2.0` and then
 * `0.3.0`, across two releases and through a five-step `prepublishOnly`.
 *
 * The release flow keeps the two in step with `npm version X.Y.Z
 * --no-git-tag-version`. That is an instruction to a person, though, and a
 * hand-edit of `package.json` still type-checks, still tests green and still
 * publishes — so this exists to catch the case where the instruction was not
 * followed, whatever the reason: a forgotten flag, a merge, a rebase.
 *
 * The version lives in the lockfile **twice** — top level and `packages[""]` —
 * and `npm install --package-lock-only` updates both. Checking one would let
 * the other rot, so both are asserted and reported separately.
 *
 * This is a script rather than an inline step because three entry points need
 * it: `ci.yml`, `publish.yml` and `prepublishOnly`. It reads two files and
 * needs neither an install nor a build, so it runs **before install** on all
 * three — a mismatch should be rejected in a second, not after a full build.
 * It is literally first in `ci.yml` and `prepublishOnly`; in `publish.yml` it
 * sits third, after the two tag checks, which are cheaper still and reject the
 * more common mistake.
 *
 * Only the version is compared. `packages[""]` mirrors `name`, `license`,
 * `engines` and `devDependencies` too, but those drift differently: `npm ci`
 * fails outright on a `devDependencies` mismatch, and the rest change roughly
 * never and are not what a release touches. The version is the one field a
 * release moves every time and nothing else checks.
 *
 * `scripts/` is not in `files`, so this never ships; `check-tarball.mjs` is
 * what proves that.
 *
 * Exits 0 when the two files agree, 1 on any disagreement.
 */

import { readFileSync } from 'node:fs';

// Resolved from this file's own location rather than the working directory, so
// the script cannot be pointed at a different repo's manifests by a stray `cd`.
const read = (name) =>
  JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));

const pkg = read('package.json');
const lock = read('package-lock.json');

// Without this, a `package.json` carrying no version at all would compare
// `undefined` against two `undefined`s, agree, and print `Versions agree:
// undefined`. npm makes that unreachable in practice — which is the point: the
// one input shape under which this check cannot fail is the one worth naming,
// because a check that cannot fail is the bug this repo has already shipped
// once (`54619d2`).
if (typeof pkg.version !== 'string') {
  console.error('package.json has no version to compare against.');
  process.exit(1);
}

const mismatches = [
  ['package-lock.json .version', lock.version],
  ['package-lock.json .packages[""].version', lock.packages?.['']?.version],
].filter(([, found]) => found !== pkg.version);

if (mismatches.length) {
  console.error(`package.json says ${pkg.version}, but:`);
  for (const [where, found] of mismatches) {
    console.error(`  ${where} says ${found ?? '(missing)'}`);
  }
  console.error('Run `npm install --package-lock-only` to bring them back in step.');
  process.exit(1);
}

console.log('Versions agree:', pkg.version);
