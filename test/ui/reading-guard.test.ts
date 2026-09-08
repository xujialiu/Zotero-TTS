import { describe, expect, it, vi } from 'vitest';
import { askPaneQuestion, readingTabsMessage, refuseWhileReading, showPaneNotice, stopReadingMessage } from '../../src/ui/reading-guard';

describe('readingTabsMessage', () => {
  it('names the tabs and says what to do — the player, not the tab, is what has to close', () => {
    const message = readingTabsMessage(['Deep learning', 'Another paper']);
    expect(message).toContain('Read Aloud is open in 2 tabs');
    expect(message).toContain('  • Deep learning');
    expect(message).toContain('  • Another paper');
    expect(message.split('\n').pop()).toBe('Close the player in those tabs, then try again.');
  });

  it('speaks of one tab in the singular', () => {
    const message = readingTabsMessage(['Deep learning']);
    expect(message).toBe('Read Aloud is open in a tab:\n  • Deep learning\n\nClose the player in that tab, then try again.');
  });
});

describe('stopReadingMessage', () => {
  // The cost is said before the press: the reading stops, the place is
  // kept, and the manual way out is still there
  it('names the tabs, offers to stop the reading there, and says what that costs', () => {
    const message = stopReadingMessage(['Deep learning', 'Another paper']);
    expect(message.split('\n')[0]).toBe('Read Aloud is open in 2 tabs:');
    expect(message).toContain('  • Deep learning\n  • Another paper\n\n');
    expect(message.split('\n').pop()).toBe(
      'Stopping it there lets this change through; each tab keeps its place, and Read Aloud picks up there when you start it again. Or close the player in those tabs yourself, then try again.',
    );
  });

  it('speaks of one tab in the singular', () => {
    const message = stopReadingMessage(['Deep learning']);
    expect(message.split('\n')[0]).toBe('Read Aloud is open in a tab:');
    expect(message).toContain('Or close the player in that tab yourself, then try again.');
  });
});

describe('refuseWhileReading', () => {
  it('is silent and lets the action through while nothing is reading', async () => {
    const warn = vi.fn();
    const askToStop = vi.fn(async () => true);
    expect(await refuseWhileReading({ readingTabs: () => [], warn, askToStop, stopReading: () => [] })).toBe(false);
    expect(warn).not.toHaveBeenCalled();
    expect(askToStop).not.toHaveBeenCalled();
  });

  // Without a way to stop the players there is nothing to ask: the old refusal
  it('tells the user where Read Aloud is open, and refuses, when it cannot stop the players', async () => {
    const warn = vi.fn();
    expect(await refuseWhileReading({ readingTabs: () => ['Deep learning'], warn })).toBe(true);
    expect(warn).toHaveBeenCalledWith(readingTabsMessage(['Deep learning']));
  });

  it('asks, and refuses on Cancel without touching a player', async () => {
    const warn = vi.fn();
    const askToStop = vi.fn(async (_message: string) => false);
    const stopReading = vi.fn(() => ['Deep learning']);
    expect(await refuseWhileReading({ readingTabs: () => ['Deep learning'], warn, askToStop, stopReading })).toBe(true);
    expect(askToStop).toHaveBeenCalledWith(stopReadingMessage(['Deep learning']));
    expect(stopReading).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  // One press does both: the players close, and the caller's write follows
  it('stops the players on Stop and lets the action through, with nothing else said', async () => {
    const warn = vi.fn();
    const reading = ['Deep learning', 'Attention'];
    const askToStop = vi.fn(async (_message: string) => true);
    const stopReading = vi.fn(() => reading.splice(0));
    expect(await refuseWhileReading({ readingTabs: () => [...reading], warn, askToStop, stopReading })).toBe(false);
    expect(askToStop).toHaveBeenCalledWith(stopReadingMessage(['Deep learning', 'Attention']));
    expect(stopReading).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  // The invariant over the convenience: a player that would not close
  // (a reader gone dead mid-close) keeps the change waiting
  it('still refuses, naming what is left, when a player would not close', async () => {
    const warn = vi.fn();
    const reading = ['Deep learning', 'Attention'];
    const askToStop = vi.fn(async (_message: string) => true);
    const stopReading = vi.fn(() => reading.splice(0, 1));
    expect(await refuseWhileReading({ readingTabs: () => [...reading], warn, askToStop, stopReading })).toBe(true);
    expect(stopReading).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(readingTabsMessage(['Attention']));
  });
});

/** The pane document in miniature: elements that can hold children, and a dialog that can be shown modal. */
class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  children: FakeElement[] = [];
  textContent = '';
  parent: FakeElement | null = null;
  modal = false;
  focused = false;
  constructor(public tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  fire(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn();
  }
  focus() {
    this.focused = true;
  }
  showModal() {
    this.modal = true;
  }
  close() {
    this.modal = false;
    this.fire('close');
  }
}
function fakeDoc(dark = false, dialogTag = 'dialog') {
  const body = new FakeElement('body');
  return {
    body,
    createElementNS: (_ns: string, tag: string) => {
      const el = new FakeElement(tag);
      // A document whose dialog cannot be shown modal (an older toolkit) lacks the method
      if (tag === 'dialog' && dialogTag !== 'dialog') (el as any).showModal = undefined;
      return el;
    },
    defaultView: { matchMedia: (q: string) => ({ matches: dark && q.includes('dark') }) },
  };
}

describe('showPaneNotice', () => {
  // Drawn like an alert window: a title strip, the warning sign beside the
  // text with its first line in bold, OK bottom right, a dimmed backdrop
  it('shows the message as a modal alert of the pane, painted for its theme, and removes it on close', () => {
    const doc = fakeDoc(true);
    const fallback = vi.fn();
    showPaneNotice(doc, 'Read Aloud is open in a tab:\n  • Paper\n\nClose it.', fallback);
    const dialog = doc.body.children[0];
    expect(dialog.tag).toBe('dialog');
    expect(dialog.modal).toBe(true);
    expect(dialog.attrs.get('style')).toContain('color-scheme: dark');
    expect(dialog.attrs.get('style')).toContain('background: #202020');
    const [style, title, body, buttons] = dialog.children;
    expect(style.tag).toBe('style');
    expect(style.textContent).toContain('#ztts-notice::backdrop');
    expect(title.textContent).toBe('Zotero-TTS');
    expect(body.children[0].textContent).toBe('⚠️');
    expect(body.children[1].children[0].textContent).toBe('Read Aloud is open in a tab:');
    expect(body.children[1].children[0].attrs.get('style')).toContain('font-weight: 600');
    expect(body.children[1].children[1].textContent).toBe('  • Paper\n\nClose it.');
    expect(buttons.children).toHaveLength(1);
    const ok = buttons.children[0];
    expect(ok.textContent).toBe('OK');
    expect(ok.focused).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
    ok.fire('click');
    expect(dialog.modal).toBe(false);
    expect(doc.body.children).toEqual([]);
  });

  it('paints light colors under a light theme, and takes another title', () => {
    const doc = fakeDoc(false);
    showPaneNotice(doc, 'x', vi.fn(), 'Elsewhere');
    const dialog = doc.body.children[0];
    expect(dialog.attrs.get('style')).toContain('color-scheme: light');
    expect(dialog.attrs.get('style')).toContain('background: #f3f3f3');
    expect(dialog.children[1].textContent).toBe('Elsewhere');
    expect(dialog.children[2].children[1].children).toHaveLength(1);
  });

  it('falls back to the OS prompt where the dialog cannot be shown modal', () => {
    const doc = fakeDoc(false, 'no-modal');
    const fallback = vi.fn();
    showPaneNotice(doc, 'x', fallback);
    expect(fallback).toHaveBeenCalledWith('x');
    expect(doc.body.children).toEqual([]);
  });

  it('falls back, and leaves nothing behind, when showModal refuses', () => {
    const doc = fakeDoc(false);
    const create = doc.createElementNS;
    doc.createElementNS = (ns: string, tag: string) => {
      const el = create(ns, tag);
      if (tag === 'dialog') {
        el.showModal = () => {
          throw new Error('not connected');
        };
      }
      return el;
    };
    const fallback = vi.fn();
    showPaneNotice(doc, 'x', fallback);
    expect(fallback).toHaveBeenCalledWith('x');
    expect(doc.body.children).toEqual([]);
  });
});

describe('askPaneQuestion', () => {
  const LABELS = { confirm: 'Stop reading and continue', cancel: 'Cancel' };

  // The same alert with two buttons; Cancel holds the focus, so Enter is
  // never the press that stops every tab's reading
  it('shows the question with Stop and Cancel, Cancel focused, and resolves true on Stop', async () => {
    const doc = fakeDoc(true);
    const fallback = vi.fn(() => false);
    const answer = askPaneQuestion(doc, 'Read Aloud is open in a tab:\n  • Paper\n\nStop it?', LABELS, fallback);
    const dialog = doc.body.children[0];
    expect(dialog.modal).toBe(true);
    expect(dialog.attrs.get('id')).toBe('ztts-notice');
    const [, title, body, buttons] = dialog.children;
    expect(title.textContent).toBe('Zotero-TTS');
    expect(body.children[1].children[0].textContent).toBe('Read Aloud is open in a tab:');
    expect(body.children[1].children[1].textContent).toBe('  • Paper\n\nStop it?');
    expect(buttons.children.map((b) => b.textContent)).toEqual(['Stop reading and continue', 'Cancel']);
    const [stop, cancel] = buttons.children;
    expect(cancel.focused).toBe(true);
    expect(stop.focused).toBe(false);
    stop.fire('click');
    expect(await answer).toBe(true);
    expect(dialog.modal).toBe(false);
    expect(doc.body.children).toEqual([]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('resolves false on Cancel', async () => {
    const doc = fakeDoc(false);
    const answer = askPaneQuestion(doc, 'x', LABELS, vi.fn(() => true));
    const dialog = doc.body.children[0];
    dialog.children[3].children[1].fire('click');
    expect(await answer).toBe(false);
    expect(doc.body.children).toEqual([]);
  });

  // Escape closes an html dialog without a click: that is a Cancel too
  it('resolves false when the dialog closes any other way', async () => {
    const doc = fakeDoc(false);
    const answer = askPaneQuestion(doc, 'x', LABELS, vi.fn(() => true));
    doc.body.children[0].close();
    expect(await answer).toBe(false);
    expect(doc.body.children).toEqual([]);
  });

  it('falls back to the OS prompt, and takes its answer, where the dialog cannot be shown modal', async () => {
    const doc = fakeDoc(false, 'no-modal');
    const fallback = vi.fn((_message: string) => true);
    expect(await askPaneQuestion(doc, 'x', LABELS, fallback)).toBe(true);
    expect(fallback).toHaveBeenCalledWith('x');
    expect(doc.body.children).toEqual([]);
  });

  it('falls back, and leaves nothing behind, when showModal refuses', async () => {
    const doc = fakeDoc(false);
    const create = doc.createElementNS;
    doc.createElementNS = (ns: string, tag: string) => {
      const el = create(ns, tag);
      if (tag === 'dialog') {
        el.showModal = () => {
          throw new Error('not connected');
        };
      }
      return el;
    };
    const fallback = vi.fn((_message: string) => false);
    expect(await askPaneQuestion(doc, 'x', LABELS, fallback)).toBe(false);
    expect(fallback).toHaveBeenCalledWith('x');
    expect(doc.body.children).toEqual([]);
  });
});
