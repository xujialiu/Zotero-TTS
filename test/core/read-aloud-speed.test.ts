import { describe, expect, it } from 'vitest';
import {
  clampSpeed,
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
  it('prefers an exact key, then a key with the same base language', () => {
    expect(resolveVoiceLang('en', ['zh', 'en'])).toBe('en');
    expect(resolveVoiceLang('en-US', ['zh', 'en'])).toBe('en');
    expect(resolveVoiceLang('en', ['en-GB'])).toBe('en-GB');
    expect(resolveVoiceLang('fr', ['zh', 'en'])).toBeNull();
    expect(resolveVoiceLang(null, ['en'])).toBeNull();
    expect(resolveVoiceLang('en', [])).toBeNull();
  });
});

describe('readPersistedSpeed', () => {
  it('reads the speed Zotero stored for the language', () => {
    const prefs = fakePrefs({ [pref]: JSON.stringify({ en: { region: 'US', voice: 'v', speed: 1.4, tierVoices: {} } }) });
    expect(readPersistedSpeed(prefs, 'en-US')).toBe(1.4);
  });

  it('falls back to any stored speed, then to 1', () => {
    expect(readPersistedSpeed(fakePrefs({ [pref]: JSON.stringify({ zh: { speed: 1.6 } }) }), 'en')).toBe(1.6);
    expect(readPersistedSpeed(fakePrefs(), 'en')).toBe(1);
    expect(readPersistedSpeed(fakePrefs({ [pref]: '{not json' }), 'en')).toBe(1);
    expect(readPersistedSpeed(fakePrefs({ [pref]: JSON.stringify({ en: { speed: 'fast' } }) }), 'en')).toBe(1);
  });
});

describe('persistSpeed', () => {
  it('patches only the speed field, preserving the voice Zotero chose', () => {
    const before = { en: { region: 'US', voice: 'v', speed: 1, tierVoices: { standard: 'v' } }, zh: { speed: 1 } };
    const prefs = fakePrefs({ [pref]: JSON.stringify(before) });
    persistSpeed(prefs, 'en-US', 1.3);
    expect(stored(prefs)).toEqual({ ...before, en: { ...before.en, speed: 1.3 } });
  });

  it('creates an entry when the language has none', () => {
    const prefs = fakePrefs();
    persistSpeed(prefs, 'en', 1.2);
    expect(stored(prefs)).toEqual({ en: { speed: 1.2 } });
  });

  it('updates every entry when the language is unknown', () => {
    const prefs = fakePrefs({ [pref]: JSON.stringify({ en: { speed: 1 }, zh: { speed: 1 } }) });
    persistSpeed(prefs, null, 1.5);
    expect(stored(prefs)).toEqual({ en: { speed: 1.5 }, zh: { speed: 1.5 } });
  });

  it('survives a corrupt pref by starting over', () => {
    const prefs = fakePrefs({ [pref]: '{not json' });
    persistSpeed(prefs, 'en', 1.2);
    expect(stored(prefs)).toEqual({ en: { speed: 1.2 } });
  });
});
