import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDateString } from '../../scripts/build-date.mjs';
import { BUILD_LINE_ID, PLUGIN_AUTHOR, buildLine, initBuildRows } from '../../src/ui/build-rows';
import { englishValue } from '../setup';

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
});
