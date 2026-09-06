// The pure parts of the release scripts (release-prepare.mjs, release-point.mjs),
// kept apart so test/release-scripts.test.ts can pin them: how a version is
// compared, and that a version line is rewritten in place while every other
// byte of the file stays — the files are edited as text, never re-serialized.

/** A clean release version: `1.10.15`, never a `-beta` build. */
export const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** `1.10.15-beta3` → `1.10.15`: the version a test build was named for. */
export function stripPrerelease(version) {
  return version.replace(/-.*$/, '');
}

/**
 * Numeric order of two `X.Y.Z` versions, prerelease suffixes ignored: -1, 0
 * or 1. Not Mozilla's comparator (test/zotero-version.ts has that) — this
 * only decides whether a release goes forward.
 */
export function compareVersions(a, b) {
  const pa = stripPrerelease(a).split('.').map(Number);
  const pb = stripPrerelease(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * The text of package.json or addon/manifest.json with its first — the
 * top-level — `"version": "…"` set to `version`. Nothing else moves.
 */
export function setVersionLine(text, version) {
  const m = /("version"\s*:\s*")([^"]*)(")/.exec(text);
  if (!m) throw new Error('no "version" line');
  return text.slice(0, m.index) + m[1] + version + m[3] + text.slice(m.index + m[0].length);
}

/** The release asset's URL — what update.json's `update_link` must name. */
export function releaseLink(version) {
  return `https://github.com/xujialiu/Zotero-TTS/releases/download/v${version}/zotero-tts.xpi`;
}

/**
 * update.json's text pointed at `version`: its one `"version"` and its one
 * `"update_link"` replaced, nothing else touched. Throws when either key is
 * missing or appears twice — the file holds one entry by design.
 */
export function pointUpdateJson(text, version) {
  let out = text;
  for (const [key, value] of [
    ['version', version],
    ['update_link', releaseLink(version)],
  ]) {
    const matches = [...out.matchAll(new RegExp(`("${key}"\\s*:\\s*")([^"]*)(")`, 'g'))];
    if (matches.length !== 1) throw new Error(`update.json has ${matches.length} "${key}" values, expected one`);
    const m = matches[0];
    out = out.slice(0, m.index) + m[1] + value + m[3] + out.slice(m.index + m[0].length);
  }
  return out;
}
