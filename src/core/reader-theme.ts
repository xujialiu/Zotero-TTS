/**
 * The reader's colour theme, as Zotero resolves it (reader bundle
 * `_updateColorScheme`, shared by the PDF and the EPUB/snapshot views): the
 * app's colour scheme picks the `reader.lightTheme` or `reader.darkTheme`
 * pref, naming one of the built-in themes or one of the user's custom ones
 * (synced setting `readerCustomThemes`); an empty or unknown name means the
 * default light theme, white on #121212. Whether the result counts as light
 * or dark — which decides how highlights are blended — comes from the
 * relative luminance of its two colours, not from the slot it was picked
 * from: a dark custom theme in the light slot is dark.
 */

export interface ReaderTheme {
  id: string;
  label: string;
  /** '#rrggbb' */
  background: string;
  foreground: string;
}

export type ColorScheme = 'light' | 'dark';

export interface ResolvedReaderTheme extends ReaderTheme {
  scheme: ColorScheme;
}

/** Zotero's built-in themes (reader bundle DEFAULT_THEMES, 10.0.1); the default light theme is not among them. */
export const DEFAULT_THEMES: readonly ReaderTheme[] = [
  { id: 'dark', label: 'Dark', background: '#2E3440', foreground: '#D8DEE9' },
  { id: 'black', label: 'Black', background: '#000000', foreground: '#FFFFFF' },
  { id: 'snow', label: 'Snow', background: '#ECEFF4', foreground: '#3B4252' },
  { id: 'sepia', label: 'Sepia', background: '#F4ECD8', foreground: '#5B4636' },
];

export const LIGHT_THEME: ReaderTheme = { id: 'light', label: 'Light', background: '#ffffff', foreground: '#121212' };

const HEX = /^#[0-9a-f]{6}$/i;

/** Relative luminance as Zotero's getModeBasedOnColors computes it. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const weights = [0.2126, 0.7152, 0.0722];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    })
    .reduce((sum, channel, i) => sum + channel * weights[i], 0);
}

/** Light when the background is brighter than the text, as in Zotero. */
export function schemeOf(background: string, foreground: string): ColorScheme {
  return luminance(background) > luminance(foreground) ? 'light' : 'dark';
}

const isTheme = (t: unknown): t is ReaderTheme => {
  const o = t as Partial<ReaderTheme> | null;
  return !!o && typeof o === 'object' && typeof o.id === 'string' && HEX.test(String(o.background)) && HEX.test(String(o.foreground));
};

export interface ReaderThemeInput {
  /** The app's colour scheme (`prefers-color-scheme`), which the reader follows. */
  appScheme: ColorScheme;
  /** The `reader.lightTheme` pref: a theme id, or empty for the default light theme. */
  lightTheme: unknown;
  /** The `reader.darkTheme` pref: a theme id ('dark' by default); anything else means the default light theme. */
  darkTheme: unknown;
  /** The synced `readerCustomThemes` setting. */
  customThemes: unknown;
}

export function resolveReaderTheme(input: ReaderThemeInput): ResolvedReaderTheme {
  const custom = Array.isArray(input.customThemes) ? input.customThemes.filter(isTheme) : [];
  const themes = [...DEFAULT_THEMES, ...custom];
  const named = (id: unknown) => (typeof id === 'string' && id ? themes.find((t) => t.id === id) : undefined);
  const theme = (input.appScheme === 'dark' ? named(input.darkTheme) : named(input.lightTheme)) ?? LIGHT_THEME;
  return { ...theme, label: theme.label ?? theme.id, scheme: schemeOf(theme.background, theme.foreground) };
}
