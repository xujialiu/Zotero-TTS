import { describe, expect, it, vi } from 'vitest';
import { READ_ALOUD_VOICES_PREF, type VoicesMap } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import { setDefaultSpeed, type SpeedManagerLike } from '../../src/read-aloud/default-speed';
import { READ_ALOUD_MEMORY_PREF, readMemory, writeMemory } from '../../src/read-aloud/read-aloud-memory';

/** A pref store that logs the order of its writes, beside what a manager did. */
function fakePrefs(initial: Record<string, unknown> = {}, log: string[] = []): PrefsBackend & { store: Record<string, unknown>; log: string[] } {
  const store = { ...initial };
  return {
    store,
    log,
    get: (k) => store[k],
    set: (k, v) => {
      store[k] = v;
      log.push(`set:${k.replace('extensions.zotero.', '')}`);
    },
  };
}

const voices: VoicesMap = {
  en: { region: 'US', voice: 'local::af_aoede', speed: 1.2, tierVoices: { local: 'local::af_aoede' } },
  zh: { speed: 1.2 },
};
const stored = (prefs: { store: Record<string, unknown> }) => JSON.parse(prefs.store[READ_ALOUD_VOICES_PREF] as string) as VoicesMap;

function manager(state: Omit<SpeedManagerLike, 'setSpeed'>, log: string[] = []) {
  return { ...state, setSpeed: vi.fn((speed: number, persist?: boolean) => void log.push(`setSpeed:${speed}:${persist}`)) };
}

describe('setDefaultSpeed', () => {
  it('remembers the speed across documents, keeping the remembered voice', () => {
    const prefs = fakePrefs();
    writeMemory(prefs, { speed: 1.2, voice: { id: 'openai::alloy', lang: 'mul' } });
    setDefaultSpeed(prefs, 1.8);
    expect(readMemory(prefs)).toEqual({ speed: 1.8, voice: { id: 'openai::alloy', lang: 'mul' } });
  });

  it("writes Zotero's own speed for every language it has seen, touching nothing else there", () => {
    const prefs = fakePrefs({ [READ_ALOUD_VOICES_PREF]: JSON.stringify(voices) });
    setDefaultSpeed(prefs, 1.8);
    expect(stored(prefs)).toEqual({ en: { ...voices.en, speed: 1.8 }, zh: { speed: 1.8 } });
  });

  // A fresh install: Zotero has no entry to hold a speed, and the memory is
  // the only place the choice can live until a document is read
  it('remembers the speed even when Zotero has persisted nothing yet', () => {
    const prefs = fakePrefs();
    setDefaultSpeed(prefs, 1.8);
    expect(readMemory(prefs)).toEqual({ speed: 1.8, voice: null });
  });

  it("keeps the speed on Zotero's slider range", () => {
    const prefs = fakePrefs();
    setDefaultSpeed(prefs, 1.25);
    expect(readMemory(prefs).speed).toBe(1.3);
    setDefaultSpeed(prefs, 9);
    expect(readMemory(prefs).speed).toBe(3);
  });

  it('changes the pace of a reader that is playing, persisting through it as the popup does', () => {
    const playing = manager({ active: true, selectedVoiceID: 'v' });
    setDefaultSpeed(fakePrefs(), 1.8, [playing]);
    expect(playing.setSpeed).toHaveBeenCalledWith(1.8, true);
  });

  // The reader whose own slider or shortcut set the speed is already there:
  // no second persist, no re-render (memory-sync spreads through this)
  it('leaves a reader already at the speed alone', () => {
    const there = manager({ speed: 1.8, active: true, selectedVoiceID: 'v' });
    setDefaultSpeed(fakePrefs(), 1.8, [there]);
    expect(there.setSpeed).not.toHaveBeenCalled();
  });

  // Zotero's persistence path (_setReadAloudVoice) re-syncs and activates an
  // idle manager that still holds a voice — audio would start with the popup
  // closed (notes/NOTES.md, Speed shortcuts); and without a voice it persists
  // nothing at all, so the pref write below is what counts.
  it('never persists through an idle manager, nor through one without a voice', () => {
    const idle = manager({ active: false, selectedVoiceID: 'v' });
    const voiceless = manager({ active: true, selectedVoiceID: null });
    setDefaultSpeed(fakePrefs(), 1.8, [idle, voiceless]);
    expect(idle.setSpeed).toHaveBeenCalledWith(1.8, false);
    expect(voiceless.setSpeed).toHaveBeenCalledWith(1.8, false);
  });

  // The order matters to memory-sync, which watches Zotero's pref: the memory
  // first, so the observer finds the speed already there; the readers before
  // the pref, so a fallback voice persisted for the first time moves together
  // with its speed — "the slider", not a voice choice (noteVoicesChange).
  it('writes the memory, then the readers, then Zotero’s pref', () => {
    const log: string[] = [];
    const prefs = fakePrefs({ [READ_ALOUD_VOICES_PREF]: JSON.stringify(voices) }, log);
    setDefaultSpeed(prefs, 1.8, [manager({ active: true, selectedVoiceID: 'v' }, log)]);
    expect(log).toEqual([`set:${READ_ALOUD_MEMORY_PREF.replace('extensions.zotero.', '')}`, 'setSpeed:1.8:true', 'set:reader.readAloudVoices']);
  });

  it('reports a reader that throws and still stores the speed everywhere else', () => {
    const broken = manager({ active: true, selectedVoiceID: 'v' });
    broken.setSpeed.mockImplementation(() => {
      throw new Error('gone');
    });
    const fine = manager({ active: true, selectedVoiceID: 'v' });
    const log = vi.fn();
    const prefs = fakePrefs({ [READ_ALOUD_VOICES_PREF]: JSON.stringify(voices) });
    setDefaultSpeed(prefs, 1.8, [broken, fine], log);
    expect(log).toHaveBeenCalledWith(expect.any(Error));
    expect(fine.setSpeed).toHaveBeenCalledWith(1.8, true);
    expect(readMemory(prefs).speed).toBe(1.8);
    expect(stored(prefs).en.speed).toBe(1.8);
  });
});
