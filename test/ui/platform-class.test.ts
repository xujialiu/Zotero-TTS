import { describe, expect, it } from 'vitest';
import { MAC_CLASS, markPlatform } from '../../src/ui/platform-class';

/**
 * The pane's root carries the platform as a class (issue #56): the sheet
 * cannot tell macOS apart on its own, since `-moz-platform` is honored in
 * chrome and UA sheets only and a plugin's pane sheet loads from its
 * jar:file: URL, where a `@media (-moz-platform: macos)` block is a
 * condition nobody recognizes and never matches.
 */
function fakeDocument() {
  const classes = new Set(['ztts-pane']);
  const root = { classList: { add: (name: string) => void classes.add(name) } };
  return { doc: { querySelector: (selector: string) => (selector === '.ztts-pane' ? root : null) }, classes };
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
