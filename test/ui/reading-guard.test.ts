import { describe, expect, it, vi } from 'vitest';
import { readingTabsMessage, refuseWhileReading, showPaneNotice } from '../../src/ui/reading-guard';

describe('readingTabsMessage', () => {
  it('names the tabs and says what to do', () => {
    const message = readingTabsMessage(['Deep learning', 'Another paper']);
    expect(message).toContain('Read Aloud is open in 2 tabs');
    expect(message).toContain('  • Deep learning');
    expect(message).toContain('  • Another paper');
    expect(message.split('\n').pop()).toBe('Close those tabs, then try again.');
  });

  it('speaks of one tab in the singular', () => {
    const message = readingTabsMessage(['Deep learning']);
    expect(message).toBe('Read Aloud is open in a tab:\n  • Deep learning\n\nClose that tab, then try again.');
  });
});

describe('refuseWhileReading', () => {
  it('is silent and lets the action through while nothing is reading', () => {
    const warn = vi.fn();
    expect(refuseWhileReading({ readingTabs: () => [], warn })).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('tells the user where Read Aloud is open, and refuses', () => {
    const warn = vi.fn();
    expect(refuseWhileReading({ readingTabs: () => ['Deep learning'], warn })).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
  });
});

describe('showPaneNotice', () => {
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
