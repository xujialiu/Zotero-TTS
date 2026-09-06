import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The pane's stylesheet against the platforms (issue #56).
 *
 * Zotero's own preferences.css gives every XUL button `margin: 0 -2px -1px`
 * on macOS only, where the toolkit's Aqua margins would otherwise stand,
 * and leaves the toolkit's 5px inline margins alone on Windows and Linux.
 * The sheet's button rules put the macOS pairs apart again and must apply
 * nowhere else: elsewhere the same margin would land on top of the
 * toolkit's, and nothing in this repository can measure a Windows pane.
 * macOS is told by the `ztts-mac` class ui/platform-class.ts puts on the
 * pane's root, never by a media query: `-moz-platform` is honored in
 * chrome and UA sheets only, and this sheet reaches the window under the
 * xpi's jar:file: URL, where such a block never matches (measured
 * 2026-09-06).
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sheet = readFileSync(join(root, 'addon', 'content', 'preferences.css'), 'utf8');

interface Rule {
  /** The at-rule preludes enclosing the rule, outermost first. */
  conditions: string[];
  selector: string;
  declarations: string;
}

/** Every style rule of the sheet, comments stripped, nesting tracked. */
function rulesOf(css: string): Rule[] {
  const out: Rule[] = [];
  const stack: string[] = [];
  let buf = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') {
      stack.push(buf.trim());
      buf = '';
    } else if (ch === '}') {
      const prelude = stack.pop() ?? '';
      const declarations = buf.trim();
      if (declarations) out.push({ conditions: stack.filter((p) => p.startsWith('@')), selector: prelude, declarations });
      buf = '';
    } else {
      buf += ch;
    }
  }
  return out;
}

describe('the pane stylesheet and the platforms (issue #56)', () => {
  const buttonRules = rulesOf(sheet).filter((r) => /\bbutton\b/.test(r.selector));

  it('spaces a button after a button, and a ? after a button, on macOS', () => {
    const pair = buttonRules.find((r) => /button\s*\+\s*button/.test(r.selector));
    expect(pair?.declarations).toMatch(/margin-inline-start:\s*8px/);
    const help = buttonRules.find((r) => /button\s*\+\s*label\.ztts-help/.test(r.selector));
    expect(help?.declarations).toMatch(/margin-inline-start:\s*5px/);
  });

  it('scopes every button rule by the macOS class on the pane root, under no at-rule', () => {
    expect(buttonRules.length).toBeGreaterThan(0);
    for (const rule of buttonRules) {
      expect(rule.selector, rule.selector).toMatch(/^\.ztts-pane\.ztts-mac\b/);
      expect(rule.conditions, rule.selector).toEqual([]);
    }
  });

  it('uses no -moz- media feature anywhere: inert in a plugin sheet', () => {
    expect(sheet.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/@media[^{]*-moz-/);
  });
});

/**
 * The ? icons (issue #53). The glyph reads at the pane's own size, like
 * every other string in the pane: the rule declares no font-size, so the
 * label inherits it. The circle is sized in that same em, and is left a
 * little wider than the glyph's line box, which is 1em tall at
 * `line-height: 1` and has the 1px border on each side to clear.
 */
describe('the ? icons (issue #53)', () => {
  const help = rulesOf(sheet).find((r) => r.selector === 'label.ztts-help[value]');

  it('sets no font-size of its own: the glyph is the pane’s size', () => {
    expect(help).toBeDefined();
    expect(help?.declarations).not.toMatch(/font-size/);
  });

  it('draws the circle wider than the glyph’s 1em line box plus the border', () => {
    const size = (side: string) => Number(help?.declarations.match(new RegExp(`${side}:\\s*([\\d.]+)em`))?.[1]);
    expect(size('width')).toBeGreaterThan(1.15);
    expect(size('height')).toBe(size('width'));
    expect(help?.declarations).toMatch(/line-height:\s*1\b/);
  });
});
