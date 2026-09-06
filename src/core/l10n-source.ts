/**
 * The plugin's own copy of its Fluent file in Gecko's L10nRegistry (issue #64).
 *
 * Zotero registers `[plugin root]/locale/<locale>/*.ftl` itself, into one
 * source shared by every plugin, and takes it out again after the plugin's
 * `shutdown` resolves. A reload is a disable and an enable that do not wait
 * for each other (issue #28): the enable registers the file and starts the
 * new instance while the old `shutdown` is still running, and the disable's
 * tail then deletes the entry the enable had just restored — the new
 * instance runs without a string, the settings pane renders blank, and so
 * does every pane opened after it in that window, since the window's one
 * Localization lists the file and a listed resource missing empties the
 * whole set. The plugin can neither stop that step nor ask for another
 * registration (both are closure-private in xpcom/plugins.js).
 *
 * So it registers a source of its own, named after itself and built the
 * way Zotero builds the shared one (`L10nFileSource.createMock`): every
 * Zotero locale is served the closest shipped locale's content —
 * `Zotero.Utilities.Internal.resolveLocale`, then the first `en*`, then the
 * first shipped, Zotero's own fallback — because a Zotero in a language the
 * plugin lacks must still find the file for every locale it negotiates, or
 * the settings window loses its bundle and falls back to English wholesale.
 * Where both sources hold the file the later-registered one, ours, is used;
 * when Zotero's copy goes, ours carries the pane, `t()` and the window. It
 * is registered on every startup and removed on every shutdown, both on the
 * serialized chain the bootstrap keeps, so nothing about Zotero's ordering
 * is guessed. Pure: the registry, the mock constructor, the resolver and
 * the file reads are injected; src/index.ts supplies Zotero's.
 */

/** The source's name in the registry; Zotero's shared one is `zotero-plugins`. */
export const OWN_SOURCE_NAME = 'zotero-tts';

/** The path prefix the registry resolves a file under, per locale — the shape Zotero uses for the shared source. */
export const OWN_SOURCE_PRE_PATH = 'zotero-tts:{locale}/';

/** The locales the plugin ships under addon/locale/; test/l10n.test.ts pins the list to the directory. */
export const SHIPPED_LOCALES: readonly string[] = ['en-US', 'zh-CN'];

/** One entry of a mock file source: the full path the registry asks for and the file's text. */
export interface FluentFile {
  path: string;
  source: string;
}

/** The part of Gecko's `L10nRegistry` instance this module uses. */
export interface FluentRegistry {
  hasSource(name: string): boolean;
  registerSources(sources: unknown[]): void;
  updateSources(sources: unknown[]): void;
  removeSources(names: string[]): void;
}

/** The shipped locale closest to a Zotero locale, or nothing — `Zotero.Utilities.Internal.resolveLocale` with `silent`. */
export type ResolveLocale = (locale: string, available: string[]) => string | null | undefined;

/**
 * The files the source serves: one per Zotero locale, holding the closest
 * shipped locale's text — the resolver's pick, else the first `en*`, else
 * the first shipped (what plugins.js `registerLocales` does). Nothing when
 * there is no file at all.
 */
export function planOwnSource(zoteroLocales: readonly string[], contents: ReadonlyMap<string, string>, resolveLocale: ResolveLocale, fileName: string): FluentFile[] {
  const available = Array.from(contents.keys());
  if (!available.length) return [];
  const files: FluentFile[] = [];
  for (const locale of new Set(zoteroLocales)) {
    let pick = resolveLocale(locale, available);
    if (!pick || !contents.has(pick)) pick = available.find((l) => l.startsWith('en')) ?? available[0];
    files.push({ path: OWN_SOURCE_PRE_PATH.replace('{locale}', locale) + fileName, source: contents.get(pick)! });
  }
  return files;
}

export interface InstallOwnSourceDeps {
  registry: FluentRegistry;
  /** `L10nFileSource.createMock`, called as Zotero calls it for the shared source. */
  createMock(name: string, metasource: string, locales: string[], prePath: string, files: FluentFile[]): unknown;
  resolveLocale: ResolveLocale;
  /** The text of the shipped file for a locale; a rejection drops that locale. */
  readFile(locale: string): Promise<string>;
  /** Every locale Zotero can negotiate: `Services.locale.availableLocales`. */
  zoteroLocales: readonly string[];
  fileName: string;
  /** The locales to read; the shipped ones unless a test says otherwise. */
  shipped?: readonly string[];
  /** Hears a locale whose file could not be read. */
  warn(message: string): void;
}

export interface OwnSourceReport {
  /** The shipped locales whose file was read. */
  locales: string[];
  /** The Zotero locales the source serves. */
  entries: number;
  /** Whether a source of that name was already there and was replaced. */
  updated: boolean;
}

/**
 * Reads the shipped files and registers the source — or replaces the one
 * already there, which a startup after an unclean stop would find. Throws
 * when no file could be read: without a file there is nothing to register,
 * and the startup step should say so.
 */
export async function installOwnSource(deps: InstallOwnSourceDeps): Promise<OwnSourceReport> {
  const shipped = deps.shipped ?? SHIPPED_LOCALES;
  const contents = new Map<string, string>();
  const results = await Promise.allSettled(shipped.map((locale) => deps.readFile(locale)));
  results.forEach((result, i) => {
    const locale = shipped[i];
    if (result.status === 'fulfilled') contents.set(locale, result.value);
    else deps.warn(`the ${locale} strings could not be read: ${result.reason}`);
  });
  if (!contents.size) throw new Error('zotero-tts: no locale file could be read, so the plugin has no strings of its own to register');
  const zoteroLocales = Array.from(new Set(deps.zoteroLocales));
  const files = planOwnSource(zoteroLocales, contents, deps.resolveLocale, deps.fileName);
  const source = deps.createMock(OWN_SOURCE_NAME, 'app', zoteroLocales, OWN_SOURCE_PRE_PATH, files);
  const updated = deps.registry.hasSource(OWN_SOURCE_NAME);
  if (updated) deps.registry.updateSources([source]);
  else deps.registry.registerSources([source]);
  return { locales: Array.from(contents.keys()), entries: files.length, updated };
}

/** Takes the source out of the registry; false when there was none. */
export function unregisterOwnSource(registry: FluentRegistry): boolean {
  if (!registry.hasSource(OWN_SOURCE_NAME)) return false;
  registry.removeSources([OWN_SOURCE_NAME]);
  return true;
}
