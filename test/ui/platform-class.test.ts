import { describe, expect, it } from 'vitest';
import { MAC_CLASS, markPlatform, panePlatform, PLATFORM_ATTR } from '../../src/ui/platform-class';

/**
 * The pane's root carries the platform as a class (issue #56): the sheet
 * cannot tell macOS apart on its own, since `-moz-platform` is honored in
 * chrome and UA sheets only and a plugin's pane sheet loads from its
 * jar:file: URL, where a `@media (-moz-platform: macos)` block is a
 * condition nobody recognizes and never matches. And the System voices note
 * is written once per platform (issue #23); the one for this platform stays.
 */
function fakeDocument() {
  const classes = new Set(['ztts-pane']);
  const root = { classList: { add: (name: string) => void classes.add(name) } };
  const notes = ['win', 'mac', 'other'].map((platform) => ({
    platform,
    hidden: false,
    getAttribute: (name: string) => (name === PLATFORM_ATTR ? platform : null),
  }));
  return {
    doc: {
      querySelector: (selector: string) => (selector === '.ztts-pane' ? root : null),
      querySelectorAll: (selector: string) => (selector === `[${PLATFORM_ATTR}]` ? notes : []),
    },
    classes,
    shown: () => notes.filter((n) => !n.hidden).map((n) => n.platform),
  };
}

describe('markPlatform (issue #56)', () => {
  it('marks the pane root ztts-mac on macOS', () => {
    const { doc, classes } = fakeDocument();
    markPlatform(doc, { isMac: true });
    expect(MAC_CLASS).toBe('ztts-mac');
    expect([...classes]).toEqual(['ztts-pane', 'ztts-mac']);
  });

  it('leaves the root alone elsewhere', () => {
    const { doc, classes } = fakeDocument();
    markPlatform(doc, { isMac: false });
    expect([...classes]).toEqual(['ztts-pane']);
  });

  it('survives a document without the root', () => {
    expect(() => markPlatform({ querySelector: () => null }, { isMac: true })).not.toThrow();
  });
});

describe('markPlatform shows the note for this platform (issue #23)', () => {
  it('keeps the macOS note on a Mac, the Windows note on Windows, and the other one elsewhere', () => {
    const mac = fakeDocument();
    markPlatform(mac.doc, { isMac: true, isWin: false });
    expect(mac.shown()).toEqual(['mac']);
    const win = fakeDocument();
    markPlatform(win.doc, { isMac: false, isWin: true });
    expect(win.shown()).toEqual(['win']);
    const linux = fakeDocument();
    markPlatform(linux.doc, { isMac: false, isWin: false });
    expect(linux.shown()).toEqual(['other']);
  });

  it('names the platform the way the markup does', () => {
    expect(PLATFORM_ATTR).toBe('data-ztts-platform');
    expect(panePlatform({ isMac: true, isWin: false })).toBe('mac');
    expect(panePlatform({ isMac: false, isWin: true })).toBe('win');
    expect(panePlatform({ isMac: false })).toBe('other');
  });
});
