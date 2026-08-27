import { describe, expect, it, vi } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { guardProviderSwitches, readingTabsMessage, refuseWhileReading } from '../../src/ui/reading-guard';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

/** A bound checkbox as the pane has it: Zotero's binding writes the pref on `command`, before or after our listener. */
function fakeCheckbox(pref: string, prefs: PrefsBackend, bindingFirst: boolean) {
  const listeners: Array<() => void> = [];
  const box = {
    checked: false,
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'command') listeners.push(fn);
    },
    /** The user clicks: the checkbox flips, then the listeners run — Zotero's binding among them. */
    click() {
      box.checked = !box.checked;
      const binding = () => prefs.set(pref, box.checked);
      const all = bindingFirst ? [binding, ...listeners] : [...listeners, binding];
      for (const fn of all) fn();
    },
  };
  return box;
}

function setup(reading: string[], bindingFirst = true) {
  const prefs = fakePrefs();
  const boxes = new Map<string, ReturnType<typeof fakeCheckbox>>();
  for (const id of ['openai', 'azure', 'local']) {
    const pref = `${PREF_PREFIX}${id}.enabled`;
    boxes.set(pref, fakeCheckbox(pref, prefs, bindingFirst));
  }
  const doc = {
    querySelector: (selector: string) => {
      const m = /preference="([^"]+)"/.exec(selector);
      return (m && boxes.get(m[1])) ?? null;
    },
  };
  const warn = vi.fn<(message: string) => void>();
  guardProviderSwitches(doc, { prefs, readingTabs: () => reading, warn });
  return { prefs, warn, box: (id: string) => boxes.get(`${PREF_PREFIX}${id}.enabled`)! };
}

describe('readingTabsMessage', () => {
  it('names the tabs and says what to do', () => {
    const message = readingTabsMessage(['Deep learning', 'Another paper']);
    expect(message).toContain('Read Aloud is open in 2 tabs');
    expect(message).toContain('  • Deep learning');
    expect(message).toContain('  • Another paper');
    expect(message).toContain('Close those tabs (or stop Read Aloud in them), then add the voice again.');
  });

  it('speaks of one tab in the singular', () => {
    const message = readingTabsMessage(['Deep learning']);
    expect(message).toContain('Read Aloud is open in a tab');
    expect(message).toContain('Close that tab (or stop Read Aloud in it), then add the voice again.');
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

describe('guardProviderSwitches', () => {
  it('refuses switching a provider on while a tab is reading: the pref and the checkbox go back to off, and the user is told', () => {
    const t = setup(['Deep learning']);
    t.box('azure').click();
    expect(t.box('azure').checked).toBe(false);
    expect(t.prefs.store[`${PREF_PREFIX}azure.enabled`]).toBe(false);
    expect(t.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
  });

  // Zotero's binding may run after this listener: the checkbox is put back
  // before it reads the state, so it writes off as well
  it('holds whichever order Zotero’s binding runs in', () => {
    const t = setup(['Deep learning'], false);
    t.box('local').click();
    expect(t.box('local').checked).toBe(false);
    expect(t.prefs.store[`${PREF_PREFIX}local.enabled`]).toBe(false);
  });

  it('lets a provider be switched on while nothing is reading', () => {
    const t = setup([]);
    t.box('openai').click();
    expect(t.box('openai').checked).toBe(true);
    expect(t.prefs.store[`${PREF_PREFIX}openai.enabled`]).toBe(true);
    expect(t.warn).not.toHaveBeenCalled();
  });

  it('never refuses switching a provider off', () => {
    const t = setup(['Deep learning']);
    t.box('azure').checked = true;
    t.box('azure').click();
    expect(t.box('azure').checked).toBe(false);
    expect(t.prefs.store[`${PREF_PREFIX}azure.enabled`]).toBe(false);
    expect(t.warn).not.toHaveBeenCalled();
  });

  it('tolerates a pane without the checkboxes', () => {
    expect(() => guardProviderSwitches({ querySelector: () => null }, { prefs: fakePrefs(), readingTabs: () => [], warn: vi.fn() })).not.toThrow();
  });
});
