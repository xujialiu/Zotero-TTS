import { describe, expect, it, vi } from 'vitest';
import { createPlayerStop, isPlayerOpen } from '../../src/read-aloud/player-stop';

/**
 * A reader as the stop sees it: the popup flag, the manager's flags, and
 * the headphone button's own close — which deactivates and drops the
 * popup flag in the same tick, as Zotero's does (issue #65, measured).
 */
function fakeReader(state: { popupOpen?: boolean; active?: boolean } = {}, options: { closeThrows?: boolean; noClose?: boolean } = {}) {
  const internal: any = {
    _state: { readAloudState: { popupOpen: state.popupOpen ?? false } },
    _readAloudManager: { active: state.active ?? false, paused: true },
  };
  if (!options.noClose) {
    internal.toggleReadAloudPopup = vi.fn((open: boolean) => {
      if (options.closeThrows) throw new Error("can't access dead object");
      if (open) return;
      internal._readAloudManager.active = false;
      internal._state.readAloudState.popupOpen = false;
    });
  }
  return { _internalReader: internal };
}

describe('isPlayerOpen', () => {
  it('is true with the popup up, with a session open behind it, and with both', () => {
    expect(isPlayerOpen(fakeReader({ popupOpen: true }))).toBe(true);
    expect(isPlayerOpen(fakeReader({ active: true }))).toBe(true);
    expect(isPlayerOpen(fakeReader({ popupOpen: true, active: true }))).toBe(true);
  });

  it('is false on a closed player, a reader without Read Aloud, and one that throws', () => {
    expect(isPlayerOpen(fakeReader())).toBe(false);
    expect(isPlayerOpen({})).toBe(false);
    expect(isPlayerOpen({ _internalReader: {} })).toBe(false);
    expect(isPlayerOpen(null)).toBe(false);
    const dead = {
      get _internalReader(): any {
        throw new Error("can't access dead object");
      },
    };
    expect(isPlayerOpen(dead)).toBe(false);
  });
});

describe('createPlayerStop', () => {
  it('open() lists the readers with a player, in reader order', () => {
    const speaking = fakeReader({ popupOpen: true, active: true });
    const closed = fakeReader();
    const loading = fakeReader({ popupOpen: true });
    const stop = createPlayerStop({ readers: () => [closed, speaking, loading] });
    expect(stop.open()).toEqual([speaking, loading]);
  });

  it("stopAll() closes each of them the button's way, once, and returns them", () => {
    const speaking = fakeReader({ popupOpen: true, active: true });
    const closed = fakeReader();
    const paused = fakeReader({ popupOpen: true, active: true });
    const stop = createPlayerStop({ readers: () => [speaking, closed, paused] });
    expect(stop.stopAll()).toEqual([speaking, paused]);
    for (const reader of [speaking, paused]) {
      expect(reader._internalReader.toggleReadAloudPopup).toHaveBeenCalledTimes(1);
      expect(reader._internalReader.toggleReadAloudPopup).toHaveBeenCalledWith(false);
      expect(isPlayerOpen(reader)).toBe(false);
    }
    expect(closed._internalReader.toggleReadAloudPopup).not.toHaveBeenCalled();
    expect(stop.open()).toEqual([]);
  });

  // One dead tab must not keep the others open: the guard's invariant is
  // about every player, and the guard re-reads what is left afterwards
  it('a reader whose close throws is logged and left out, and the rest still close', () => {
    const dead = fakeReader({ popupOpen: true, active: true }, { closeThrows: true });
    const live = fakeReader({ popupOpen: true, active: true });
    const log = vi.fn();
    const stop = createPlayerStop({ readers: () => [dead, live], log });
    expect(stop.stopAll()).toEqual([live]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('dead object');
    expect(isPlayerOpen(live)).toBe(false);
    expect(isPlayerOpen(dead)).toBe(true);
  });

  it('a reader without the close at all is not counted as closed', () => {
    const older = fakeReader({ popupOpen: true, active: true }, { noClose: true });
    const stop = createPlayerStop({ readers: () => [older] });
    expect(stop.stopAll()).toEqual([]);
    expect(stop.open()).toEqual([older]);
  });

  it('closes nothing and returns nothing with no player open, and with no readers', () => {
    const closed = fakeReader();
    expect(createPlayerStop({ readers: () => [closed] }).stopAll()).toEqual([]);
    expect(closed._internalReader.toggleReadAloudPopup).not.toHaveBeenCalled();
    expect(createPlayerStop({ readers: () => [] }).stopAll()).toEqual([]);
  });
});
