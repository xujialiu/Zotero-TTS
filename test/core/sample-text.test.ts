import { describe, expect, it } from 'vitest';
import { sampleTextForLocale } from '../../src/core/sample-text';
import { MULTILINGUAL } from '../../src/core/providers/types';

describe('sampleTextForLocale', () => {
  it('speaks English for English locales', () => {
    expect(sampleTextForLocale('en-US')).toMatch(/reading aloud/);
    expect(sampleTextForLocale('en-GB')).toBe(sampleTextForLocale('en-US'));
  });

  it('picks the language from the base tag', () => {
    expect(sampleTextForLocale('zh-CN')).toMatch(/朗读/);
    expect(sampleTextForLocale('ja-JP')).toMatch(/こんにちは/);
    expect(sampleTextForLocale('de-DE')).toMatch(/Vorlesen/);
  });

  it('gives Traditional Chinese regions their own text', () => {
    expect(sampleTextForLocale('zh-TW')).toMatch(/朗讀/);
    expect(sampleTextForLocale('zh-HK')).toBe(sampleTextForLocale('zh-TW'));
    expect(sampleTextForLocale('zh-CN')).not.toBe(sampleTextForLocale('zh-TW'));
  });

  it('is case-insensitive, as BCP-47 tags are', () => {
    expect(sampleTextForLocale('ZH-cn')).toBe(sampleTextForLocale('zh-CN'));
  });

  // The TODO asks for "English plus Chinese for multilingual voices":
  // a multilingual voice proves itself by switching languages mid-sample.
  it('combines English and Chinese for multilingual voices', () => {
    const sample = sampleTextForLocale(MULTILINGUAL);
    expect(sample).toMatch(/Hello/);
    expect(sample).toMatch(/你好/);
    expect(sampleTextForLocale('*')).toBe(sample);
  });

  it('falls back to English for a language it has no text for', () => {
    expect(sampleTextForLocale('xx-XX')).toBe(sampleTextForLocale('en-US'));
    expect(sampleTextForLocale('')).toBe(sampleTextForLocale('en-US'));
  });

  it('keeps every sample short enough to cost nothing', () => {
    // Paid providers bill per character; a sample is a taste, not a meal.
    for (const locale of ['en-US', 'zh-CN', 'ja-JP', 'ru-RU', MULTILINGUAL, 'xx']) {
      expect(sampleTextForLocale(locale).length).toBeLessThanOrEqual(120);
    }
  });
});
