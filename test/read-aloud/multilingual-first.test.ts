import { describe, expect, it, vi } from 'vitest';
import { createMultilingualFirst, SORT_FIRST_PREFIX, type MultilingualFirstDeps } from '../../src/read-aloud/multilingual-first';

const LABELS: Record<string, string> = { mul: 'Multiple languages', en: 'English', 'zh-CN': 'Chinese (China)' };

/**
 * A reader iframe as the sandbox actually sees it: the window arrives
 * behind a wrapper that showed WebIDL members but not the JS globals
 * (Intl) in the live incident of 2026-08-26 — waiving the window exposed
 * them. With `strictOptions`, the DisplayNames constructor also models
 * the reader-compartment native that cannot read a sandbox-allocated
 * options object: only an options value passed through cloneInto counts.
 */
function fakeReader({ strictOptions = false } = {}) {
  class FakeDisplayNames {
    constructor(_locales?: unknown, options?: { type?: string; __cloned?: boolean }) {
      if (strictOptions && !options?.__cloned) throw new TypeError('missing "type" option in DisplayNames()');
    }
    of(code: string): string | undefined {
      return LABELS[code];
    }
  }
  const realWindow = { Intl: { DisplayNames: FakeDisplayNames } };
  const xrayWindow = { clearTimeout() {} };
  const waiveXrays = vi.fn(<T>(value: T): T => (value === (xrayWindow as unknown) ? (realWindow as unknown as T) : value));
  const cloneInto = vi.fn((_reader: unknown, value: Record<string, unknown>) => ({ ...value, __cloned: true }));
  return { reader: { _iframeWindow: xrayWindow }, DisplayNames: FakeDisplayNames, waiveXrays, cloneInto, realWindow };
}

function deps(overrides: Partial<MultilingualFirstDeps> = {}): MultilingualFirstDeps {
  return { error: vi.fn(), ...overrides };
}

describe('createMultilingualFirst', () => {
  it('reaches Intl through the waived window and prefixes only the mul label', () => {
    const { reader, DisplayNames, waiveXrays } = fakeReader();
    const first = createMultilingualFirst(deps({ waiveXrays }));
    expect(first.attach(reader)).toBe(true);
    const names = new DisplayNames();
    expect(names.of('mul')).toBe(SORT_FIRST_PREFIX + 'Multiple languages');
    expect(names.of('en')).toBe('English');
    expect(names.of('zh-CN')).toBe('Chinese (China)');
    expect(waiveXrays).toHaveBeenCalledWith(reader._iframeWindow);
  });

  it('patches a window whose Intl is directly visible even without the waiver', () => {
    const { realWindow, DisplayNames } = fakeReader();
    const first = createMultilingualFirst(deps());
    expect(first.attach({ _iframeWindow: realWindow })).toBe(true);
    expect(new DisplayNames().of('mul')).toBe(SORT_FIRST_PREFIX + 'Multiple languages');
  });

  it('leaves a label the original could not produce untouched', () => {
    const { reader, DisplayNames, waiveXrays } = fakeReader();
    createMultilingualFirst(deps({ waiveXrays })).attach(reader);
    // The fake returns undefined for unknown codes, as DisplayNames does without a fallback
    expect(new DisplayNames().of('xx')).toBeUndefined();
  });

  it('patches a prototype once, however many readers share the iframe', () => {
    const { reader, DisplayNames, waiveXrays } = fakeReader();
    const first = createMultilingualFirst(deps({ waiveXrays }));
    first.attach(reader);
    first.attach(reader);
    first.attach({ _iframeWindow: reader._iframeWindow });
    expect(new DisplayNames().of('mul')).toBe(SORT_FIRST_PREFIX + 'Multiple languages');
  });

  it('reports readers it cannot patch instead of throwing', () => {
    const first = createMultilingualFirst(deps());
    expect(first.attach(null)).toBe(false);
    expect(first.attach({})).toBe(false);
    // The 2026-08-26 shipping bug: over the window's Xray the Intl global
    // is invisible, so without the waiver there is nothing to patch
    expect(first.attach(fakeReader().reader)).toBe(false);
    expect(first.attach({ _iframeWindow: { Intl: {} } })).toBe(false);
  });

  it('exports the wrapper into the reader compartment and waives what arrives as this', () => {
    const { reader, DisplayNames, waiveXrays } = fakeReader();
    const exportFunction = vi.fn((fn: (...args: any[]) => any) => fn);
    createMultilingualFirst(deps({ exportFunction, waiveXrays })).attach(reader);
    expect(exportFunction).toHaveBeenCalledOnce();
    const names = new DisplayNames();
    names.of('mul');
    expect(waiveXrays).toHaveBeenCalledWith(names);
  });

  it('dispose puts the original back', () => {
    const { reader, DisplayNames, waiveXrays } = fakeReader();
    const first = createMultilingualFirst(deps({ waiveXrays }));
    first.attach(reader);
    first.dispose();
    expect(new DisplayNames().of('mul')).toBe('Multiple languages');
  });

  it('inspect shows both views of Intl, whether the reader is patched, and the live mul label', () => {
    const { reader, waiveXrays, cloneInto } = fakeReader();
    const first = createMultilingualFirst(deps({ waiveXrays, cloneInto }));
    expect(first.inspect(reader)).toMatchObject({ patched: false, intl: { direct: 'undefined', waived: 'object' } });
    first.attach(reader);
    expect(first.inspect(reader)).toMatchObject({ patched: true, mulLabel: SORT_FIRST_PREFIX + 'Multiple languages' });
  });

  // The 2026-08-26 diagnostics crash: the options object was allocated in
  // the sandbox, the reader-compartment DisplayNames constructor cannot
  // read it ("missing type option"), and the throw discarded every other
  // field of the report. Options go through cloneInto; a probe that still
  // fails costs only its own field.
  it('inspect clones the constructor options into the reader compartment', () => {
    const { reader, waiveXrays, cloneInto } = fakeReader({ strictOptions: true });
    const first = createMultilingualFirst(deps({ waiveXrays, cloneInto }));
    first.attach(reader);
    expect(first.inspect(reader)).toMatchObject({ patched: true, mulLabel: SORT_FIRST_PREFIX + 'Multiple languages' });
    expect(cloneInto).toHaveBeenCalledWith(reader, { type: 'language' });
  });

  it('inspect survives a probe that throws and still reports the rest', () => {
    const { reader, waiveXrays } = fakeReader({ strictOptions: true });
    const first = createMultilingualFirst(deps({ waiveXrays }));
    first.attach(reader);
    const report = first.inspect(reader);
    expect(report).toMatchObject({ patched: true, intl: { direct: 'undefined', waived: 'object' } });
    expect(String(report.mulLabelError)).toContain('missing');
    expect(report.mulLabel).toBeUndefined();
  });
});

// The mechanism rests on two runtime facts; pin the collation one (the
// other — HTML collapsing a leading space under white-space: nowrap — has
// no DOM here and is recorded in NOTES.md).
describe('the leading space sorts first', () => {
  it('collates before Latin and Han labels in the locales that matter', () => {
    const label = SORT_FIRST_PREFIX + 'Multiple languages';
    for (const locale of ['en', 'zh', 'ja', 'de']) {
      expect(label.localeCompare('Afrikaans', locale)).toBeLessThan(0);
      expect((SORT_FIRST_PREFIX + '多语种').localeCompare('阿拉伯语', locale)).toBeLessThan(0);
      expect((SORT_FIRST_PREFIX + '多语种').localeCompare('中文', locale)).toBeLessThan(0);
    }
  });
});
