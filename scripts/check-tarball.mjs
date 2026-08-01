#!/usr/bin/env node
/**
 * Check what `npm publish` would actually ship.
 *
 *   node scripts/check-tarball.mjs
 *
 * The package is worth nothing if the tarball is wrong. `src/` ships
 * deliberately, so the declaration and source maps in `dist/` resolve;
 * anything beyond it, and `test/` in particular, is a mistake.
 *
 * This lives in a script rather than inline in a workflow because both
 * `ci.yml` and `publish.yml` need it. It used to be in `ci.yml` alone, which
 * meant the release path — a `v*` tag — never ran it, and npm is the wrong
 * place to find out: a bad version cannot be replaced, only deprecated, or
 * unpublished inside a 72-hour window.
 *
 * `scripts/` is not in `files`, so this never ships. The check below would
 * flag it if it did.
 *
 * Exits 0 when the tarball is right, 1 on any stray or missing file.
 */

import { execFileSync } from 'node:child_process';

const ALLOWED_FILES = ['package.json', 'README.md', 'LICENSE'];
const ALLOWED_DIRS = ['dist/', 'src/'];
const REQUIRED = ['dist/index.js', 'dist/index.d.ts', 'src/index.ts'];

// --dry-run so nothing is written, --json so the file list is data rather than
// something to parse out of npm's human output. npm puts the JSON on stdout;
// its notices go to stderr, which is inherited so they stay visible in a log.
const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});

const [{ files }] = JSON.parse(output);
const paths = files.map((file) => file.path);

const stray = paths.filter(
  (path) =>
    !ALLOWED_DIRS.some((dir) => path.startsWith(dir)) && !ALLOWED_FILES.includes(path),
);

if (stray.length) {
  console.error('Unexpected files in tarball:', stray);
  process.exit(1);
}

for (const required of REQUIRED) {
  if (!paths.includes(required)) {
    console.error('Tarball is missing', required);
    process.exit(1);
  }
}

console.log('Tarball OK:', paths.length, 'files');
