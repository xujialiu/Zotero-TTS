// Steps 2 and 3 of a release (CLAUDE.md, Releasing):
//   node scripts/release-point.mjs X.Y.Z           after `gh release create`:
//     checks that the release asset answers 200, then points update.json at
//     it and stops — the commit and the push are git-chores'.
//   node scripts/release-point.mjs X.Y.Z --verify  after that push: reads
//     the raw update.json every installed copy fetches, and the asset it
//     names. raw.githubusercontent.com caches the file for up to five
//     minutes (notes/NOTES.md, 2026-08-31), so a stale read exits 2 with
//     the time to wait — it is not a failed release, and 1 is.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION_RE, pointUpdateJson, releaseLink } from './release-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_ID = 'zotero-tts@xujialiu.top';
const [version, flag] = process.argv.slice(2);

function fail(reason, code = 1) {
  console.error(`release-point: ${reason}`);
  process.exit(code);
}

/** A GET with its body dropped: the status after redirects is all that is read. */
async function head(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  await res.body?.cancel();
  return res.status;
}

if (!version || !VERSION_RE.test(version)) fail('usage: node scripts/release-point.mjs X.Y.Z [--verify]');
const link = releaseLink(version);

if (flag === '--verify') {
  const manifest = JSON.parse(readFileSync(join(root, 'addon', 'manifest.json'), 'utf8'));
  const updateUrl = manifest.applications.zotero.update_url;
  const res = await fetch(updateUrl, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (res.status !== 200) fail(`${updateUrl} answered ${res.status}`);
  const served = JSON.parse(await res.text()).addons[PLUGIN_ID].updates[0];
  if (served.version !== version || served.update_link !== link) {
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 300);
    const age = Number(res.headers.get('age') ?? 0);
    fail(
      `the raw update.json still serves ${served.version} (${served.update_link}); ` +
        `the copy is cached for ${maxAge} s and is ${age} s old — try again in ${Math.max(maxAge - age, 15)} s`,
      2,
    );
  }
  const status = await head(link);
  if (status !== 200) fail(`${link} answered ${status}`);
  console.log(`release-point: the raw update.json serves ${version} and ${link} answers 200`);
} else if (flag) {
  fail(`unknown flag ${flag}`);
} else {
  const status = await head(link);
  if (status !== 200) fail(`${link} answered ${status}; run gh release create v${version} build/zotero-tts.xpi first`);
  const updatePath = join(root, 'update.json');
  const text = readFileSync(updatePath, 'utf8');
  const before = JSON.parse(text).addons[PLUGIN_ID].updates[0].version;
  writeFileSync(updatePath, pointUpdateJson(text, version));
  console.log(`update.json: ${before} → ${version} (${link})`);
  console.log(
    `Next: commit update.json alone as "chore: point update.json at ${version}", push, ` +
      `then node scripts/release-point.mjs ${version} --verify.`,
  );
}
