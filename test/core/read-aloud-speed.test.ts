import { describe, expect, it } from 'vitest';
import {
  clampSpeed,
  isZoteroLangKey,
  nextSpeed,
  persistSpeed,
  READ_ALOUD_VOICES_PREF,
  readPersistedSpeed,
  resolveVoiceLang,
  SPEED_MAX,
  SPEED_MIN,
} from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return {
    store,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
    },
  };
}

const pref = READ_ALOUD_VOICES_PREF;
const stored = (prefs: { store: Record<string, unknown> }) => JSON.parse(prefs.store[pref] as string);

describe('nextSpeed', () => {
  it('steps by 0.1 and rounds away floating point noise', () => {
    expect(nextSpeed(1, 'speedUp')).toBe(1.1);
    // 1.1 + 0.1 is 1.2000000000000002 in IEEE 754
    expect(nextSpeed(1.1, 'speedUp')).toBe(1.2);
    expect(nextSpeed(0.7, 'speedDown')).toBe(0.6);
  });

  it('resets to 1', () => {
    expect(nextSpeed(2.3, 'speedReset')).toBe(1);
    expect(nextSpeed(1, 'speedReset')).toBe(1);
  });

  it("clamps to the range Zotero's own slider allows", () => {
    expect(nextSpeed(SPEED_MAX, 'speedUp')).toBe(SPEED_MAX);
    expect(nextSpeed(SPEED_MIN, 'speedDown')).toBe(SPEED_MIN);
    expect(nextSpeed(2.95, 'speedUp')).toBe(3);
  });

  it('treats a missing or invalid current speed as 1', () => {
    expect(nextSpeed(NaN, 'speedUp')).toBe(1.1);
    expect(nextSpeed(0, 'speedDown')).toBe(0.9);
    expect(nextSpeed(-5, 'speedUp')).toBe(1.1);
  });
});

describe('clampSpeed', () => {
  it("keeps a value on Zotero's slider: one decimal, within its range", () => {
    expect(clampSpeed(1.25)).toBe(1.3);
    expect(clampSpeed(1.2000000000000002)).toBe(1.2);
    expect(clampSpeed(9)).toBe(SPEED_MAX);
    expect(clampSpeed(0)).toBe(SPEED_MIN);
  });

  it('treats a value that is not a number as 1', () => {
    expect(clampSpeed(NaN)).toBe(1);
    expect(clampSpeed(Infinity)).toBe(1);
  });
});

describe('resolveVoiceLang', () => {
  // Zotero's resolveLanguage (reader bundle 38057, src/common/read-aloud/lang.ts): an
  // exact key, else the keys sharing the normalized base language — an exact regional
  // match, then the preferred region, then the first of them
  it('prefers an exact key, then a key with the same base language', () => {
    expect(resolveVoiceLang('en', ['zh', 'en'])).toBe('en');
    expect(resolveVoiceLang('en-US', ['zh', 'en'])).toBe('en');
    expect(resolveVoiceLang('en', ['en-GB'])).toBe('en-GB');
    expect(resolveVoiceLang('fr', ['zh', 'en'])).toBeNull();
    expect(resolveVoiceLang(null, ['en'])).toBeNull();
    expect(resolveVoiceLang('en', [])).toBeNull();
  });

  // Zotero splits on `-` only and compares case-sensitively (getBaseLanguage, 38002): a
  // document tagged en_US or EN gets an entry of its own, and the plugin must write
  // there too (issue #26) — the live disagreement table of that issue
  it('does not match an underscore or upper-case tag to the base language, as Zotero does not', () => {
    const keys = ['en', 'zh', 'et', 'fi', 'fr', 'mul', 'English'];
    expect(resolveVoiceLang('en_US', keys)).toBeNull();
    expect(resolveVoiceLang('EN', keys)).toBeNull();
    expect(resolveVoiceLang('EN-US', keys)).toBeNull();
    expect(resolveVoiceLang('zh_CN', keys)).toBeNull();
    expect(resolveVoiceLang('en-US', keys)).toBe('en');
    expect(resolveVoiceLang('zh-CN', keys)).toBe('zh');
    expect(resolveVoiceLang('English', keys)).toBe('English');
    expect(resolveVoiceLang('mul', keys)).toBe('mul');
    expect(resolveVoiceLang('en_US', [...keys, 'en_US'])).toBe('en_US');
  });

  // LANGUAGE_EQUIVALENTS { cmn: 'zh' } and REGION_EQUIVALENTS { XA: '001', SA: '001', CN: '', HK: '', TW: '' } (37977-37992)
  it('applies Zotero’s language and region equivalents', () => {
    expect(resolveVoiceLang('cmn', ['zh', 'en'])).toBe('zh');
    expect(resolveVoiceLang('zh', ['cmn', 'en'])).toBe('cmn');
    expect(resolveVoiceLang('zh-TW', ['zh'])).toBe('zh');
    expect(resolveVoiceLang('zh-HK', ['zh-CN'])).toBe('zh-CN');
    expect(resolveVoiceLang('ar-XA', ['ar-001', 'ar'])).toBe('ar-001');
    expect(resolveVoiceLang('ar-SA', ['ar', 'ar-001'])).toBe('ar-001');
  });

  // Among regional keys: an exact region, else the region the preferred languages
  // name (navigator.languages in Zotero — the first one for the base language, with
  // no second try), else DEFAULT_REGIONS, else the first candidate (38041-38099)
  it('picks among regional keys by exact region, then the preferred languages, then Zotero’s default region', () => {
    expect(resolveVoiceLang('en-GB', ['en-US', 'en-GB'])).toBe('en-GB');
    expect(resolveVoiceLang('en', ['en-GB', 'en-US'])).toBe('en-US');
    expect(resolveVoiceLang('en', ['en-GB', 'en-US'], ['fr-FR', 'en-GB'])).toBe('en-GB');
    expect(resolveVoiceLang('en', ['en-GB', 'en-US'], ['en-AU'])).toBe('en-GB');
    expect(resolveVoiceLang('pt', ['pt-PT', 'pt-BR'])).toBe('pt-BR');
    expect(resolveVoiceLang('de', ['de-AT', 'de-DE'])).toBe('de-AT');
  });
});

describe('readPersistedSpeed', () => {
  it('reads the speed Zotero stored for the language', () => {
    const prefs = fakePrefs({ [pref]: JSON.stringify({ en: { region: 'US', voice: 'v', speed: 1.4, tierVoices: {} } }) });
    expect(readPersistedSpeed(prefs, 'en-US')).toBe(1.4);
  });

  it('reads through Zotero’s equivalents: a cmn document takes the zh entry', () => {
    expect(readPersistedSpeed(fakePrefs({ [pref]: JSON.stringify({ en: { speed: 1.2 }, zh: { speed: 1.6 } }) }), 'cmn')).toBe(1.6);
  });

  it('falls back to any stored speed, then to 1', () => {
    expect(readPersistedSpeed(fakePrefs({ [pref]: JSON.stringify({ zh: { speed: 1.6 } }) }), 'en')).toBe(1.6);
    expect(readPersistedSpeed(fakePrefs(), 'en')).toBe(1);
    expect(readPersistedSpeed(fakePrefs({ [pref]: '{not json' }), 'en')).toBe(1);
    expect(readPersistedSpeed(fakePrefs({ [pref]: JSON.stringify({ en: { speed: 'fast' } }) }), 'en')).toBe(1);
  });
});

// Zotero's _persistCurrentVoice writes getBaseLanguage(this._lang), and _lang
// is, once _resolveVoice has run, the base of one of the voice list's locales:
// two or three lowercase letters. A document's raw /Lang tag never comes out
// of it — Zotero moves off such a tag before it persists (issue #59).
describe('isZoteroLangKey', () => {
  it('accepts the base of a voice locale', () => {
    for (const key of ['en', 'zh', 'fr', 'mul', 'cmn', 'yue']) expect(isZoteroLangKey(key)).toBe(true);
  });

  it('rejects a document tag Zotero never persists under', () => {
    for (const key of ['EN', 'English', 'en_US', 'en-US', 'x', 'x-unknown', '', 'Deutsch', 'e1']) expect(isZoteroLangKey(key)).toBe(false);
  });
});

describe('persistSpeed', () => {
  it('patches only the speed field, preserving the voice Zotero chose', () => {
    const before = { en: { region: 'US', voice: 'v', speed: 1, tierVoices: { standard: 'v' } }, zh: { speed: 1 } };
    const prefs = fakePrefs({ [pref]: JSON.stringify(before) });
    expect(persistSpeed(prefs, 'en-US', 1.3)).toBe(true);
    expect(stored(prefs)).toEqual({ ...before, en: { ...before.en, speed: 1.3 } });
  });

  // A document tagged en_US, EN or English is read by Zotero under that tag
  // exactly (issue #26), but Zotero never creates such an entry: it moves the
  // manager to a language it has a voice for before it persists (issue #59).
  // So nothing is written — the caller is told, and hands the speed to the
  // memory instead — and the en entry, which every other English document
  // reads, stays what it was
  it('creates nothing under a tag Zotero never persists under, and says so', () => {
    const before = { en: { region: 'US', voice: 'v', speed: 1.7, tierVoices: {} }, English: { speed: 1.7 } };
    const prefs = fakePrefs({ [pref]: JSON.stringify(before) });
    for (const tag of ['en_US', 'EN', 'x']) {
      expect(persistSpeed(prefs, tag, 1.1)).toBe(false);
      expect(stored(prefs)).toEqual(before);
    }
    // An entry that exists is updated whatever its key, as the spread updates it
    expect(persistSpeed(prefs, 'English', 1.1)).toBe(true);
    expect(stored(prefs)).toEqual({ ...before, English: { speed: 1.1 } });
  });

  // A base language no key resolves is still one Zotero could persist under
  it('creates the entry for a base language that has none, following Zotero’s equivalents', () => {
    const before = { en: { region: 'US', voice: 'v', speed: 1.7, tierVoices: {} } };
    const prefs = fakePrefs({ [pref]: JSON.stringify(before) });
    expect(persistSpeed(prefs, 'de', 1.1)).toBe(true);
    expect(stored(prefs)).toEqual({ ...before, de: { speed: 1.1 } });
    expect(persistSpeed(prefs, 'cmn', 1.3)).toBe(true);
    expect(stored(prefs)).toEqual({ ...before, de: { speed: 1.1 }, cmn: { speed: 1.3 } });
    const zh = fakePrefs({ [pref]: JSON.stringify({ en: { speed: 1.2 }, zh: { speed: 1.6 } }) });
    expect(persistSpeed(zh, 'cmn', 1.3)).toBe(true);
    expect(stored(zh)).toEqual({ en: { speed: 1.2 }, zh: { speed: 1.3 } });
  });

  it('creates an entry when the language has none', () => {
    const prefs = fakePrefs();
    expect(persistSpeed(prefs, 'en', 1.2)).toBe(true);
    expect(stored(prefs)).toEqual({ en: { speed: 1.2 } });
  });

  it('updates every entry when the language is unknown', () => {
    const prefs = fakePrefs({ [pref]: JSON.stringify({ en: { speed: 1 }, zh: { speed: 1 } }) });
    expect(persistSpeed(prefs, null, 1.5)).toBe(true);
    expect(stored(prefs)).toEqual({ en: { speed: 1.5 }, zh: { speed: 1.5 } });
  });

  it('writes nothing, and says so, when the language is unknown and no entry exists', () => {
    const prefs = fakePrefs();
    expect(persistSpeed(prefs, null, 1.5)).toBe(false);
    expect(prefs.store[pref]).toBeUndefined();
  });

  it('survives a corrupt pref by starting over', () => {
    const prefs = fakePrefs({ [pref]: '{not json' });
    persistSpeed(prefs, 'en', 1.2);
    expect(stored(prefs)).toEqual({ en: { speed: 1.2 } });
  });
});
