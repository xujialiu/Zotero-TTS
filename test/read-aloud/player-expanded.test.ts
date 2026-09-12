import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayerExpanded, READY_ATTRIBUTE, EXPANSION_TIMEOUT_MS } from '../../src/read-aloud/player-expanded';

// React commits a click later. The fake deliberately never expands in click().
function setup(enabled = true, existing = false) {
  vi.useFakeTimers();
  let notify = () => {};
  const nodes: any[] = [];
  const make = () => {
    const attrs = new Map<string, string>();
    const popup: any = {
      expanded: false, isConnected: true,
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
      hasAttribute: (k: string) => attrs.has(k),
      classList: { contains: () => popup.expanded },
      button: { click: vi.fn() },
      querySelector: () => popup.button,
    };
    return popup;
  };
  let popup: any = existing ? make() : null;
  const doc: any = {
    createElement: () => {
      const style = { textContent: '', id: '', remove: () => nodes.splice(nodes.indexOf(style), 1) };
      return style;
    },
    documentElement: { appendChild: (n: any) => nodes.push(n) },
    querySelector: () => popup,
  };
  const disconnect = vi.fn();
  const error = vi.fn();
  const controller = createPlayerExpanded({
    enabled: () => enabled, documentOf: () => doc,
    observe: (_doc, callback) => { notify = callback; return disconnect; },
    error,
  });
  controller.attach(doc);
  return {
    controller, doc, nodes, error, disconnect,
    current: () => popup,
    open: (change?: (popup: any) => void) => { popup = make(); change?.(popup); notify(); return popup; },
    close: () => { popup.isConnected = false; popup = null; notify(); },
    commit: () => { popup.expanded = true; notify(); },
    fold: () => { popup.expanded = false; notify(); },
    set: (value: boolean) => { enabled = value; controller.refresh(); },
    notify: () => notify(),
  };
}

afterEach(() => vi.useRealTimers());

describe('open the player expanded', () => {
  it('leaves default-off players alone', () => {
    const s = setup(false); const p = s.open();
    expect(p.button.click).not.toHaveBeenCalled();
    expect(s.nodes[0].textContent).toBe('');
  });

  it('gates new players until the asynchronous expansion commits, clicking only once', () => {
    const s = setup(); const p = s.open();
    expect(s.nodes[0].textContent).toContain('visibility: hidden');
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(false);
    s.notify();
    expect(p.button.click).toHaveBeenCalledTimes(1);
    s.commit();
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(true);
    vi.advanceTimersByTime(EXPANSION_TIMEOUT_MS);
    expect(s.error).not.toHaveBeenCalled();
  });

  it('respects manual folding and initializes the next showing afresh', () => {
    const s = setup(); const p = s.open(); s.commit(); s.fold();
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(true);
    expect(p.button.click).toHaveBeenCalledTimes(1);
    s.close(); const next = s.open();
    expect(next.button.click).toHaveBeenCalledTimes(1);
    expect(next.hasAttribute(READY_ATTRIBUTE)).toBe(false);
  });

  it('does not change a popup already present at attachment or when enabling', () => {
    const s = setup(false, true); const p = s.current(); s.set(true); s.notify();
    expect(p.button.click).not.toHaveBeenCalled();
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(true);
    s.close(); expect(s.open().button.click).toHaveBeenCalledTimes(1);
  });

  it('does not restart initialization when attached again', () => {
    const s = setup(); const p = s.open(); s.controller.attach(s.doc); s.notify();
    expect(p.button.click).toHaveBeenCalledTimes(1);
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(false);
  });

  it('reveals a player whose expansion never commits and reports the failure once', () => {
    const s = setup(); const p = s.open();
    vi.advanceTimersByTime(EXPANSION_TIMEOUT_MS);
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(true);
    expect(s.error).toHaveBeenCalledTimes(1);
    s.notify(); expect(p.button.click).toHaveBeenCalledTimes(1);
  });

  it('reveals on a missing button or click failure', () => {
    for (const missing of [true, false]) {
      const s = setup();
      const p = s.open((p) => {
        p.button = missing ? null : { click: () => { throw new Error('click failed'); } };
      });
      expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(true);
      expect(s.error).toHaveBeenCalledTimes(1);
      s.controller.dispose();
    }
  });

  it('releases pending gates on disable and teardown, without delayed errors', () => {
    const s = setup(); const p = s.open(); s.set(false);
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(true);
    expect(s.nodes[0].textContent).toBe('');
    s.controller.dispose();
    expect(s.nodes).toHaveLength(0);
    expect(s.disconnect).toHaveBeenCalledOnce();
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(false);
    vi.runAllTimers(); expect(s.error).not.toHaveBeenCalled();
  });

  it('cancels a removed popup timeout and never toggles an already expanded popup', () => {
    const s = setup(); s.open(); s.close();
    vi.runAllTimers(); expect(s.error).not.toHaveBeenCalled();
    const p = s.open((p) => { p.expanded = true; });
    expect(p.button.click).not.toHaveBeenCalled();
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(true);
    expect(s.error).not.toHaveBeenCalled();
  });

  it('removes the entire gate if inspecting a live popup throws', () => {
    const s = setup();
    s.doc.querySelector = () => { throw new Error('document failure'); };
    s.notify();
    expect(s.nodes[0].textContent).toBe('');
    expect(s.error).toHaveBeenCalledOnce();
  });

  it('disconnects and releases pending work when the reader closes', () => {
    const s = setup(); const p = s.open(); s.controller.detach(s.doc);
    expect(s.nodes).toHaveLength(0);
    expect(s.disconnect).toHaveBeenCalledOnce();
    expect(p.hasAttribute(READY_ATTRIBUTE)).toBe(false);
    vi.runAllTimers(); expect(s.error).not.toHaveBeenCalled();
  });

  it('keeps separate readers independent', () => {
    const first = setup(); const second = setup();
    const a = first.open(); const b = second.open();
    first.commit(); first.fold();
    expect(a.hasAttribute(READY_ATTRIBUTE)).toBe(true);
    expect(b.hasAttribute(READY_ATTRIBUTE)).toBe(false);
    second.commit();
    expect(b.button.click).toHaveBeenCalledTimes(1);
    expect(first.controller.inspect(first.doc)).toMatchObject({ ready: true, expanded: false });
    first.controller.dispose(); second.controller.dispose();
  });

  it('cleans up when the observer cannot be installed', () => {
    const s = setup(); s.controller.dispose();
    const c = createPlayerExpanded({ enabled: () => true, documentOf: () => s.doc,
      observe: () => { throw new Error('observer unavailable'); }, error: s.error });
    expect(c.attach(s.doc)).toBe(false);
    expect(s.nodes).toHaveLength(0);
    expect(s.error).toHaveBeenCalledOnce();
  });
});
