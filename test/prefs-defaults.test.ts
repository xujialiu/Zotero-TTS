import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULTS, PREF_PREFIX } from '../src/core/settings';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.assign(
      {},
      ...Object.entries(value as Record<string, unknown>).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)),
    );
  }
  return { [prefix]: value };
}

// prefs.js is the only place Zotero learns a default from; loadSettings()
// has its own copy in DEFAULTS. The two drift silently (a pref added in one
// and not the other just reads as "unset" at runtime), so pin them together.
describe('addon/prefs.js', () => {
  const src = readFileSync(join(root, 'addon', 'prefs.js'), 'utf8');
  const declared = new Map(
    [...src.matchAll(/pref\('([^']+)',\s*(.+?)\);/g)].map((m) => [m[1], JSON.parse(m[2].replace(/^'(.*)'$/, '"$1"'))]),
  );

  it('declares exactly the settings loadSettings() knows about', () => {
    const expected = Object.keys(flatten(DEFAULTS)).map((k) => PREF_PREFIX + k);
    expect([...declared.keys()].sort()).toEqual(expected.sort());
  });

  it('declares the same default values as DEFAULTS', () => {
    for (const [k, v] of Object.entries(flatten(DEFAULTS))) {
      expect(declared.get(PREF_PREFIX + k), k).toEqual(v);
    }
  });
});
