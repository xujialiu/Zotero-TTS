/**
 * The Build section, last in the settings pane: which build this is, on one
 * line — `Version 1.8.6-beta4 · Date 2026-08-29 · Author Xujia Liu`. Each
 * field is named, so the line reads on its own in a screenshot of a bug
 * report, where the section heading may well be cropped away.
 *
 * The pane named no version at all, so reading one off meant leaving for
 * Tools → Plugins and coming back — worst while testing, where a build
 * carries the `-beta` / `-betaN` suffix precisely so it is identifiable, and
 * the pane is where the verifying happens (issue #10).
 *
 * The version arrives with `startup` and registerPrefsPane keeps it
 * (src/index.ts, ui/prefs-pane.ts); nothing here reads the manifest. The date
 * is the one thing the xpi carries no trace of, so scripts/build.mjs bakes it
 * in as `__BUILD_DATE__` — undefined outside a build (the tests), where the
 * line simply leaves it out.
 */

/** The pane's row for the line (addon/content/preferences.xhtml). */
export const BUILD_LINE_ID = 'ztts-build-line';

/** As addon/manifest.json declares it, so the pane and Tools → Plugins agree. */
export const PLUGIN_AUTHOR = 'Xujia Liu';

/** The day scripts/build.mjs ran, local time; empty in an unbuilt bundle. */
export const BUILD_DATE = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';

/** Shown when even the version is missing; the line is never left blank. */
const UNKNOWN = '—';

const SEPARATOR = ' · ';

interface RowLike {
  textContent: string | null;
}

export interface BuildRowsDocument {
  getElementById(id: string): RowLike | null;
}

export interface BuildInfo {
  version: string;
  date?: string;
  author?: string;
}

/** `Version 1.8.6-beta4 · Date 2026-08-29 · Author Xujia Liu`, without the parts this build lacks. */
export function buildLine(info: BuildInfo): string {
  const fields: Array<[string, string]> = [
    ['Version', info.version],
    ['Date', info.date ?? BUILD_DATE],
    ['Author', info.author ?? PLUGIN_AUTHOR],
  ];
  const parts = fields.filter(([, value]) => value.trim()).map(([name, value]) => `${name} ${value.trim()}`);
  return parts.length ? parts.join(SEPARATOR) : UNKNOWN;
}

export function initBuildRows(doc: BuildRowsDocument, info: BuildInfo): void {
  const row = doc.getElementById(BUILD_LINE_ID);
  if (row) row.textContent = buildLine(info);
}
