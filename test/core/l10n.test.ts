import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasMessageSource, setMessageSource, t, type MessageSource } from '../../src/core/l10n';
import { installEnglishStrings } from '../setup';

// test/setup.ts installs the en-US file before every test file; a test that
// swaps the source puts the file back
afterEach(installEnglishStrings);

describe('t', () => {
  it('formats a message with its arguments through the installed source', () => {
    const source: MessageSource = { formatValueSync: vi.fn((id, args) => `${id}:${args?.count}`) };
    setMessageSource(source);
    expect(t('ztts-x', { count: 3 })).toBe('ztts-x:3');
    expect(source.formatValueSync).toHaveBeenCalledWith('ztts-x', { count: 3 });
  });

  it('returns the id when no source is installed', () => {
    setMessageSource(null);
    expect(hasMessageSource()).toBe(false);
    expect(t('ztts-x')).toBe('ztts-x');
  });

  it('returns the id for a message the source does not have', () => {
    setMessageSource({ formatValueSync: () => null });
    expect(t('ztts-missing')).toBe('ztts-missing');
    setMessageSource({ formatValueSync: () => '' });
    expect(t('ztts-missing')).toBe('ztts-missing');
  });

  it('returns the id rather than throwing when the source throws', () => {
    setMessageSource({
      formatValueSync: () => {
        throw new Error('no bundle');
      },
    });
    expect(t('ztts-x')).toBe('ztts-x');
  });

  // The wiring every UI test relies on: the sentence a user reads, from the file
  it('renders the en-US file in the tests', () => {
    expect(hasMessageSource()).toBe(true);
    expect(t('ztts-heading-voice-browser')).toBe('Voice browser');
    expect(t('ztts-switch-enable')).toBe('Enable');
  });
});
