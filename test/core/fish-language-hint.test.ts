import { describe, expect, it } from 'vitest';
import { fishLanguageHint } from '../../src/core/fish-language-hint';

describe('Fish short-text language hints', () => {
  it.each(['100 exp', '2/50 HP', 'One', 'One two three', "Don't stop", '你好世界'])('hints 1–3 word-like segments in %s', text => {
    expect(fishLanguageHint(text, 'en-US')).toBe('[Speak in American English] ');
  });
  it.each(['', '  ', '<> *** 😀', 'One two three four', '1/2/3 HP', 'One two three four five'])('does not hint %s', text => {
    expect(fishLanguageHint(text, 'en-US')).toBe('');
  });
  it.each([undefined, '', 'mul', 'und', 'zxx', 'zz', 'English', 'en_US', '[en-US]', 'en-x-private'])('does not guess the language for %s', locale => {
    expect(fishLanguageHint('100 exp', locale)).toBe('');
  });
  it('uses the requested locale and preserves an existing leading space', () => {
    expect(fishLanguageHint(' 100 exp', 'en-GB')).toBe('[Speak in British English]');
    expect(fishLanguageHint('100 exp', 'de')).toBe('[Speak in German] ');
  });
  it('counts unspaced text with the supplied language', () => {
    expect(fishLanguageHint('你好世界', 'zh-CN')).toBe('[Speak in Chinese (China)] ');
    expect(fishLanguageHint('你好世界今天快乐', 'zh-CN')).toBe('');
  });
});
