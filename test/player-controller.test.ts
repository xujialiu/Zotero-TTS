import { describe, expect, it, vi } from 'vitest';
import { createPlayerController } from '../src/read-aloud/player-controller';
import { PREF_PREFIX } from '../src/core/settings';

function fixture() {
  const values = new Map<string, unknown>();
  const manager = {
    active: false, paused: true, speed: 1.2, lang: 'en', region: 'US', currentVoiceRegion: 'US',
    selectedTier: 'fish', selectedVoiceID: 'fish::one', buffering: false, error: null,
    allVoices: [{ id: 'fish::one', name: 'One', tier: 'fish' }],
    voicesForLanguage: [{ id: 'fish::one', name: 'One', tier: 'fish' }],
    languages: new Set(['en-US']), tiers: new Set(['fish']),
    selectVoice: vi.fn(), selectTier: vi.fn(), setLanguage: vi.fn(), setSpeed: vi.fn(),
  };
  const reader = { _internalReader: { _readAloudManager: manager, _state: { readAloudState: { popupOpen: false } } } };
  const start = vi.fn(), close = vi.fn(), togglePaused = vi.fn(), rememberSpeed = vi.fn(), follow = vi.fn();
  const controller = createPlayerController({
    prefs: { get: key => values.get(key), set: (key, value) => { values.set(key, value); } },
    labels: () => ({ fish: 'Fish Audio' }), clone: (_reader, value) => value,
    start, close, togglePaused, rememberSpeed, follow, anyReading: () => manager.active,
    message: key => key,
  });
  return { values, manager, reader, controller, start, close, togglePaused, rememberSpeed, follow };
}

describe('player controller', () => {
  it('treats a dead reader as closed instead of repeatedly throwing during cleanup', () => {
    const f = fixture();
    const reader = { get _internalReader(): never { throw new Error('dead object'); } };
    expect(f.controller.snapshot(reader)).toMatchObject({ opened: false, active: false, playing: false, voices: [] });
  });
  it('uses listed regional voices and rejects an arbitrary voice without mutating the manager', async () => {
    const f = fixture();
    expect(f.controller.snapshot(f.reader).voices).toEqual([{ value: 'fish::one', label: 'One' }]);
    await expect(f.controller.command(f.reader, 'voice', 'fish::missing')).rejects.toThrow();
    expect(f.manager.selectVoice).not.toHaveBeenCalled();
  });
  it('opens through the existing start path and only toggles an active session', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'play');
    expect(f.start).toHaveBeenCalledWith(f.reader);
    f.manager.active = true;
    await f.controller.command(f.reader, 'play');
    expect(f.togglePaused).toHaveBeenCalledWith(f.reader);
    await f.controller.command(f.reader, 'close');
    expect(f.close).toHaveBeenCalledWith(f.reader);
  });
  it('does not persist speed through an idle manager, which can start playback', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'speed', 1.7);
    expect(f.manager.setSpeed).toHaveBeenCalledWith(1.7, false);
    expect(f.rememberSpeed).toHaveBeenCalledWith(1.7);
    await expect(f.controller.command(f.reader, 'speed', NaN)).rejects.toThrow();
  });
  it('writes the shared favorite and volume preferences and protects a favorite-only active catalog', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'favorite', 'fish::one');
    expect(JSON.parse(String(f.values.get(PREF_PREFIX + 'readAloud.favoriteVoices')))).toEqual(['fish::one']);
    await f.controller.command(f.reader, 'volume', 35);
    expect(f.values.get(PREF_PREFIX + 'readAloud.volume')).toBe(35);
    f.values.set(PREF_PREFIX + 'readAloud.favoritesOnly', true); f.manager.active = true;
    await expect(f.controller.command(f.reader, 'favorite', 'fish::one')).rejects.toThrow();
  });
  it('persists manual mode separately from the sentence/outside follow style', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'automatic', false);
    expect(f.values.get(PREF_PREFIX + 'readAloud.autoScrollEnabled')).toBe(false);
    expect(f.controller.snapshot(f.reader).automatic).toBe(false);
    await f.controller.command(f.reader, 'automatic', true);
    expect(f.follow).toHaveBeenLastCalledWith(f.reader);
  });
  it('clones language options into the reader realm and validates provider and locale choices', async () => {
    const f = fixture();
    await f.controller.command(f.reader, 'locale', 'en-US');
    expect(f.manager.setLanguage).toHaveBeenCalledWith('en', { region: 'US', persist: true });
    await expect(f.controller.command(f.reader, 'provider', 'missing')).rejects.toThrow();
  });
});
