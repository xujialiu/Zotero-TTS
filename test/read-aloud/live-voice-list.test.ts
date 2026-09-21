import { describe, expect, it, vi } from 'vitest';
import { createLiveVoiceList } from '../../src/read-aloud/live-voice-list';

function fixture(overrides: Partial<Parameters<typeof createLiveVoiceList>[0]> = {}) {
  const playing = { id: 'azure::ava', tier: 'azure', segmentGranularity: 'sentence' };
  let listed: any[] = [{ ...playing }, { id: 'local::bella', tier: 'local', impl: { tier: 'local' } }];
  const requests: Array<() => void> = [];
  /** What each run of Zotero's loadVoices was asked: its remote list or not (reader.js:82310). */
  const remote: boolean[] = [];
  const resolveVoice = vi.fn();
  const manager = {
    active: true, _voice: playing, selectedVoiceID: playing.id, _allVoices: [playing],
    _controller: { position: 7 }, _options: {}, _devMode: false,
    _resolveVoice: resolveVoice, _stateChanged: vi.fn(),
    deactivate() { this.active = false; },
    async loadVoices(loadRemote: boolean) {
      remote.push(loadRemote);
      await new Promise<void>(resolve => requests.push(resolve));
      this._allVoices = listed;
      this._resolveVoice(); this._stateChanged();
    },
  };
  const reader = { _internalReader: { _readAloudManager: manager, _state: { readAloudState: { popupOpen: true } } } };
  const error = vi.fn(), ended = vi.fn();
  const lists = createLiveVoiceList({ readers: () => [reader], stage: () => ({}),
    voiceTiers: () => (id: string) => id.startsWith('local::') ? 'kokoro' : id.startsWith('azure::') ? 'azure' : null,
    protectedVoices: () => [manager._voice.id, manager.selectedVoiceID], ownsInterface: () => true, error, ended, ...overrides });
  lists.attach(reader);
  return { manager, reader, lists, playing, resolveVoice, requests, remote, error, ended, setListed: (voices: any[]) => { listed = voices; } };
}

describe('live player voice choices', () => {
  it('updates choices without replacing the current audio or resolving a new voice', async () => {
    const f = fixture(), audio = f.manager._controller, catalog = f.manager._allVoices;
    const refreshed = f.lists.refresh();
    expect(f.manager._allVoices).toEqual([f.playing]);
    f.requests.shift()!(); await refreshed;
    expect(f.manager._allVoices.map(v => v.id)).toEqual(['azure::ava', 'local::bella']);
    expect(f.manager._allVoices[0]).toBe(f.playing);
    expect(f.manager._controller).toBe(audio);
    expect(f.manager._allVoices).toBe(catalog);
    expect(f.resolveVoice).not.toHaveBeenCalled();
    expect(f.lists.inspect(f.reader)?.applied).toBe(1);
  });
  // Zotero asks for its remote list only with an account signed in
  // (reader.js:84271), and the plugin's voices all come through it (#130)
  it('asks for the plugin’s list signed out too, when Zotero leaves its remote voices out', async () => {
    const f = fixture();
    const opened = f.manager.loadVoices(false);
    f.requests.shift()!(); await opened;
    expect(f.remote).toEqual([true]);
    expect(f.lists.inspect(f.reader)).toMatchObject({ asked: false, remote: true });
    // The same for a refresh after a settings change, from the reader's own flag
    const refreshed = f.lists.refresh();
    f.requests.shift()!(); await refreshed;
    expect(f.remote).toEqual([true, true]);
  });
  it('keeps Zotero’s flag on a reader whose voices do not come through the plugin', async () => {
    const f = fixture({ ownsInterface: () => false });
    const opened = f.manager.loadVoices(false);
    f.requests.shift()!(); await opened;
    const signedIn = f.manager.loadVoices(true);
    f.requests.shift()!(); await signedIn;
    expect(f.remote).toEqual([false, true]);
    expect(f.lists.inspect(f.reader)).toMatchObject({ asked: true, remote: true });
  });
  it('reads the engine’s name once per refresh, not once per voice (#125)', async () => {
    let walks = 0;
    let lookups = 0;
    const f = fixture({
      voiceTiers: () => {
        walks += 1;
        return (id: string) => {
          lookups += 1;
          return id.startsWith('local::') ? 'kokoro' : null;
        };
      },
    });
    // The module keeps this array and appends the retained voice to it, so
    // the expected count is held here rather than read back off the list.
    const discovered = 30;
    f.setListed(Array.from({ length: discovered }, (_, i) => ({ id: `local::v${i}`, tier: 'local', impl: { tier: 'local' } })));
    const job = f.lists.refresh(); f.requests.shift()!(); await job;
    expect(walks).toBe(1);
    expect(lookups).toBe(discovered);
  });
  it('ignores stale results and results delivered after the player closes or the plugin stops', async () => {
    for (const end of ['invalidate', 'close', 'dispose']) {
      const f = fixture(), previous = f.manager._allVoices;
      const job = f.lists.refresh();
      if (end === 'invalidate') f.lists.invalidate();
      if (end === 'close') { f.manager.active = false; f.reader._internalReader._state.readAloudState.popupOpen = false; }
      if (end === 'dispose') f.lists.dispose();
      f.requests.shift()!(); await job;
      expect(f.manager._allVoices).toBe(previous);
      expect(f.resolveVoice).not.toHaveBeenCalled();
    }
  });
  it('keeps a paused voice when discovery omits it, without choosing a fallback', async () => {
    const f = fixture();
    f.setListed([]);
    const job = f.lists.refresh(); f.requests.shift()!(); await job;
    expect(f.manager._allVoices).toEqual([f.playing]);
    expect(f.resolveVoice).not.toHaveBeenCalled();
    expect(f.lists.inspect(f.reader)?.retained).toBe(1);
  });
  it('notifies deferred settings after a session ends and restores hooks on disposal', async () => {
    const f = fixture();
    f.manager.deactivate(); await Promise.resolve();
    expect(f.ended).toHaveBeenCalledOnce();
    f.lists.dispose();
    f.manager.deactivate(); await Promise.resolve();
    expect(f.ended).toHaveBeenCalledOnce();
  });
  it('invalidates a closed player so reopening cannot start a removed provider from its old list', () => {
    const f = fixture();
    f.manager.active = false;
    f.reader._internalReader._state.readAloudState.popupOpen = false;
    f.lists.invalidate();
    expect(f.manager._allVoices).toEqual([]);
    expect(f.manager._voice).toBeNull();
  });
});
