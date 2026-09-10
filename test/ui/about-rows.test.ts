import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDateString, buildTimeString, timeZoneString } from '../../scripts/build-date.mjs';
import { ABOUT_AUTHOR_ID, ABOUT_BUILD_ID, PLUGIN_AUTHOR, PLUGIN_EMAIL, authorLine, buildLine, initAboutRows } from '../../src/ui/about-rows';
import { englishValue } from '../setup';

/** Where the star goes: the pane's link and the README's point at the same page. */
const REPOSITORY_URL = 'https://github.com/xujialiu/Zotero-TTS';

describe('buildLine', () => {
  it('names the version, the build date and the build time on one line', () => {
    expect(buildLine({ version: '1.8.6', date: '2026-08-29', time: '13:45:07 UTC+8' })).toBe('Version 1.8.6 · Date 2026-08-29 · Time 13:45:07 UTC+8');
  });

  // Why the section exists: a test build carries -beta / -betaN, and the pane
  // is where it is read off, without a trip to Tools → Plugins
  it('keeps the beta suffix of a test build', () => {
    expect(buildLine({ version: '1.8.6-beta2', date: '2026-08-29', time: '13:45:07 UTC+8' })).toBe('Version 1.8.6-beta2 · Date 2026-08-29 · Time 13:45:07 UTC+8');
  });

  it('leaves out what the build did not carry', () => {
    expect(buildLine({ version: '1.8.6', date: '', time: '' })).toBe('Version 1.8.6');
    expect(buildLine({ version: '', date: '2026-08-29', time: '13:45:07 UTC+8' })).toBe('Date 2026-08-29 · Time 13:45:07 UTC+8');
  });

  it('never renders an empty line', () => {
    expect(buildLine({ version: '', date: '', time: '' })).toBe('—');
  });
});

describe('authorLine', () => {
  it('names the author and the address to write to', () => {
    expect(authorLine()).toBe('Author Xujia Liu · Email xujialiuphd@gmail.com');
  });

  it('is the plugin author and email unless the caller says otherwise', () => {
    expect(authorLine({ author: 'Someone Else', email: 'someone@example.com' })).toBe('Author Someone Else · Email someone@example.com');
    expect(PLUGIN_AUTHOR).toBe('Xujia Liu');
    expect(PLUGIN_EMAIL).toBe('xujialiuphd@gmail.com');
  });
});

describe('initAboutRows', () => {
  it('writes both lines into the pane rows', () => {
    const rows: Record<string, { textContent: string | null }> = {
      [ABOUT_BUILD_ID]: { textContent: null },
      [ABOUT_AUTHOR_ID]: { textContent: null },
    };
    initAboutRows({ getElementById: (id) => rows[id] ?? null }, { version: '1.8.6', date: '2026-08-29', time: '13:45:07 UTC+8' });
    expect(rows[ABOUT_BUILD_ID].textContent).toBe('Version 1.8.6 · Date 2026-08-29 · Time 13:45:07 UTC+8');
    expect(rows[ABOUT_AUTHOR_ID].textContent).toBe('Author Xujia Liu · Email xujialiuphd@gmail.com');
  });

  it('leaves a pane without the rows alone', () => {
    expect(() => initAboutRows({ getElementById: () => null }, { version: '1.8.6' })).not.toThrow();
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

describe('buildTimeString', () => {
  // The zone is whatever machine runs this, so the clock is matched exactly
  // and the offset by shape
  it('is the local clock to the second, 24-hour and zero-padded, with the offset', () => {
    expect(buildTimeString(new Date(2026, 7, 29, 13, 45, 7))).toMatch(/^13:45:07 UTC[+-]\d{1,2}(:[0-5]\d)?$/);
    expect(buildTimeString(new Date(2026, 0, 2, 0, 5, 9))).toMatch(/^00:05:09 UTC[+-]\d{1,2}(:[0-5]\d)?$/);
  });
});

describe('timeZoneString', () => {
  /** A stand-in for the one thing the offset is read from. */
  const at = (offsetMinutes: number) => ({ getTimezoneOffset: () => offsetMinutes }) as Date;

  it('names the offset in whole hours, the odd half hour spelled out', () => {
    expect(timeZoneString(at(-480))).toBe('UTC+8');
    expect(timeZoneString(at(-330))).toBe('UTC+5:30');
    expect(timeZoneString(at(210))).toBe('UTC-3:30');
    expect(timeZoneString(at(300))).toBe('UTC-5');
    expect(timeZoneString(at(0))).toBe('UTC+0');
  });
});

describe('addon/', () => {
  const xhtml = readFileSync(new URL('../../addon/content/preferences.xhtml', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../../addon/manifest.json', import.meta.url), 'utf8'));

  it('carries the rows the About lines are written into, last in the pane', () => {
    expect(xhtml).toContain(`id="${ABOUT_BUILD_ID}"`);
    expect(xhtml.indexOf(`id="${ABOUT_AUTHOR_ID}"`)).toBeGreaterThan(xhtml.indexOf(`id="${ABOUT_BUILD_ID}"`));
    expect(xhtml.lastIndexOf('<groupbox>')).toBeLessThan(xhtml.indexOf(`id="${ABOUT_BUILD_ID}"`));
    expect(xhtml.indexOf('data-l10n-id="ztts-heading-about"')).toBeGreaterThan(xhtml.indexOf('data-l10n-id="ztts-heading-backup"'));
    expect(englishValue('ztts-heading-about')).toBe('About');
  });

  // The pane and Tools → Plugins name the same author
  it('declares the author the pane shows', () => {
    expect(manifest.author).toBe(PLUGIN_AUTHOR);
  });

  // Under the two lines, a word for the repository: the sentence
  // is a Fluent message whose link is named, Zotero's own pattern for its
  // Sync pane, so each language puts the link where its grammar wants it;
  // the href stays in the markup, and the click is Zotero's text-link
  // element's, straight to Zotero.launchURL
  it('links the About section to the repository, the way Zotero links its own panes', () => {
    const star = /<description data-l10n-id="ztts-about-star">\s*<label is="zotero-text-link" href="([^"]+)" data-l10n-name="github"\/>\s*<\/description>/.exec(xhtml);
    expect(star?.[1]).toBe(REPOSITORY_URL);
    expect(xhtml.indexOf('ztts-about-star')).toBeGreaterThan(xhtml.indexOf(`id="${ABOUT_AUTHOR_ID}"`));
  });

  it('asks for the star in one sentence, GitHub the link', () => {
    expect(englishValue('ztts-about-star')).toBe('If you like Zotero-TTS, give it a ⭐ on <label data-l10n-name="github">GitHub</label> — it helps others find it.');
  });

  // Fluent fills the label named github and drops a name the markup lacks:
  // the link must be named the same in every language
  it.each(['en-US', 'zh-CN'])('%s names the link inside the star line', (locale) => {
    const ftl = readFileSync(new URL(`../../addon/locale/${locale}/zotero-tts.ftl`, import.meta.url), 'utf8');
    expect(ftl).toMatch(/^ztts-about-star = \S.*<label data-l10n-name="github">GitHub<\/label>/m);
  });

  // The README is the docs site too, where the link is the way back to the
  // repository; the sentence is the pane's, word for word
  it('asks for the star in the README too, under the GIF', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    const star = readme.indexOf(`give it a ⭐ on <a href="${REPOSITORY_URL}">GitHub</a> — it helps others find it.`);
    expect(star).toBeGreaterThan(readme.indexOf('word-highlight.gif'));
    expect(star).toBeLessThan(readme.indexOf('## What it adds'));
  });
});
