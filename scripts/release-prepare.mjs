// Step 1 of a release: `node scripts/release-prepare.mjs X.Y.Z` (CLAUDE.md,
// Releasing). Bumps package.json and addon/manifest.json to the clean version
// — a test build's `-betaN` dropped — refreshes package-lock.json, runs the
// tests, the typecheck and the build, and checks the xpi's manifest; then it
// stops. The commit, the tag and the push are git-chores' (the release
// section of .claude/agents/git-chores.md). It refuses a dirty tree, a
// version that is not newer than the released one and a tag that already
// exists, each with one line saying so; a failed check ends it the same way.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { VERSION_RE, compareVersions, setVersionLine, stripPrerelease } from './release-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];

function fail(reason) {
  console.error(`release-prepare: ${reason}`);
  process.exit(1);
}
function git(args) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();
}
function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, { cwd: root, stdio: 'inherit' });
}

if (!version || !VERSION_RE.test(version)) {
  fail('usage: node scripts/release-prepare.mjs X.Y.Z — a clean version, no -beta');
}

const dirty = git('status --porcelain');
if (dirty) fail(`the working tree is not clean; commit or drop these first:\n${dirty}`);
if (git(`tag -l v${version}`)) fail(`tag v${version} already exists`);

const pkgPath = join(root, 'package.json');
const manifestPath = join(root, 'addon', 'manifest.json');
const pkgText = readFileSync(pkgPath, 'utf8');
const manifestText = readFileSync(manifestPath, 'utf8');
const released = JSON.parse(pkgText).version;
const built = JSON.parse(manifestText).version;
if (compareVersions(version, released) <= 0) {
  fail(`${version} is not newer than the released ${released} (package.json)`);
}
if (stripPrerelease(built) !== version) {
  // Legitimate — a test build named 1.10.12-beta shipped as 1.10.13 after a
  // rebase (2026-09-06) — but worth a line in the run's output.
  console.warn(`release-prepare: the manifest says ${built}, a test build named for ${stripPrerelease(built)}; releasing as ${version}`);
}

writeFileSync(pkgPath, setVersionLine(pkgText, version));
writeFileSync(manifestPath, setVersionLine(manifestText, version));
console.log(`package.json ${released} → ${version}; addon/manifest.json ${built} → ${version}`);

run('npm install --package-lock-only');
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== version || lock.packages?.['']?.version !== version) {
  fail(`package-lock.json did not take ${version}`);
}

run('npm test -- --reporter=dot');
run('npm run typecheck');
run('npm run build');

const xpi = join(root, 'build', 'zotero-tts.xpi');
if (!existsSync(xpi)) fail('build/zotero-tts.xpi is missing after the build');
const entry = new AdmZip(xpi).getEntry('manifest.json');
const shipped = entry && JSON.parse(entry.getData().toString('utf8')).version;
if (shipped !== version) fail(`the xpi's manifest says ${shipped}, not ${version}`);

console.log(`\nrelease-prepare: ${version} is ready. Changed:\n${git('status --porcelain')}`);
console.log(
  `Next: commit package.json, package-lock.json and addon/manifest.json as "chore: release ${version}", ` +
    `tag v${version}, push both, gh release create v${version} build/zotero-tts.xpi, ` +
    `then node scripts/release-point.mjs ${version}.`,
);
