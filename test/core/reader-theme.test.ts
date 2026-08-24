import { describe, expect, it } from 'vitest';
import { DEFAULT_THEMES, LIGHT_THEME, resolveReaderTheme, schemeOf } from '../../src/core/reader-theme';

describe('schemeOf', () => {
  it('is light when the background is brighter than the text, as in Zotero', () => {
    expect(schemeOf('#ffffff', '#121212')).toBe('light');
    expect(schemeOf('#F4ECD8', '#5B4636')).toBe('light');
    expect(schemeOf('#2E3440', '#D8DEE9')).toBe('dark');
    expect(schemeOf('#000000', '#FFFFFF')).toBe('dark');
  });
});

describe('resolveReaderTheme', () => {
  const base = { lightTheme: '', darkTheme: 'dark', customThemes: [] };

  it("is the default light theme in a light app with nothing chosen, and Zotero's Dark in a dark app", () => {
    expect(resolveReaderTheme({ ...base, appScheme: 'light' })).toEqual({ ...LIGHT_THEME, scheme: 'light' });
    expect(resolveReaderTheme({ ...base, appScheme: 'dark' })).toEqual({ ...DEFAULT_THEMES[0], scheme: 'dark' });
  });

  it('follows the chosen built-in theme of the slot the app scheme picks', () => {
    expect(resolveReaderTheme({ ...base, appScheme: 'light', lightTheme: 'sepia' })).toMatchObject({ id: 'sepia', background: '#F4ECD8', scheme: 'light' });
    expect(resolveReaderTheme({ ...base, appScheme: 'dark', darkTheme: 'black' })).toMatchObject({ id: 'black', scheme: 'dark' });
    // The other slot is not consulted
    expect(resolveReaderTheme({ ...base, appScheme: 'dark', lightTheme: 'sepia' })).toMatchObject({ id: 'dark' });
  });

  it('takes custom themes, and judges light or dark by their colors, not by their slot', () => {
    const customThemes = [{ id: 'custom1', label: 'Night', background: '#101820', foreground: '#e0e0e0' }];
    expect(resolveReaderTheme({ ...base, appScheme: 'light', lightTheme: 'custom1', customThemes })).toEqual({
      id: 'custom1',
      label: 'Night',
      background: '#101820',
      foreground: '#e0e0e0',
      scheme: 'dark',
    });
  });

  it('falls back to the default light theme for an unknown, cleared or malformed choice', () => {
    expect(resolveReaderTheme({ ...base, appScheme: 'light', lightTheme: 'gone' })).toMatchObject({ id: 'light' });
    expect(resolveReaderTheme({ ...base, appScheme: 'dark', darkTheme: false })).toMatchObject({ id: 'light', scheme: 'light' });
    expect(resolveReaderTheme({ ...base, appScheme: 'dark', darkTheme: undefined })).toMatchObject({ id: 'light' });
    const customThemes = [{ id: 'custom2', label: 'Broken', background: 'red', foreground: '#000000' }, 'junk'];
    expect(resolveReaderTheme({ ...base, appScheme: 'light', lightTheme: 'custom2', customThemes })).toMatchObject({ id: 'light' });
    expect(resolveReaderTheme({ ...base, appScheme: 'light', customThemes: 'not a list' })).toMatchObject({ id: 'light' });
  });
});
