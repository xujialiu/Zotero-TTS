import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The pane is parsed as XML by Zotero, and one bad token blanks the whole
 * settings pane: on 2026-09-10 a `--api-key` inside an XML comment did
 * (issue #89, caught before the build was installed). No XML parser is
 * among the dev dependencies, so the two tokens that bite are checked by
 * hand: a double hyphen inside a comment, and a bare ampersand.
 */
describe('addon/content/preferences.xhtml', () => {
  const root = join(__dirname, '..', '..');
  const markup = readFileSync(join(root, 'addon', 'content', 'preferences.xhtml'), 'utf8');

  it('has no double hyphen inside a comment', () => {
    const comments = [...markup.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1]);
    expect(comments.length).toBeGreaterThan(0);
    const bad = comments.filter((c) => c.includes('--'));
    expect(bad).toEqual([]);
  });

  it('closes every comment it opens', () => {
    expect((markup.match(/<!--/g) ?? []).length).toBe((markup.match(/-->/g) ?? []).length);
  });

  it('has no bare ampersand', () => {
    const bare = [...markup.matchAll(/&(?![a-zA-Z]+;|#\d+;|#x[0-9a-fA-F]+;)/g)].map((m) => markup.slice(Math.max(0, m.index! - 20), m.index! + 20));
    expect(bare).toEqual([]);
  });
});
