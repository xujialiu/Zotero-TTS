import { describe, expect, it, vi } from 'vitest';
import {
  installOwnSource,
  OWN_SOURCE_NAME,
  OWN_SOURCE_PRE_PATH,
  planOwnSource,
  SHIPPED_LOCALES,
  unregisterOwnSource,
  type FluentRegistry,
} from '../../src/core/l10n-source';

/**
 * The plugin's own copy of its Fluent file in the registry (issue #64):
 * one source of its own, every Zotero locale served the closest shipped
 * locale's content, registered at startup and removed at shutdown, so the
 * strings survive Zotero's reload — whose disable tail deletes the entry
 * the concurrent enable restored in Zotero's shared source.
 */
const FTL = 'zotero-tts.ftl';

/** Zotero.Utilities.Internal.resolveLocale with { silent: true }: exact, then the language alone, then a same-language locale, then en-US, else null. */
function resolveLocale(locale: string, locales: string[]): string | null {
  if (locales.includes(locale)) return locale;
  const lang = locale.slice(0, 2);
  if (locales.includes(lang)) return lang;
  const same = locales.filter((l) => l.slice(0, 2) === lang).sort();
  if (same.length) return same[0];
  return locales.includes('en-US') ? 'en-US' : null;
}

const contents = new Map([
  ['en-US', 'ztts-a = A\n'],
  ['zh-CN', 'ztts-a = 甲\n'],
]);

function registry(has = false): FluentRegistry {
  return {
    hasSource: vi.fn<(name: string) => boolean>(() => has),
    registerSources: vi.fn<(sources: unknown[]) => void>(),
    updateSources: vi.fn<(sources: unknown[]) => void>(),
    removeSources: vi.fn<(names: string[]) => void>(),
  };
}

describe('planOwnSource', () => {
  it('serves every Zotero locale the closest shipped file, en-US when none is close', () => {
    const files = planOwnSource(['en-US', 'en-GB', 'zh-CN', 'zh-TW', 'de', 'ja'], contents, resolveLocale, FTL);
    expect(files.map((f) => [f.path, f.source])).toEqual([
      ['zotero-tts:en-US/zotero-tts.ftl', 'ztts-a = A\n'],
      ['zotero-tts:en-GB/zotero-tts.ftl', 'ztts-a = A\n'],
      ['zotero-tts:zh-CN/zotero-tts.ftl', 'ztts-a = 甲\n'],
      ['zotero-tts:zh-TW/zotero-tts.ftl', 'ztts-a = 甲\n'],
      ['zotero-tts:de/zotero-tts.ftl', 'ztts-a = A\n'],
      ['zotero-tts:ja/zotero-tts.ftl', 'ztts-a = A\n'],
    ]);
  });

  it('falls back to the first en* file, then to the first file, when the resolver has nothing', () => {
    const noResolver = () => null;
    expect(planOwnSource(['de'], new Map([['zh-CN', '甲'], ['en-GB', 'A']]), noResolver, FTL)).toEqual([{ path: 'zotero-tts:de/zotero-tts.ftl', source: 'A' }]);
    expect(planOwnSource(['de'], new Map([['zh-CN', '甲'], ['fr', 'F']]), noResolver, FTL)).toEqual([{ path: 'zotero-tts:de/zotero-tts.ftl', source: '甲' }]);
  });

  it('ignores a resolver answer that names a file it does not have', () => {
    expect(planOwnSource(['pt-BR'], contents, () => 'pt-PT', FTL)).toEqual([{ path: 'zotero-tts:pt-BR/zotero-tts.ftl', source: 'ztts-a = A\n' }]);
  });

  it('names the paths the way the registry asks for them, one per Zotero locale', () => {
    const files = planOwnSource(['en-US', 'en-US', 'zh-CN'], contents, resolveLocale, FTL);
    expect(files).toHaveLength(2);
    expect(OWN_SOURCE_PRE_PATH).toBe('zotero-tts:{locale}/');
    expect(files[0].path).toBe(OWN_SOURCE_PRE_PATH.replace('{locale}', 'en-US') + FTL);
    expect(OWN_SOURCE_NAME).toBe('zotero-tts');
  });

  it('serves nothing when there is no file at all', () => {
    expect(planOwnSource(['en-US'], new Map(), resolveLocale, FTL)).toEqual([]);
  });
});

describe('installOwnSource', () => {
  const zoteroLocales = ['en-US', 'zh-CN', 'zh-TW', 'de'];

  function deps(reg: FluentRegistry, readFile = (locale: string) => Promise.resolve(contents.get(locale) ?? Promise.reject(new Error('no such file')))) {
    const mock = { name: 'the mock source' };
    const createMock = vi.fn(() => mock);
    const warn = vi.fn();
    return { deps: { registry: reg, createMock, resolveLocale, readFile, zoteroLocales, fileName: FTL, warn }, mock, createMock, warn };
  }

  it('reads every shipped locale and registers one mock source over every Zotero locale', async () => {
    const reg = registry(false);
    const { deps: d, mock, createMock } = deps(reg);
    const report = await installOwnSource(d);
    expect(report).toEqual({ locales: ['en-US', 'zh-CN'], entries: 4, updated: false });
    expect(createMock).toHaveBeenCalledTimes(1);
    const [name, metasource, locales, prePath, files] = createMock.mock.calls[0] as unknown as [string, string, string[], string, { path: string; source: string }[]];
    expect([name, metasource, locales, prePath]).toEqual([OWN_SOURCE_NAME, 'app', zoteroLocales, OWN_SOURCE_PRE_PATH]);
    expect(files.map((f) => f.path)).toEqual(zoteroLocales.map((l) => `zotero-tts:${l}/${FTL}`));
    expect(files[2].source).toBe('ztts-a = 甲\n');
    expect(reg.registerSources).toHaveBeenCalledWith([mock]);
    expect(reg.updateSources).not.toHaveBeenCalled();
  });

  it('updates the source when one of that name is already registered', async () => {
    const reg = registry(true);
    const { deps: d, mock } = deps(reg);
    const report = await installOwnSource(d);
    expect(report.updated).toBe(true);
    expect(reg.updateSources).toHaveBeenCalledWith([mock]);
    expect(reg.registerSources).not.toHaveBeenCalled();
  });

  it('drops a locale whose file fails to read, says which, and registers the rest', async () => {
    const reg = registry(false);
    const { deps: d, createMock, warn } = deps(reg, (locale) => (locale === 'zh-CN' ? Promise.reject(new Error('jar entry gone')) : Promise.resolve(contents.get(locale)!)));
    const report = await installOwnSource(d);
    expect(report).toEqual({ locales: ['en-US'], entries: 4, updated: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/zh-CN/);
    expect(warn.mock.calls[0][0]).toMatch(/jar entry gone/);
    const files = (createMock.mock.calls[0] as unknown as [string, string, string[], string, { path: string; source: string }[]])[4];
    expect(files.every((f) => f.source === 'ztts-a = A\n')).toBe(true);
    expect(reg.registerSources).toHaveBeenCalledTimes(1);
  });

  it('throws when no file could be read, and registers nothing', async () => {
    const reg = registry(false);
    const { deps: d, createMock } = deps(reg, () => Promise.reject(new Error('unreadable')));
    await expect(installOwnSource(d)).rejects.toThrow(/no locale file/);
    expect(createMock).not.toHaveBeenCalled();
    expect(reg.registerSources).not.toHaveBeenCalled();
    expect(reg.updateSources).not.toHaveBeenCalled();
  });

  it('reads the shipped locales by default', async () => {
    const reg = registry(false);
    const readFile = vi.fn((locale: string) => Promise.resolve(contents.get(locale) ?? ''));
    const { deps: d } = deps(reg, readFile);
    await installOwnSource(d);
    expect(readFile.mock.calls.map((c) => c[0])).toEqual([...SHIPPED_LOCALES]);
  });
});

describe('unregisterOwnSource', () => {
  it('removes the source when it is registered', () => {
    const reg = registry(true);
    expect(unregisterOwnSource(reg)).toBe(true);
    expect(reg.removeSources).toHaveBeenCalledWith([OWN_SOURCE_NAME]);
  });

  it('does nothing when it is not', () => {
    const reg = registry(false);
    expect(unregisterOwnSource(reg)).toBe(false);
    expect(reg.removeSources).not.toHaveBeenCalled();
  });
});
