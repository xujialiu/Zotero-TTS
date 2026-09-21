import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasMessageSource, paneElementBlank, sentences, setMessageSource, t, type MessageSource, type PaneElement } from '../../src/core/l10n';
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

describe('sentences', () => {
  it('puts sentences side by side through the joiner message, empty parts left out', () => {
    expect(sentences('Connected.', '', 'Synthesis works.', null, undefined)).toBe('Connected. Synthesis works.');
    expect(sentences('Connected.')).toBe('Connected.');
    expect(sentences('', null)).toBe('');
  });

  it('follows the language: a joiner without the space joins with nothing', () => {
    setMessageSource({ formatValueSync: (id, args) => (id === 'ztts-join' ? `${args?.first}${args?.second}` : id) });
    expect(sentences('已连接。', '合成正常。')).toBe('已连接。合成正常。');
  });
});

/** A pane element holding `text` and these attributes. */
function element(text: string | null, attrs: Record<string, string> = {}): PaneElement {
  return { textContent: text, getAttribute: (name) => attrs[name] ?? null };
}

describe('paneElementBlank', () => {
  it('calls an element blank when Fluent put nothing on it', () => {
    expect(paneElementBlank(element(''))).toBe(true);
    expect(paneElementBlank(element(' \n  '))).toBe(true);
    expect(paneElementBlank(element(null))).toBe(true);
  });

  // The markup gives every help icon its ?; only the .help proves Fluent ran
  it("does not take a help icon's own ? for its string", () => {
    expect(paneElementBlank(element('', { value: '?' }))).toBe(true);
    expect(paneElementBlank(element('', { value: '?', help: 'Cycle through the voices.' }))).toBe(false);
  });

  it("reads the text and every attribute the pane's messages set", () => {
    expect(paneElementBlank(element('Voice browser'))).toBe(false);
    expect(paneElementBlank(element('', { value: 'Next voice' }))).toBe(false);
    for (const name of ['label', 'placeholder', 'tooltiptext', 'help']) expect(paneElementBlank(element('', { [name]: 'x' })), name).toBe(false);
  });

  // A field that shows no text of its own is named for a screen reader
  it("reads a field's aria-label (issue #103)", () => {
    expect(paneElementBlank(element('', { 'aria-label': 'Bracket pairs to remove' }))).toBe(false);
  });

  it('takes neither an empty attribute nor the markup\'s own for a string', () => {
    expect(paneElementBlank(element('', { label: '', 'aria-label': '', id: 'ztts-bracket-pairs', 'data-l10n-id': 'ztts-bracket-pairs', type: 'text' }))).toBe(true);
  });
});
