import { describe, expect, it, vi } from 'vitest';
import { initBracketRows } from '../../src/ui/bracket-rows';
import { PREF_PREFIX } from '../../src/core/settings';

function setup() {
  class Element {
    checked = false; value = ''; disabled = false;
    listeners = new Map<string, () => unknown>();
    addEventListener(name: string, fn: () => unknown) { this.listeners.set(name, fn); }
    removeEventListener(name: string) { this.listeners.delete(name); }
    fire(name: string) { return this.listeners.get(name)?.(); }
  }
  const box = new Element(), input = new Element();
  const store: Record<string, unknown> = {};
  const watchers = new Map<string, () => void>();
  const prefs = { get: (key: string) => store[key], set: (key: string, value: unknown) => {
    store[key] = value; watchers.get(key.replace('extensions.zotero.', ''))?.();
  } };
  const askDefaults = vi.fn(async (_message: string) => false);
  const rows = initBracketRows({ getElementById: id => id === 'ztts-strip-angle-brackets' ? box : input }, {
    prefs, askDefaults, watch: (key, fn) => { watchers.set(key, fn); return () => { watchers.delete(key); }; },
  });
  const toggle = async () => { box.checked = !box.checked; await box.fire('command'); };
  const edit = (value: string) => { input.value = value; input.fire('input'); };
  return { box, input, prefs, rows, askDefaults, toggle, edit, store, watchers };
}

describe('bracket settings row', () => {
  it('defaults on, unlocks for editing, saves a valid list and locks on enable', async () => {
    const s = setup();
    expect(s.box.checked).toBe(true); expect(s.input.disabled).toBe(true);
    expect(s.input.value).toBe('<> []');
    await s.toggle(); s.edit('() 【】');
    expect(s.input.disabled).toBe(false);
    await s.toggle();
    expect(s.store[PREF_PREFIX + 'readAloud.bracketPairs']).toBe('() 【】');
    expect(s.box.checked).toBe(true); expect(s.input.disabled).toBe(true);
    expect(s.askDefaults).not.toHaveBeenCalled();
  });
  it.each(['', '<', '<> <>'])('keeps invalid draft %j on cancel', async value => {
    const s = setup(); await s.toggle(); s.edit(value); await s.toggle();
    expect(s.askDefaults).toHaveBeenCalledOnce();
    expect(s.input.value).toBe(value); expect(s.input.disabled).toBe(false);
    expect(s.box.checked).toBe(false);
    expect(s.store[PREF_PREFIX + 'readAloud.stripAngleBrackets']).toBe(false);
    s.rows.refresh(); expect(s.input.value).toBe(value);
  });
  it('restores defaults and enables only after acceptance', async () => {
    const s = setup(); await s.toggle(); s.edit('bad');
    let resolve!: (answer: boolean) => void;
    s.askDefaults.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = s.toggle();
    expect(s.store[PREF_PREFIX + 'readAloud.stripAngleBrackets']).toBe(false);
    resolve(true); await pending;
    expect(s.input.value).toBe('<> []'); expect(s.input.disabled).toBe(true);
    expect(s.box.checked).toBe(true);
  });
  it('does not overwrite a restore that arrives during an error dialog', async () => {
    const s = setup(); await s.toggle(); s.edit('bad');
    let resolve!: (answer: boolean) => void;
    s.askDefaults.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = s.toggle();
    s.prefs.set(PREF_PREFIX + 'readAloud.bracketPairs', '【】');
    resolve(true); await pending;
    expect(s.input.value).toBe('【】'); expect(s.box.checked).toBe(false);
  });
  it('does not write settings after the pane is disposed during a dialog', async () => {
    const s = setup(); await s.toggle(); s.edit('bad');
    let resolve!: (answer: boolean) => void;
    s.askDefaults.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = s.toggle(); s.rows.dispose(); resolve(true); await pending;
    expect(s.store[PREF_PREFIX + 'readAloud.bracketPairs']).toBe('bad');
    expect(s.store[PREF_PREFIX + 'readAloud.stripAngleBrackets']).toBe(false);
  });
  it('follows external settings writes and disposes observers/listeners', () => {
    const s = setup();
    s.prefs.set(PREF_PREFIX + 'readAloud.stripAngleBrackets', false);
    s.prefs.set(PREF_PREFIX + 'readAloud.bracketPairs', '【】');
    expect(s.input.value).toBe('【】'); expect(s.input.disabled).toBe(false);
    s.rows.dispose(); expect(s.watchers.size).toBe(0);
    expect(s.box.listeners.size).toBe(0); expect(s.input.listeners.size).toBe(0);
  });
});
