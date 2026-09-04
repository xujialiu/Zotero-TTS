import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The Chinese pages against the English ones (issue #29).
 *
 * A Chinese page that has quietly fallen behind an English edit is worse
 * than no Chinese page: it reads as current and is wrong. So every `X.zh.md`
 * opens with the hash of the `X.md` it was translated from, and this fails
 * when that hash has moved — the way test/prefs-defaults.test.ts pins
 * DEFAULTS against addon/prefs.js. Update the translation, then run
 * `npm run docs:pin` to record the new hash.
 *
 * The pairing is required both ways, so a tutorial added in English cannot
 * ship untranslated. PHILOSOPHY.md and notes/ are out of scope by design.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUFFIX = '.zh.md';
/** `<!-- translated-from: README.md sha256:3f9a2c1b7e04 -->`, the first line of every translated page. */
const MARKER = /^<!-- translated-from: (\S+) sha256:([0-9a-f]{12}) -->$/;

/** Every English page that must have a Chinese one: the README and the tutorials. */
function englishPages(): string[] {
  const tutorials = readdirSync(join(root, 'tutorials'))
    .filter((name) => name.endsWith('.md') && !name.endsWith(SUFFIX))
    .sort()
    .map((name) => join('tutorials', name));
  return ['README.md', ...tutorials];
}

function pin(source: string): string {
  return createHash('sha256').update(readFileSync(join(root, source))).digest('hex').slice(0, 12);
}

describe('the Chinese pages', () => {
  const pages = englishPages();

  it.each(pages)('%s has a translation', (source) => {
    const translated = source.replace(/\.md$/, SUFFIX);
    expect(() => readFileSync(join(root, translated))).not.toThrow();
  });

  it.each(pages)('%s and its translation are the same revision', (source) => {
    const translated = source.replace(/\.md$/, SUFFIX);
    const first = readFileSync(join(root, translated), 'utf8').split('\n')[0];
    const marker = MARKER.exec(first);
    expect(marker, `${translated} must open with \`<!-- translated-from: … -->\`; run \`npm run docs:pin\``).not.toBeNull();
    expect(marker![1], `${translated} names the wrong source`).toBe(source.split(/[\\/]/).pop());
    expect(
      marker![2],
      `${translated} follows an older ${source}: update the translation, then run \`npm run docs:pin\``,
    ).toBe(pin(source));
  });

  it('every translated page belongs to an English one', () => {
    const orphans = [];
    for (const dir of ['.', 'tutorials']) {
      for (const name of readdirSync(join(root, dir))) {
        if (!name.endsWith(SUFFIX)) continue;
        const source = join(dir === '.' ? '' : dir, name.slice(0, -SUFFIX.length) + '.md');
        if (!pages.includes(source)) orphans.push(join(dir, name));
      }
    }
    expect(orphans).toEqual([]);
  });
});
