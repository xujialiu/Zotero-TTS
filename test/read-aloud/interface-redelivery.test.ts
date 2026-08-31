import { describe, expect, it, vi } from 'vitest';
import { redeliverInterfaces, restoreInterfaces } from '../../src/read-aloud/interface-redelivery';

// A tab opened before this instance started holds the interface Zotero read
// from the previous instance at _open() — closures of a sandbox that has shut
// down (issue #38). The redelivery walk hands every such tab this instance's
// interface; the restore walk is its mirror at disable, handing the tabs back
// to Zotero's own.

type FakeReader = {
  name: string;
  /** Its compartment is gone; nothing may touch it. */
  dead?: boolean;
  /** Already carries this instance's override (the push hook got it). */
  patched?: boolean;
  /** Whether the tab has slots to write into (false: never finished opening). */
  slots?: boolean;
  /** Whether a voice list was already built in this tab. */
  voices?: boolean;
  /** Whether the reader offers a window to wrap an interface for. */
  window?: boolean;
};

function walkDeps(readers: FakeReader[]) {
  const log: string[] = [];
  return {
    log,
    deps: {
      readers: () => readers as unknown[],
      isDead: vi.fn((r: any) => !!r.dead),
      isPatched: vi.fn((r: any) => !!r.patched),
      patch: vi.fn((r: any) => log.push(`patch ${r.name}`)),
      build: vi.fn((r: any) => (r.window === false ? null : { iface: r.name })),
      buildNative: vi.fn((r: any) => (r.window === false ? null : { native: r.name })),
      deliver: vi.fn((r: any, iface: any) => {
        log.push(`deliver ${r.name} ${iface === null ? 'null' : ((iface.iface ?? iface.native) as string)}`);
        return r.slots !== false;
      }),
      hasVoices: vi.fn((r: any) => !!r.voices),
      refreshVoices: vi.fn((r: any) => log.push(`refresh ${r.name}`)),
      debug: vi.fn(),
      error: vi.fn(),
    },
  };
}

describe('redeliverInterfaces', () => {
  it('patches, delivers and rebuilds, in that order, for a tab with a voice list', () => {
    const { deps, log } = walkDeps([{ name: 'a', voices: true }]);
    const counts = redeliverInterfaces(deps);
    expect(log).toEqual(['patch a', 'deliver a a', 'refresh a']);
    expect(counts).toEqual({ delivered: 1, refreshed: 1 });
  });

  it('leaves the voice list alone in a tab that never built one', () => {
    // Its eventual _prepareReadAloud reads the fresh slot by itself
    const { deps } = walkDeps([{ name: 'a', voices: false }]);
    const counts = redeliverInterfaces(deps);
    expect(deps.refreshVoices).not.toHaveBeenCalled();
    expect(counts).toEqual({ delivered: 1, refreshed: 0 });
  });

  it('never touches a dead reader', () => {
    const { deps } = walkDeps([{ name: 'a', dead: true, voices: true }]);
    const counts = redeliverInterfaces(deps);
    expect(deps.patch).not.toHaveBeenCalled();
    expect(deps.build).not.toHaveBeenCalled();
    expect(deps.deliver).not.toHaveBeenCalled();
    expect(counts).toEqual({ delivered: 0, refreshed: 0 });
  });

  it('skips a reader the push hook already patched', () => {
    // Pushed between installHijack and this walk: Zotero has not read its
    // interface yet and will call our method itself at _open()
    const { deps } = walkDeps([{ name: 'a', patched: true, voices: true }]);
    const counts = redeliverInterfaces(deps);
    expect(deps.patch).not.toHaveBeenCalled();
    expect(deps.deliver).not.toHaveBeenCalled();
    expect(counts).toEqual({ delivered: 0, refreshed: 0 });
  });

  it('still patches a tab without slots, but delivers nothing to it', () => {
    // A pre-existing reader caught mid-_open: the own method is read later
    // by Zotero itself, so the patch alone rescues it
    const { deps } = walkDeps([{ name: 'a', slots: false, voices: true }]);
    const counts = redeliverInterfaces(deps);
    expect(deps.patch).toHaveBeenCalledTimes(1);
    expect(deps.refreshVoices).not.toHaveBeenCalled();
    expect(counts).toEqual({ delivered: 0, refreshed: 0 });
  });

  it('patches a reader that offers no window, without delivering', () => {
    const { deps } = walkDeps([{ name: 'a', window: false, voices: true }]);
    const counts = redeliverInterfaces(deps);
    expect(deps.patch).toHaveBeenCalledTimes(1);
    expect(deps.deliver).not.toHaveBeenCalled();
    expect(counts).toEqual({ delivered: 0, refreshed: 0 });
  });

  it('one failing reader does not strand the rest', () => {
    const readers: FakeReader[] = [
      { name: 'a', voices: true },
      { name: 'b', voices: true },
    ];
    const { deps } = walkDeps(readers);
    const failure = new Error('dead object');
    deps.deliver.mockImplementation((r: any) => {
      if (r.name === 'a') throw failure;
      return true;
    });
    const counts = redeliverInterfaces(deps);
    expect(deps.error).toHaveBeenCalledWith(failure);
    expect(deps.refreshVoices).toHaveBeenCalledTimes(1);
    expect(counts).toEqual({ delivered: 1, refreshed: 1 });
  });

  it('says what it did, and nothing when there was nothing to do', () => {
    const busy = walkDeps([{ name: 'a', voices: true }, { name: 'b' }]);
    redeliverInterfaces(busy.deps);
    expect(busy.deps.debug).toHaveBeenCalledWith('redelivered the Read Aloud interface to 2 open reader(s); rebuilt 1 voice list(s)');

    const idle = walkDeps([]);
    redeliverInterfaces(idle.deps);
    expect(idle.deps.debug).not.toHaveBeenCalled();
  });
});

describe('restoreInterfaces', () => {
  it("hands a patched tab back to Zotero's interface and rebuilds its list", () => {
    const { deps, log } = walkDeps([{ name: 'a', patched: true, voices: true }]);
    const counts = restoreInterfaces(deps);
    expect(log).toEqual(['deliver a a', 'refresh a']);
    expect(counts).toEqual({ restored: 1, refreshed: 1 });
  });

  it('leaves readers it never patched alone', () => {
    // An own _getReadAloudRemoteInterface it did not install may be another
    // plugin's; the slots then hold that plugin's interface, not ours
    const { deps } = walkDeps([{ name: 'a', voices: true }]);
    const counts = restoreInterfaces(deps);
    expect(deps.deliver).not.toHaveBeenCalled();
    expect(counts).toEqual({ restored: 0, refreshed: 0 });
  });

  it('clears the slot when the prototype offers no native interface', () => {
    const { deps } = walkDeps([{ name: 'a', patched: true }]);
    deps.buildNative.mockReturnValue(null);
    restoreInterfaces(deps);
    expect(deps.deliver).toHaveBeenCalledWith(expect.objectContaining({ name: 'a' }), null);
  });

  it('never touches a dead reader', () => {
    const { deps } = walkDeps([{ name: 'a', dead: true, patched: true, voices: true }]);
    const counts = restoreInterfaces(deps);
    expect(deps.deliver).not.toHaveBeenCalled();
    expect(counts).toEqual({ restored: 0, refreshed: 0 });
  });

  it('does not rebuild a list in a tab whose slots are gone', () => {
    const { deps } = walkDeps([{ name: 'a', patched: true, slots: false, voices: true }]);
    const counts = restoreInterfaces(deps);
    expect(deps.refreshVoices).not.toHaveBeenCalled();
    expect(counts).toEqual({ restored: 0, refreshed: 0 });
  });

  it('one failing reader does not strand the rest', () => {
    const readers: FakeReader[] = [
      { name: 'a', patched: true, voices: true },
      { name: 'b', patched: true, voices: true },
    ];
    const { deps } = walkDeps(readers);
    const failure = new Error('dead object');
    deps.deliver.mockImplementation((r: any) => {
      if (r.name === 'a') throw failure;
      return true;
    });
    const counts = restoreInterfaces(deps);
    expect(deps.error).toHaveBeenCalledWith(failure);
    expect(counts).toEqual({ restored: 1, refreshed: 1 });
  });

  it('says what it did, and nothing when there was nothing to do', () => {
    const busy = walkDeps([{ name: 'a', patched: true, voices: true }]);
    restoreInterfaces(busy.deps);
    expect(busy.deps.debug).toHaveBeenCalledWith("handed 1 open reader(s) back to Zotero's Read Aloud interface; rebuilt 1 voice list(s)");

    const idle = walkDeps([{ name: 'b' }]);
    restoreInterfaces(idle.deps);
    expect(idle.deps.debug).not.toHaveBeenCalled();
  });
});
