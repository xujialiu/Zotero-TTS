import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDateString } from '../../scripts/build-date.mjs';
import { BUILD_LINE_ID, PLUGIN_AUTHOR, buildLine, initBuildRows } from '../../src/ui/build-rows';
import { englishValue } from '../setup';

/** Where the star goes: the pane's link and the README's point at the same page. */
const REPOSITORY_URL = 'https://github.com/xujialiu/Zotero-TTS';

describe('buildLine', () => {
  it('names the version, the build date and the author on one line', () => {
    expect(buildLine({ version: '1.8.6', date: '2026-08-29', author: 'Xujia Liu' })).toBe('Version 1.8.6 · Date 2026-08-29 · Author Xujia Liu');
  });

  // Why the section exists: a test build carries -beta / -betaN, and the pane
  // is where it is read off, without a trip to Tools → Plugins
  it('keeps the beta suffix of a test build', () => {
    expect(buildLine({ version: '1.8.6-beta2', date: '2026-08-29' })).toBe('Version 1.8.6-beta2 · Date 2026-08-29 · Author Xujia Liu');
  });

  it('falls back to the plugin author, and leaves out what the build did not carry', () => {
    expect(buildLine({ version: '1.8.6', date: '' })).toBe('Version 1.8.6 · Author Xujia Liu');
    expect(buildLine({ version: '', date: '2026-08-29' })).toBe('Date 2026-08-29 · Author Xujia Liu');
  });

  it('never renders an empty line', () => {
    expect(buildLine({ version: '', date: '', author: '' })).toBe('—');
  });
});

describe('initBuildRows', () => {
  it('writes the line into the pane row', () => {
    const row = { textContent: null as string | null };
    initBuildRows({ getElementById: (id) => (id === BUILD_LINE_ID ? row : null) }, { version: '1.8.6', date: '2026-08-29' });
    expect(row.textContent).toBe('Version 1.8.6 · Date 2026-08-29 · Author Xujia Liu');
  });

  it('leaves a pane without the row alone', () => {
    expect(() => initBuildRows({ getElementById: () => null }, { version: '1.8.6' })).not.toThrow();
  });
});

describe('buildDateString', () => {
  it('is the local calendar date, zero-padded', () => {
    expect(buildDateString(new Date(2026, 7, 29, 13, 45))).toBe('2026-08-29');
    expect(buildDateString(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02');
  });

  // A build at 00:30 in UTC+8 belongs to the day the machine says it is
  it('does not fall back to UTC', () => {
    expect(buildDateString(new Date(2026, 7, 29, 0, 30))).toBe('2026-08-29');
  });
});

describe('addon/', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../../addon/manifest.json', import.meta.url), 'utf8'));

  it('carries the row the Build line is written into, last in the pane', () => {
    expect(xhtml).toContain(`id="${BUILD_LINE_ID}"`);
    expect(xhtml.lastIndexOf('<groupbox>')).toBeLessThan(xhtml.indexOf(`id="${BUILD_LINE_ID}"`));
    expect(xhtml.indexOf('data-l10n-id="ztts-heading-build"')).toBeGreaterThan(xhtml.indexOf('data-l10n-id="ztts-heading-backup"'));
    expect(englishValue('ztts-heading-build')).toBe('Build');
  });

  // The pane and Tools → Plugins name the same author
  it('declares the author the pane shows', () => {
    expect(manifest.author).toBe(PLUGIN_AUTHOR);
  });

  // Under the version, a word for the repository: the sentence
  // is a Fluent message whose link is named, Zotero's own pattern for its
  // Sync pane, so each language puts the link where its grammar wants it;
  // the href stays in the markup, and the click is Zotero's text-link
  // element's, straight to Zotero.launchURL
  it('links the Build section to the repository, the way Zotero links its own panes', () => {
    const star = /<description data-l10n-id="ztts-build-star">\s*<label is="zotero-text-link" href="([^"]+)" data-l10n-name="github"\/>\s*<\/description>/.exec(xhtml);
    expect(star?.[1]).toBe(REPOSITORY_URL);
    expect(xhtml.indexOf('ztts-build-star')).toBeGreaterThan(xhtml.indexOf(`id="${BUILD_LINE_ID}"`));
  });

  it('asks for the star in one sentence, GitHub the link', () => {
    expect(englishValue('ztts-build-star')).toBe('If you like Zotero-TTS, give it a ⭐ on <label data-l10n-name="github">GitHub</label>');
  });

  // Fluent fills the label named github and drops a name the markup lacks:
  // the link must be named the same in every language
  it.each(['en-US', 'zh-CN'])('%s names the link inside the star line', (locale) => {
    const ftl = readFileSync(new URL(`../../addon/locale/${locale}/zotero-tts.ftl`, import.meta.url), 'utf8');
    expect(ftl).toMatch(/^ztts-build-star = \S.*<label data-l10n-name="github">GitHub<\/label>/m);
  });

  it('asks for the star in the README too, under the GIF', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    const star = readme.indexOf(`<a href="${REPOSITORY_URL}">GitHub</a>`);
    expect(star).toBeGreaterThan(readme.indexOf('word-highlight.gif'));
    expect(star).toBeLessThan(readme.indexOf('## What is this?'));
  });
});
