import { describe, expect, it, vi } from 'vitest';
import { createVolumeControl, type VolumeDeps } from '../../src/read-aloud/volume';

/**
 * One reader tab's Web Audio, the way Zotero builds it
 * (reader.js:39934-39955): each controller gets a fresh context whose
 * chain starts at `_filterChainInput`, and every buffer's source connects
 * to that. `rebuild()` is what `_handleDeviceChange` does on Windows —
 * close the context, build the chain again. Each tab has its own copies
 * of the classes, so `makeTab` returns fresh ones.
 */
function makeTab() {
  class Node {
    connections: Node[] = [];
    constructor(
      public ctx: Context,
      public kind: string,
    ) {}
    connect(node: Node) {
      this.connections.push(node);
      return node;
    }
  }
  class Gain extends Node {
    gain = { value: 1 };
  }
  class Context {
    state: 'running' | 'closed' = 'running';
    createGain() {
      return new Gain(this, 'gain');
    }
    createBiquadFilter() {
      return new Node(this, 'biquad');
    }
    close() {
      this.state = 'closed';
    }
  }
  class ControllerBase {
    _audioContext!: Context;
    _filterChainInput!: Node;
    sources: Node[] = [];
    constructor() {
      this._initAudioContext();
    }
    _initAudioContext() {
      this._audioContext = new Context();
      this._filterChainInput = this._audioContext.createBiquadFilter();
    }
    play() {
      const source = new Node(this._audioContext, 'source');
      source.connect(this._filterChainInput);
      this.sources.push(source);
    }
    rebuild() {
      this._audioContext.close();
      this._initAudioContext();
    }
    destroy() {
      this._audioContext.close();
    }
  }
  class RemoteReadAloudController extends ControllerBase {}
  class RemoteSampleReadAloudController extends ControllerBase {}
  class Manager {
    _controller: RemoteReadAloudController | null = null;
    _active = false;
    _paused = true;
    get active() {
      return this._active;
    }
    get paused() {
      return this._paused;
    }
    _createController() {
      this._controller?.destroy();
      this._controller = new RemoteReadAloudController();
    }
  }
  const manager = new Manager();
  return {
    ControllerBase,
    RemoteReadAloudController,
    RemoteSampleReadAloudController,
    Manager,
    manager,
    reader: { _internalReader: { _readAloudManager: manager } },
  };
}

function make(overrides: Partial<VolumeDeps> = {}) {
  const error = vi.fn();
  let level = 100;
  const volume = createVolumeControl({ getLevel: () => level, error, ...overrides });
  return { volume, error, set: (percent: number) => (level = percent) };
}

/** The gain a controller's chain starts at, or null when the chain is Zotero's own. */
const gainAt = (controller: any) => (controller._filterChainInput?.kind === 'gain' ? controller._filterChainInput : null);

describe('createVolumeControl', () => {
  it('does not attach without a manager', () => {
    const { volume, error } = make();
    expect(volume.attach(null)).toBe(false);
    expect(volume.attach({})).toBe(false);
    expect(volume.attach({ _internalReader: {} })).toBe(false);
    expect(volume.patchCounts()).toEqual({ total: 0, live: 0 });
    expect(error).not.toHaveBeenCalled();
  });

  it('puts a gain at the level ahead of the first controller’s chain, and every source lands on it', () => {
    const { manager, reader } = makeTab();
    const { volume, error, set } = make();
    set(80);
    expect(volume.attach(reader)).toBe(true);
    expect(volume.patchCounts()).toEqual({ total: 1, live: 1 });

    manager._createController();
    const controller = manager._controller!;
    const gain = gainAt(controller);
    expect(gain).not.toBeNull();
    expect(gain.gain.value).toBe(0.8);
    expect(gain.ctx).toBe(controller._audioContext);
    // gain → Zotero's highpass, the chain's old head
    expect(gain.connections.map((n: any) => n.kind)).toEqual(['biquad']);
    controller.play();
    expect(controller.sources[0].connections).toEqual([gain]);
    // The base prototype is patched from this first controller
    expect(volume.patchCounts()).toEqual({ total: 2, live: 2 });
    expect(volume.inspect(reader)).toMatchObject({
      patched: { manager: true, controller: true },
      level: 80,
      gain: 0.8,
      chains: [{ kind: 'RemoteReadAloudController', gainValue: 0.8, current: true, inChain: true, contextState: 'running' }],
      count: 1,
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('builds every later chain of the tab through the shadow: the next session and the popup’s samples', () => {
    const { manager, reader, RemoteSampleReadAloudController } = makeTab();
    const { volume, set } = make();
    set(50);
    volume.attach(reader);
    manager._createController();
    manager._createController();
    const second = manager._controller!;
    expect(gainAt(second).gain.value).toBe(0.5);
    // A sample controller is built by the popup, never through the manager
    const sample = new RemoteSampleReadAloudController();
    expect(gainAt(sample).gain.value).toBe(0.5);
    expect(volume.patchCounts()).toEqual({ total: 2, live: 2 });
    const chains = (volume.inspect(reader) as any).chains;
    // The first controller's context was closed by the second's creation, so it is gone
    expect(chains.map((c: any) => [c.kind, c.current, c.inChain])).toEqual([
      ['RemoteReadAloudController', true, true],
      ['RemoteSampleReadAloudController', false, false],
    ]);
    expect(volume.inspect(reader)).toMatchObject({ count: 3 });
  });

  it('survives Windows’ device-change rebuild: the new chain gets a gain too, the old one is dropped', () => {
    const { manager, reader } = makeTab();
    const { volume } = make();
    volume.attach(reader);
    manager._createController();
    const controller = manager._controller!;
    const before = gainAt(controller);
    controller.rebuild();
    const after = gainAt(controller);
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
    expect(after.ctx).toBe(controller._audioContext);
    controller.play();
    expect(controller.sources[0].connections).toEqual([after]);
    expect(volume.inspect(reader)).toMatchObject({ chains: [{ current: true, inChain: true, contextState: 'running' }], count: 2 });
  });

  it('apply() moves every open chain in every tab to the level, within the sentence', () => {
    const a = makeTab();
    const b = makeTab();
    const { volume, set } = make();
    volume.attach(a.reader);
    volume.attach(b.reader);
    a.manager._createController();
    b.manager._createController();
    const sample = new b.RemoteSampleReadAloudController();
    const closed = new a.RemoteSampleReadAloudController();
    closed.destroy();
    set(130);
    volume.apply();
    expect(gainAt(a.manager._controller).gain.value).toBe(1.3);
    expect(gainAt(b.manager._controller).gain.value).toBe(1.3);
    expect(gainAt(sample).gain.value).toBe(1.3);
    // A closed context is left alone and forgotten
    expect(gainAt(closed).gain.value).toBe(1);
    expect((volume.inspect(a.reader) as any).chains).toHaveLength(1);
  });

  // Issue #38: an in-place upgrade under a session — the controller exists
  // before this instance ever sees the manager
  it('patches a controller that is already running when it attaches', () => {
    const { manager, reader } = makeTab();
    manager._createController();
    const controller = manager._controller!;
    const { volume, set } = make();
    set(60);
    expect(volume.attach(reader)).toBe(true);
    expect(gainAt(controller).gain.value).toBe(0.6);
    expect(volume.patchCounts()).toEqual({ total: 2, live: 2 });
  });

  it('inserts once per chain, however often attached', () => {
    const { manager, reader } = makeTab();
    const { volume } = make();
    volume.attach(reader);
    manager._createController();
    volume.attach(reader);
    volume.attach(reader);
    const controller = manager._controller!;
    const gain = gainAt(controller);
    expect(gain.connections.map((n: any) => n.kind)).toEqual(['biquad']);
    expect(volume.patchCounts()).toEqual({ total: 2, live: 2 });
    expect(volume.inspect(reader)).toMatchObject({ count: 1 });

    const other = makeTab();
    volume.attach(other.reader);
    other.manager._createController();
    expect(volume.patchCounts()).toEqual({ total: 4, live: 4 });
    expect(volume.inspect(other.reader)).toMatchObject({ count: 1 });
  });

  it('on dispose puts the prototypes back and every open chain at Zotero’s own level', () => {
    const { ControllerBase, Manager, manager, reader } = makeTab();
    const createController = Manager.prototype._createController;
    const initAudioContext = ControllerBase.prototype._initAudioContext;
    const { volume, set } = make();
    set(40);
    volume.attach(reader);
    manager._createController();
    const controller = manager._controller!;
    expect(Manager.prototype._createController).not.toBe(createController);
    expect(ControllerBase.prototype._initAudioContext).not.toBe(initAudioContext);

    volume.dispose();
    expect(Manager.prototype._createController).toBe(createController);
    expect(ControllerBase.prototype._initAudioContext).toBe(initAudioContext);
    expect(volume.patchCounts()).toEqual({ total: 0, live: 0 });
    // The node stays in the running chain, at 1: what Zotero plays is Zotero's level again
    expect(gainAt(controller).gain.value).toBe(1);
    // And a chain built afterwards is Zotero's own
    manager._createController();
    expect(gainAt(manager._controller)).toBeNull();
  });

  it('logs a failure inside the shadow and leaves the chain as Zotero built it', () => {
    const { manager, reader } = makeTab();
    const { volume, error } = make({
      getLevel: () => {
        throw new Error('prefs gone');
      },
    });
    volume.attach(reader);
    manager._createController();
    expect(gainAt(manager._controller)).toBeNull();
    expect(error).toHaveBeenCalled();
    expect(volume.inspect(reader)).toMatchObject({ error: expect.stringContaining('prefs gone') });
  });

  it('exports the wrappers into the reader’s compartment and waives what comes back', () => {
    const { manager, reader } = makeTab();
    const exportFunction = vi.fn((fn: any) => fn);
    const waiveXrays = vi.fn((v: any) => v);
    const { volume } = make({ exportFunction, waiveXrays });
    volume.attach(reader);
    manager._createController();
    manager._createController();
    expect(exportFunction).toHaveBeenCalledTimes(2);
    expect(waiveXrays).toHaveBeenCalled();
  });

  it('inspects a tab with no session as unpatched on the controller side', () => {
    const { reader } = makeTab();
    const { volume } = make();
    volume.attach(reader);
    expect(volume.inspect(reader)).toMatchObject({
      patched: { manager: true, controller: false },
      active: false,
      paused: true,
      level: 100,
      gain: 1,
      chains: [],
      count: 0,
    });
    expect(volume.inspect({})).toMatchObject({ patched: { manager: false, controller: false }, chains: [] });
  });
});
