import { describe, expect, it, vi } from 'vitest';
import { createSystemVoiceHiding, type SystemVoiceHidingDeps } from '../../src/read-aloud/system-voices';
import { encodeVoiceId } from '../../src/read-aloud/voice-catalog';

// Voice shapes as ReadAloudManager._allVoices holds them: Zotero's cloud
// voices under standard/premium, the operating system's under local with ids
// 'local-<voiceURI>' (BrowserReadAloudVoice, reader.js ~39626), ours under
// local with the encoded provider::voice ids (RemoteReadAloudVoice returns
// impl.id verbatim, reader.js ~40436).
const systemVoice = () => ({ id: 'local-com.apple.voice.premium.en-US.Ava', tier: 'local' });
const systemVoice2 = () => ({ id: 'local-urn:moz-tts:osx:com.apple.eloquence.en-US.Eddy', tier: 'local' });
const pluginVoice = () => ({ id: encodeVoiceId('azure', 'en-US-AvaMultilingualNeural'), tier: 'local' });
const cloudVoice = () => ({ id: 'am_default', tier: 'standard' });

// One manager class per reader tab, as each tab has its own bundle
function makeReader(voices: unknown[]) {
  class Manager {
    _allVoices = voices;
    resolved = 0;
    _resolveVoice(): void {
      this.resolved += 1;
    }
  }
  const manager = new Manager();
  return { manager, reader: { _internalReader: { _readAloudManager: manager } } };
}

function make(overrides: Partial<SystemVoiceHidingDeps> = {}) {
  const error = vi.fn();
  const hiding = createSystemVoiceHiding({ enabled: () => true, error, ...overrides });
  return { hiding, error };
}

describe('createSystemVoiceHiding', () => {
  it('does not attach without a manager', () => {
    const { hiding, error } = make();
    expect(hiding.attach(null)).toBe(false);
    expect(hiding.attach({})).toBe(false);
    expect(hiding.attach({ _internalReader: {} })).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it('splices the system voices out of _allVoices before the original _resolveVoice runs', () => {
    const voices = [cloudVoice(), systemVoice(), pluginVoice(), systemVoice2()];
    const { manager, reader } = makeReader(voices);
    const { hiding, error } = make();
    expect(hiding.attach(reader)).toBe(true);
    manager._resolveVoice();
    expect(manager.resolved).toBe(1);
    expect(manager._allVoices).toEqual([cloudVoice(), pluginVoice()]);
    expect(error).not.toHaveBeenCalled();
  });

  it("keeps Zotero's cloud tiers even when their ids do not decode as ours", () => {
    const { manager, reader } = makeReader([cloudVoice(), { id: 'premium-1', tier: 'premium' }]);
    const { hiding } = make();
    hiding.attach(reader);
    manager._resolveVoice();
    expect(manager._allVoices).toHaveLength(2);
  });

  it('leaves the list alone while the switch is off', () => {
    const voices = [systemVoice(), pluginVoice()];
    const { manager, reader } = makeReader(voices);
    const { hiding } = make({ enabled: () => false });
    hiding.attach(reader);
    manager._resolveVoice();
    expect(manager.resolved).toBe(1);
    expect(manager._allVoices).toHaveLength(2);
  });

  // loadVoices rebuilds _allVoices on every popup open, so filtering per
  // _resolveVoice makes the switch apply, in both directions, on the next open
  it('re-filters a rebuilt list on the next _resolveVoice', () => {
    const { manager, reader } = makeReader([pluginVoice()]);
    const { hiding } = make();
    hiding.attach(reader);
    manager._resolveVoice();
    manager._allVoices = [systemVoice(), pluginVoice()];
    manager._resolveVoice();
    expect(manager._allVoices).toEqual([pluginVoice()]);
  });

  it('attaches once per manager prototype, however often it is called', () => {
    const { manager, reader } = makeReader([systemVoice()]);
    const { hiding } = make();
    expect(hiding.attach(reader)).toBe(true);
    expect(hiding.attach(reader)).toBe(true);
    manager._resolveVoice();
    expect(manager.resolved).toBe(1);
  });

  it('patches each reader tab bundle separately', () => {
    const first = makeReader([systemVoice(), pluginVoice()]);
    const second = makeReader([systemVoice2()]);
    const { hiding } = make();
    hiding.attach(first.reader);
    hiding.attach(second.reader);
    first.manager._resolveVoice();
    second.manager._resolveVoice();
    expect(first.manager._allVoices).toEqual([pluginVoice()]);
    expect(second.manager._allVoices).toEqual([]);
  });

  it('tolerates a missing or odd _allVoices and null entries', () => {
    const { manager, reader } = makeReader([null, systemVoice()]);
    const { hiding, error } = make();
    hiding.attach(reader);
    (manager as any)._allVoices = undefined;
    manager._resolveVoice();
    manager._allVoices = [null, systemVoice()];
    manager._resolveVoice();
    expect(manager._allVoices).toEqual([null]);
    expect(manager.resolved).toBe(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('a broken enabled() is reported and the original still runs', () => {
    const { manager, reader } = makeReader([systemVoice()]);
    const { hiding, error } = make({
      enabled: () => {
        throw new Error('prefs gone');
      },
    });
    hiding.attach(reader);
    manager._resolveVoice();
    expect(manager.resolved).toBe(1);
    expect(manager._allVoices).toHaveLength(1);
    expect(error).toHaveBeenCalled();
  });

  it('exports the wrapper into the reader compartment when a helper is given', () => {
    const exportFunction = vi.fn((fn: (...args: unknown[]) => unknown) => fn);
    const { manager, reader } = makeReader([systemVoice()]);
    const { hiding } = make({ exportFunction });
    hiding.attach(reader);
    expect(exportFunction).toHaveBeenCalledTimes(1);
    manager._resolveVoice();
    expect(manager._allVoices).toEqual([]);
  });

  it('dispose restores the original method', () => {
    const { manager, reader } = makeReader([pluginVoice()]);
    const { hiding } = make();
    hiding.attach(reader);
    hiding.dispose();
    manager._allVoices = [systemVoice()];
    manager._resolveVoice();
    expect(manager.resolved).toBe(1);
    expect(manager._allVoices).toHaveLength(1);
  });

  it('dispose leaves the prototype of a closed tab alone, and says nothing about it', () => {
    const { manager, reader } = makeReader([pluginVoice()]);
    const closed = new Set<unknown>();
    const { hiding, error } = make({ isDead: (p) => closed.has(p) });
    hiding.attach(reader);
    expect(hiding.patchCounts()).toEqual({ total: 1, live: 1 });

    // The tab closed: its compartment is nuked, so the prototype is a dead
    // object every assignment throws through (issue #5)
    closed.add(Object.getPrototypeOf(manager));
    expect(hiding.patchCounts()).toEqual({ total: 1, live: 0 });
    hiding.dispose();

    expect(error).not.toHaveBeenCalled();
    expect(hiding.patchCounts()).toEqual({ total: 0, live: 0 });
  });

  it('inspect reports the switch, the patch and the tier counts', () => {
    const { manager, reader } = makeReader([cloudVoice(), systemVoice(), pluginVoice()]);
    const { hiding } = make();
    expect(hiding.inspect(reader)).toMatchObject({ enabled: true, patched: false });
    hiding.attach(reader);
    expect(hiding.inspect(reader)).toEqual({
      enabled: true,
      patched: true,
      voices: { standard: 1, 'local-system': 1, 'local-plugin': 1 },
    });
    manager._resolveVoice();
    expect(hiding.inspect(reader)).toEqual({
      enabled: true,
      patched: true,
      voices: { standard: 1, 'local-plugin': 1 },
    });
    expect(hiding.inspect({})).toMatchObject({ patched: false });
  });
});
