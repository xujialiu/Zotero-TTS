/** Short numeric phrases give Fish little language context (issue #98). */
export function fishLanguageHint(text: string, locale?: string): string {
  if (typeof locale !== 'string' || !locale) return '';
  try {
    const tag = new Intl.Locale(locale);
    // Do not turn unknown/multilingual tags or private extensions into prompts.
    if (['mul', 'und', 'zxx'].includes(tag.language) || tag.toString() !== tag.baseName) return '';
    const name = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' }).of(tag.baseName);
    if (!name) return '';
    let words = 0;
    for (const part of new Intl.Segmenter(tag.baseName, { granularity: 'word' }).segment(text)) {
      if (part.isWordLike && ++words >= 4) return '';
    }
    if (!words) return '';
    return `[Speak in ${name}]${/^\s/u.test(text) ? '' : ' '}`;
  } catch {
    // A malformed/unsupported locale must not stop otherwise valid speech.
    return '';
  }
}
