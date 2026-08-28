import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULTS,
  enabledProviders,
  loadSettings,
  migrateLegacyProviderPref,
  PREF_PREFIX,
  PROVIDER_IDS,
  saveSettings,
  type PrefsBackend,
} from '../../src/core/settings';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown>; clear: ReturnType<typeof vi.fn> } {
  const store = { ...initial };
  return {
    store,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
    },
    clear: vi.fn((k: string) => {
      delete store[k];
    }),
  };
}

describe('loadSettings', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadSettings(fakePrefs())).toEqual(DEFAULTS);
  });

  // The plugin has exactly one way of working: it drives Zotero's built-in
  // Read Aloud player. The earlier "mode" switch (hijack vs. a standalone
  // player) was removed once the hijack was confirmed live in a real Zotero,
  // and a leftover pref from that era must be ignored, not surfaced.
  it('has no mode field, and ignores a stale mode pref from an older build', () => {
    const prefs = fakePrefs({ 'extensions.zotero.zotero-tts.mode': 'standalone' });
    const s = loadSettings(prefs);
    expect('mode' in s).toBe(false);
    expect('mode' in DEFAULTS).toBe(false);
  });

  // Providers are switched on independently; there is no single "provider"
  it('has no provider field either — each provider carries its own enabled flag', () => {
    expect('provider' in DEFAULTS).toBe(false);
    expect(DEFAULTS.openai.enabled).toBe(true);
    expect(DEFAULTS.azure.enabled).toBe(false);
    expect(DEFAULTS.local.enabled).toBe(false);
  });

  it('reads stored values using the extensions.zotero.zotero-tts. prefix', () => {
    const prefs = fakePrefs({
      'extensions.zotero.zotero-tts.azure.enabled': true,
      'extensions.zotero.zotero-tts.azure.region': 'eastasia',
    });
    const s = loadSettings(prefs);
    expect(s.azure.enabled).toBe(true);
    expect(s.azure.region).toBe('eastasia');
  });

  it('falls back to the default when a stored value has the wrong type', () => {
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.prefetch': 'many' })).prefetch).toBe(DEFAULTS.prefetch);
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.azure.enabled': 'yes' })).azure.enabled).toBe(false);
  });

  it('clamps prefetch into the supported range', () => {
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.prefetch': 99 })).prefetch).toBe(10);
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.prefetch': 0 })).prefetch).toBe(1);
  });

  // Versions before 1.1.3 had a synthesis speed; Read Aloud's own slider is the only speed now
  it('has no speed setting', () => {
    expect(DEFAULTS).not.toHaveProperty('speed');
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.speed': 2 }))).not.toHaveProperty('speed');
  });

  it('ships a blue word on a yellow sentence, both at 70%, kept under the word, and keeps the opacities within 0-100', () => {
    expect(DEFAULTS.highlight).toEqual({ wordColor: '#3478f6', wordAlpha: 70, sentenceColor: '#ffff00', sentenceAlpha: 70, sentenceUnderWord: true });
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.highlight.wordAlpha': 250 })).highlight.wordAlpha).toBe(100);
    expect(loadSettings(fakePrefs({ 'extensions.zotero.zotero-tts.highlight.sentenceAlpha': -1 })).highlight.sentenceAlpha).toBe(0);
  });

  it('ships Shift+Z / X / C for the speed, the arrow keys for skipping, and Shift+Space / Shift+Enter for the position', () => {
    expect(DEFAULTS.shortcuts).toEqual({
      speedReset: 'Shift+Z',
      speedDown: 'Shift+X',
      speedUp: 'Shift+C',
      previousSentence: 'ArrowLeft',
      nextSentence: 'ArrowRight',
      previousParagraph: 'Shift+ArrowLeft',
      nextParagraph: 'Shift+ArrowRight',
      startFromSelection: 'Shift+Space',
      returnToSpoken: 'Shift+Enter',
    });
  });

  it('reads customized shortcuts as raw text, including an empty string meaning "disabled"', () => {
    const prefs = fakePrefs({
      'extensions.zotero.zotero-tts.shortcuts.speedUp': 'Ctrl+K',
      'extensions.zotero.zotero-tts.shortcuts.speedDown': '',
    });
    const s = loadSettings(prefs);
    expect(s.shortcuts.speedUp).toBe('Ctrl+K');
    expect(s.shortcuts.speedDown).toBe('');
    expect(s.shortcuts.speedReset).toBe('Shift+Z');
  });

  it('exposes the pref prefix so the pane can write individual keys', () => {
    expect(PREF_PREFIX).toBe('extensions.zotero.zotero-tts.');
  });
});

describe('enabledProviders', () => {
  it('lists the switched-on providers in catalog order', () => {
    expect(enabledProviders(DEFAULTS)).toEqual(['openai']);
    const all = {
      ...DEFAULTS,
      azure: { ...DEFAULTS.azure, enabled: true },
      local: { ...DEFAULTS.local, enabled: true },
    };
    expect(enabledProviders(all)).toEqual(PROVIDER_IDS);
    expect(enabledProviders({ ...all, openai: { ...DEFAULTS.openai, enabled: false } })).toEqual(['azure', 'local']);
  });
});

describe('saveSettings', () => {
  it('round-trips through the backend', () => {
    const prefs = fakePrefs();
    const s = { ...DEFAULTS, local: { ...DEFAULTS.local, enabled: true }, prefetch: 5 };
    saveSettings(prefs, s);
    expect(loadSettings(prefs)).toEqual(s);
  });
});

// Builds before 2026-08-22 stored one chosen provider in `provider`
describe('migrateLegacyProviderPref', () => {
  const key = (name: string) => PREF_PREFIX + name;

  it('turns the chosen provider into enabled flags and removes the old pref', () => {
    const prefs = fakePrefs({ [key('provider')]: 'azure' });
    expect(migrateLegacyProviderPref(prefs)).toBe(true);
    expect(loadSettings(prefs).azure.enabled).toBe(true);
    expect(loadSettings(prefs).openai.enabled).toBe(false);
    expect(loadSettings(prefs).local.enabled).toBe(false);
    expect(prefs.clear).toHaveBeenCalledWith(key('provider'));
    expect(key('provider') in prefs.store).toBe(false);
  });

  it('runs only once', () => {
    const prefs = fakePrefs({ [key('provider')]: 'local' });
    expect(migrateLegacyProviderPref(prefs)).toBe(true);
    expect(migrateLegacyProviderPref(prefs)).toBe(false);
    expect(loadSettings(prefs).local.enabled).toBe(true);
  });

  it('does nothing without a valid leftover value', () => {
    for (const prefs of [fakePrefs(), fakePrefs({ [key('provider')]: 'elevenlabs' }), fakePrefs({ [key('provider')]: '' })]) {
      expect(migrateLegacyProviderPref(prefs)).toBe(false);
      expect(loadSettings(prefs)).toEqual(DEFAULTS);
    }
  });

  it('blanks the old pref when the backend cannot clear it', () => {
    const store: Record<string, unknown> = { [key('provider')]: 'openai' };
    const prefs: PrefsBackend = { get: (k) => store[k], set: (k, v) => void (store[k] = v) };
    expect(migrateLegacyProviderPref(prefs)).toBe(true);
    expect(store[key('provider')]).toBe('');
    expect(migrateLegacyProviderPref(prefs)).toBe(false);
  });
});

describe('readAloud.sameForAllDocuments', () => {
  it('is on by default and reads the stored switch', () => {
    expect(loadSettings(fakePrefs()).readAloud.sameForAllDocuments).toBe(true);
    expect(loadSettings(fakePrefs({ [PREF_PREFIX + 'readAloud.sameForAllDocuments']: false })).readAloud.sameForAllDocuments).toBe(false);
  });

  it('is written back by saveSettings', () => {
    const prefs = fakePrefs();
    saveSettings(prefs, {
      ...DEFAULTS,
      readAloud: { ...DEFAULTS.readAloud, sameForAllDocuments: false, hideZoteroLocalVoices: true },
    });
    expect(prefs.store[PREF_PREFIX + 'readAloud.sameForAllDocuments']).toBe(false);
    expect(prefs.store[PREF_PREFIX + 'readAloud.hideZoteroLocalVoices']).toBe(true);
  });
});

describe('readAloud.globalSpeed', () => {
  it('is on by default and reads the stored switch', () => {
    expect(loadSettings(fakePrefs()).readAloud.globalSpeed).toBe(true);
    expect(loadSettings(fakePrefs({ [PREF_PREFIX + 'readAloud.globalSpeed']: false })).readAloud.globalSpeed).toBe(false);
  });

  it('is written back by saveSettings', () => {
    const prefs = fakePrefs();
    saveSettings(prefs, { ...DEFAULTS, readAloud: { ...DEFAULTS.readAloud, globalSpeed: false } });
    expect(prefs.store[PREF_PREFIX + 'readAloud.globalSpeed']).toBe(false);
  });
});

describe('readAloud favorites', () => {
  it('has no favorites and offers everything by default', () => {
    expect(loadSettings(fakePrefs()).readAloud.favoriteVoices).toBe('');
    expect(loadSettings(fakePrefs()).readAloud.favoritesOnly).toBe(false);
  });

  it('reads the stored favorites and the switch', () => {
    const stored = fakePrefs({
      [PREF_PREFIX + 'readAloud.favoriteVoices']: '["azure::x"]',
      [PREF_PREFIX + 'readAloud.favoritesOnly']: true,
    });
    expect(loadSettings(stored).readAloud.favoriteVoices).toBe('["azure::x"]');
    expect(loadSettings(stored).readAloud.favoritesOnly).toBe(true);
  });
});

// readAloud.multilingualEverywhere was removed in 1.6.0; a leftover user
// value is undeclared now and nothing reads it
describe('readAloud.hideZoteroLocalVoices', () => {
  it('is off by default and reads the stored switch', () => {
    expect(loadSettings(fakePrefs()).readAloud.hideZoteroLocalVoices).toBe(false);
    expect(loadSettings(fakePrefs({ [PREF_PREFIX + 'readAloud.hideZoteroLocalVoices']: true })).readAloud.hideZoteroLocalVoices).toBe(true);
  });
});

describe('openai.server', () => {
  it('is empty by default (guess from the address) and reads the stored choice', () => {
    expect(loadSettings(fakePrefs()).openai.server).toBe('');
    expect(loadSettings(fakePrefs({ [PREF_PREFIX + 'openai.server']: 'chatterbox' })).openai.server).toBe('chatterbox');
  });
});

describe('local.headers', () => {
  it('is empty by default and reads the stored value', () => {
    expect(loadSettings(fakePrefs()).local.headers).toBe('');
    expect(loadSettings(fakePrefs({ [PREF_PREFIX + 'local.headers']: 'X: y' })).local.headers).toBe('X: y');
  });
});
