/**
 * The About section, last in the settings pane: which build this is and who
 * wrote it, on two lines —
 * `Version 1.8.6-beta4 · Date 2026-08-29 · Time 13:45:07 UTC+8` over
 * `Author Xujia Liu · Email xujialiuphd@gmail.com`. Each field is named, so
 * the lines read on their own in a screenshot of a bug report, where the
 * section heading may well be cropped away.
 *
 * The pane named no version at all, so reading one off meant leaving for
 * Tools → Plugins and coming back — worst while testing, where a build
 * carries the `-beta` / `-betaN` suffix precisely so it is identifiable, and
 * the pane is where the verifying happens (issue #10). Two test builds of
 * the same version are told apart by the clock the second line carries.
 *
 * The version arrives with `startup` and registerPrefsPane keeps it
 * (src/index.ts, ui/prefs-pane.ts); nothing here reads the manifest. The date
 * and the time are the one thing the xpi carries no trace of, so
 * scripts/build.mjs bakes them in as `__BUILD_DATE__` / `__BUILD_TIME__` —
 * undefined outside a build (the tests), where the line simply leaves them
 * out.
 */

import { t } from '../core/l10n';

/** The pane's row for the build line (addon/content/preferences.xhtml). */
export const ABOUT_BUILD_ID = 'ztts-about-build';

/** The pane's row for the author line, under it. */
export const ABOUT_AUTHOR_ID = 'ztts-about-author';

/** As addon/manifest.json declares it, so the pane and Tools → Plugins agree. */
export const PLUGIN_AUTHOR = 'Xujia Liu';

/** Where to write about the plugin. */
export const PLUGIN_EMAIL = 'xujialiuphd@gmail.com';

/** The day scripts/build.mjs ran, local time; empty in an unbuilt bundle. */
export const BUILD_DATE = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';

/** The clock when it ran, 24-hour local time with its UTC offset; empty in an unbuilt bundle. */
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';

/** Shown when even the version is missing; a line is never left blank. */
const UNKNOWN = '—';

const SEPARATOR = ' · ';

interface RowLike {
  textContent: string | null;
}

export interface AboutRowsDocument {
  getElementById(id: string): RowLike | null;
}

export interface BuildInfo {
  version: string;
  date?: string;
  time?: string;
}

export interface AuthorInfo {
  author?: string;
  email?: string;
}

/** `Version 1.8.6-beta4 · Date 2026-08-29 · Time 13:45:07 UTC+8`, without the parts this build lacks. */
export function buildLine(info: BuildInfo): string {
  const version = info.version.trim();
  const date = (info.date ?? BUILD_DATE).trim();
  const time = (info.time ?? BUILD_TIME).trim();
  const parts = [
    version ? t('ztts-about-version', { version }) : '',
    date ? t('ztts-about-date', { date }) : '',
    time ? t('ztts-about-time', { time }) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(SEPARATOR) : UNKNOWN;
}

/** `Author Xujia Liu · Email xujialiuphd@gmail.com`. */
export function authorLine(info: AuthorInfo = {}): string {
  const author = (info.author ?? PLUGIN_AUTHOR).trim();
  const email = (info.email ?? PLUGIN_EMAIL).trim();
  const parts = [author ? t('ztts-about-author', { author }) : '', email ? t('ztts-about-email', { email }) : ''].filter(Boolean);
  return parts.length ? parts.join(SEPARATOR) : UNKNOWN;
}

export function initAboutRows(doc: AboutRowsDocument, info: BuildInfo): void {
  const build = doc.getElementById(ABOUT_BUILD_ID);
  if (build) build.textContent = buildLine(info);
  const author = doc.getElementById(ABOUT_AUTHOR_ID);
  if (author) author.textContent = authorLine();
}
