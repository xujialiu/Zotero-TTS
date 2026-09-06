import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FluentBundle, FluentResource } from '@fluent/bundle';
import { parse, type Attribute, type Message, type Pattern, type Resource } from '@fluent/syntax';
import { describe, expect, it } from 'vitest';
import { SHIPPED_LOCALES } from '../src/core/l10n-source';

/**
 * The Fluent files against each other, the markup and the code (issue #30).
 *
 * en-US is the source of truth. Zotero itself never complains: a message
 * missing from a locale file falls back to en-US silently (and a message
 * missing from en-US leaves the element blank), a `?` icon whose message
 * forgot `.value = ?` loses its `?` (Fluent drops the localizable
 * attributes a translation leaves out), a `.bold` run that is not in its
 * `.label` is silently not drawn (ui/bold-labels.ts). So the files are
 * pinned here the way test/prefs-defaults.test.ts pins DEFAULTS against
 * addon/prefs.js: every id in every file, every attribute, every variable,
 * every data-l10n-id in the pane's markup, every literal t('…') in src/.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const localeDir = join(root, 'addon', 'locale');
const FTL = 'zotero-tts.ftl';
const SOURCE = 'en-US';
/** Every locale the plugin ships — core/l10n-source.ts's list, what the plugin's own registry source reads (issue #64); a directory added under addon/locale/ is added there, so it is checked here. */
const LOCALES = [...SHIPPED_LOCALES];

function resource(locale: string): Resource {
  return parse(readFileSync(join(localeDir, locale, FTL), 'utf8'), { withSpans: false });
}

function messages(res: Resource): Map<string, Message> {
  return new Map(res.body.filter((entry): entry is Message => entry.type === 'Message').map((m) => [m.id.name, m]));
}

/** The plain text of a pattern, placeables left out. */
function text(pattern: Pattern | null): string {
  return (pattern?.elements ?? []).map((e) => (e.type === 'TextElement' ? e.value : '')).join('');
}

/** Every reference a pattern makes — `$variable`, a `message`, a `-term` — wherever it is nested. */
function references(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return out;
  const n = node as { type?: string; id?: { name?: string } };
  if (n.type === 'VariableReference' && n.id?.name) out.add(`$${n.id.name}`);
  if (n.type === 'MessageReference' && n.id?.name) out.add(n.id.name);
  if (n.type === 'TermReference' && n.id?.name) out.add(`-${n.id.name}`);
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) value.forEach((v) => references(v, out));
    else if (value && typeof value === 'object') references(value, out);
  }
  return out;
}

const attributeNames = (m: Message) => m.attributes.map((a: Attribute) => a.id.name).sort();
const attribute = (m: Message, name: string) => m.attributes.find((a: Attribute) => a.id.name === name);

/** The ids the pane's markup asks for, with the custom attributes each element names in data-l10n-attrs. */
function markupIds(): Map<string, string[]> {
  const markup = readFileSync(join(root, 'addon', 'content', 'preferences.xhtml'), 'utf8');
  const out = new Map<string, string[]>();
  for (const tag of markup.match(/<[^>]*\sdata-l10n-id="[^"]+"[^>]*>/g) ?? []) {
    const id = /data-l10n-id="([^"]+)"/.exec(tag)![1];
    const attrs = /data-l10n-attrs="([^"]+)"/.exec(tag)?.[1].split(',').map((s) => s.trim()) ?? [];
    out.set(id, [...new Set([...(out.get(id) ?? []), ...attrs])]);
  }
  return out;
}

/** Every id the code asks `t()` for as a literal — `t('ztts-…'` — under src/. */
function codeIds(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts')) for (const m of readFileSync(path, 'utf8').matchAll(/\bt\(\s*'([^']+)'/g)) out.add(m[1]);
    }
  };
  walk(join(root, 'src'));
  return out;
}

const source = messages(resource(SOURCE));

describe('addon/locale', () => {
  it('holds exactly the locales this test knows', () => {
    expect(readdirSync(localeDir).sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)('%s parses cleanly, every message with a value or an attribute', (locale) => {
    const res = resource(locale);
    expect(res.body.filter((e) => e.type === 'Junk').map((e) => (e as { content?: string }).content)).toEqual([]);
    for (const m of messages(res).values()) expect(m.value !== null || m.attributes.length > 0, m.id.name).toBe(true);
  });

  it.each(LOCALES.filter((l) => l !== SOURCE))('%s has exactly the messages of en-US', (locale) => {
    expect([...messages(resource(locale)).keys()].sort()).toEqual([...source.keys()].sort());
  });

  it.each(LOCALES.filter((l) => l !== SOURCE))('%s gives every message the attributes and references of en-US', (locale) => {
    const other = messages(resource(locale));
    for (const [id, m] of source) {
      const o = other.get(id);
      if (!o) continue; // reported above
      expect(attributeNames(o), `${id} attributes`).toEqual(attributeNames(m));
      expect(o.value === null, `${id} has a value`).toBe(m.value === null);
      expect([...references(o.value)].sort(), `${id} value references`).toEqual([...references(m.value)].sort());
      for (const a of m.attributes) {
        const oa = attribute(o, a.id.name)!;
        expect([...references(oa.value)].sort(), `${id}.${a.id.name} references`).toEqual([...references(a.value)].sort());
      }
    }
  });

  it('has a message for every data-l10n-id in the pane, with every attribute its element names', () => {
    for (const [id, attrs] of markupIds()) {
      const m = source.get(id);
      expect(m, id).toBeDefined();
      for (const attr of attrs) expect(attribute(m!, attr), `${id}.${attr}`).toBeDefined();
    }
  });

  it('has a message for every literal t() id in src/', () => {
    const ids = codeIds();
    expect(ids.size).toBeGreaterThan(0);
    for (const id of ids) expect(source.get(id)?.value, `${id} (t() formats a value, not an attribute)`).toBeTruthy();
  });

  it('has no message the pane or the code does not use', () => {
    const used = new Set([...markupIds().keys(), ...codeIds()]);
    expect([...source.keys()].filter((id) => !used.has(id))).toEqual([]);
  });

  // The ? icons: a XUL label's `value` is localizable, so a message with
  // only .help would strip the "?" off the icon
  it.each(LOCALES)('%s keeps the ? on every ? icon', (locale) => {
    for (const m of messages(resource(locale)).values()) {
      if (!attribute(m, 'help')) continue;
      expect(text(attribute(m, 'value')?.value ?? null), `${m.id.name}.value`).toBe('?');
    }
  });

  // ui/bold-labels.ts draws the .bold run inside the .label; a run that is
  // not a substring is silently not drawn
  it.each(LOCALES)('%s writes every .bold run inside its .label', (locale) => {
    for (const m of messages(resource(locale)).values()) {
      const bold = attribute(m, 'bold');
      if (!bold) continue;
      expect(text(attribute(m, 'label')?.value ?? null), `${m.id.name}.label`).toContain(text(bold.value));
    }
  });
});

/** A locale's file rendered by Fluent's reference implementation, the way test/setup.ts renders en-US for t(). */
function renderer(locale: string): (id: string, args?: Record<string, string | number>) => string {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  const errors = bundle.addResource(new FluentResource(readFileSync(join(localeDir, locale, FTL), 'utf8')));
  if (errors.length) throw errors[0];
  return (id, args) => {
    const message = bundle.getMessage(id);
    if (!message?.value) throw new Error(`${locale} has no value for ${id}`);
    const failures: Error[] = [];
    const out = bundle.formatPattern(message.value, args, failures);
    if (failures.length) throw failures[0];
    return out;
  };
}

/** The variables that arrive as numbers — a plural rule reads them; every other one arrives as text (issue #43). */
const NUMBER_ARGS = new Set(['count', 'seconds', 'code']);

describe('the strings TypeScript writes (issue #43)', () => {
  const en = renderer('en-US');
  const zh = renderer('zh-CN');

  it('joins two sentences with a space in English and with nothing in Chinese', () => {
    expect(en('ztts-join', { first: 'Connected.', second: 'Synthesis works.' })).toBe('Connected. Synthesis works.');
    expect(zh('ztts-join', { first: '已连接。', second: '合成正常。' })).toBe('已连接。合成正常。');
  });

  it('shows a count handed over as text verbatim, without a grouping separator', () => {
    expect(en('ztts-voices-available', { count: '1914' })).toBe('1914 voices available.');
    expect(zh('ztts-voices-available', { count: '1914' })).toContain('1914');
    // What a number would do — why the counts that can pass a thousand travel as text
    expect(en('ztts-voices-available', { count: 1914 })).toBe('1,914 voices available.');
  });

  it('reads the reading guard\'s plural from the count in both languages, the blank line kept', () => {
    const one = { count: 1, list: '  • Deep learning' };
    const two = { count: 2, list: '  • Deep learning\n  • Another paper' };
    expect(en('ztts-reading-tabs', one)).toBe('Read Aloud is open in a tab:\n  • Deep learning\n\nClose that tab, then try again.');
    expect(en('ztts-reading-tabs', two)).toBe('Read Aloud is open in 2 tabs:\n  • Deep learning\n  • Another paper\n\nClose those tabs, then try again.');
    expect(zh('ztts-reading-tabs', two)).toContain('  • Deep learning\n  • Another paper\n\n');
    // One tab is worded differently from two, not only by the digit
    expect(zh('ztts-reading-tabs', two).replace(/2/g, '1')).not.toBe(zh('ztts-reading-tabs', one));
  });

  it.each(LOCALES)('%s formats every message that takes arguments, and shows every text argument', (locale) => {
    const render = renderer(locale);
    for (const [id, m] of source) {
      if (!m.value) continue;
      const names = [...references(m.value)].filter((r) => r.startsWith('$')).map((r) => r.slice(1));
      if (!names.length) continue;
      const args = Object.fromEntries(names.map((name) => [name, NUMBER_ARGS.has(name) ? 2 : `«${name}»`]));
      const out = render(id, args);
      for (const name of names) if (!NUMBER_ARGS.has(name)) expect(out, `${locale} ${id} shows $${name}`).toContain(`«${name}»`);
    }
  });
});
