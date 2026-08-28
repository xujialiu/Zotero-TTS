import { describe, expect, it } from 'vitest';
import { baseLanguage, dropdownLabels, dropdownLanguage, languageDisplayName } from '../../src/read-aloud/language-dropdown';

// The popup's language dropdown, as the voice browser's language column
// reproduces it: Zotero's normalizeLanguage and LanguageRegionSelect (the
// reader bundle), pinned here.

describe('dropdownLanguage', () => {
  it('keeps a plain locale, and the base language of one', () => {
    expect(dropdownLanguage('en-US')).toBe('en-US');
    expect(dropdownLanguage('en')).toBe('en');
    expect(dropdownLanguage('mul')).toBe('mul');
    expect(baseLanguage('en-US')).toBe('en');
    expect(baseLanguage('zh-Hans-CN')).toBe('zh');
  });

  // REGION_EQUIVALENTS: Zotero's own tiers do not name the Chinese regions, so one "Chinese" holds them all
  it('files every Chinese region under zh, as Zotero does', () => {
    expect(dropdownLanguage('zh-CN')).toBe('zh');
    expect(dropdownLanguage('zh-HK')).toBe('zh');
    expect(dropdownLanguage('zh-TW')).toBe('zh');
    expect(dropdownLanguage('cmn-CN')).toBe('zh');
  });

  it('files the Arabic ar-XA and ar-SA under ar-001, the other regions as they are', () => {
    expect(dropdownLanguage('ar-XA')).toBe('ar-001');
    expect(dropdownLanguage('ar-SA')).toBe('ar-001');
    expect(dropdownLanguage('ar-EG')).toBe('ar-EG');
  });
});

const NAMES: Record<string, string> = {
  en: 'English',
  'en-US': 'English (United States)',
  'en-GB': 'English (United Kingdom)',
  zh: 'Chinese',
  de: 'German',
  'de-DE': 'German (Germany)',
  mul: 'Multiple languages',
};
const name = (code: string) => NAMES[code] ?? code;

describe('dropdownLabels', () => {
  it('names a language with its region only where the list holds it in several regions', () => {
    expect([...dropdownLabels(['en-US', 'en-GB', 'de-DE', 'zh', 'mul'], name)]).toEqual([
      ['en-US', 'English (United States)'],
      ['en-GB', 'English (United Kingdom)'],
      ['de-DE', 'German'],
      ['zh', 'Chinese'],
      ['mul', 'Multiple languages'],
    ]);
  });

  it('counts a language listed twice once', () => {
    expect([...dropdownLabels(['en-US', 'en-US'], name)]).toEqual([['en-US', 'English']]);
  });
});

describe('languageDisplayName', () => {
  it('writes the region in full, as the dropdown does — never "American English"', () => {
    expect(languageDisplayName('en-US', 'en')).toBe('English (United States)');
    expect(languageDisplayName('en', 'en')).toBe('English');
    expect(languageDisplayName('mul', 'en')).toBe('Multiple languages');
    expect(languageDisplayName('ar-001', 'en')).toBe('Arabic (world)');
  });

  it('follows the app locale', () => {
    expect(languageDisplayName('en-US', 'zh-CN')).toBe('英语（美国）');
    expect(languageDisplayName('mul', 'zh-CN')).toBe('多语种');
  });

  it('falls back to the tag itself for one ICU cannot name', () => {
    expect(languageDisplayName('not a tag', 'en')).toBe('not a tag');
  });
});
