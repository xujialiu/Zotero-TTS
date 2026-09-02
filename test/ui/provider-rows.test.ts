import { describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '../../src/core/providers/types';
import { PREF_PREFIX, PROVIDER_IDS, type PrefsBackend } from '../../src/core/settings';
import { initProviderRows, providerRowIds, type CheckOutcome } from '../../src/ui/provider-rows';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

class FakeElement {
  disabled = false;
  /** A password input's, as Gecko exposes it; a menulist has neither. */
  type?: string;
  revealPassword?: boolean;
  attrs = new Map<string, string>();
  /** A description's text: the message line is one (issue #31). */
  textContent = '';
  listeners = new Map<string, Array<() => unknown>>();
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  addEventListener(type: string, fn: () => unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  /** Fires the listeners; settles once every async one has. */
  fire(type: string) {
    return Promise.all((this.listeners.get(type) ?? []).map((fn) => fn()));
  }
}

/** A provider's groupbox: the fields the lock reaches. */
class FakeSection {
  constructor(public fields: FakeElement[]) {}
  querySelectorAll(_selector: string) {
    return this.fields;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const enabledPref = (id: ProviderId) => `${PREF_PREFIX}${id}.enabled`;
const CONNECTED: CheckOutcome = { ok: true, message: 'Connected. 3 voices available.' };
const REFUSED: CheckOutcome = { ok: false, message: 'The server rejected the API key.' };

function setup(options: { prefs?: Record<string, unknown>; reading?: string[]; check?: (id: ProviderId) => Promise<CheckOutcome> } = {}) {
  const els = new Map<string, FakeElement>();
  const sections = new Map<string, FakeSection>();
  for (const id of PROVIDER_IDS) {
    const ids = providerRowIds(id);
    els.set(ids.toggle, new FakeElement());
    els.set(ids.test, new FakeElement());
    els.set(ids.result, new FakeElement());
    const secret = new FakeElement();
    secret.type = 'password';
    secret.revealPassword = false;
    sections.set(ids.section, new FakeSection([new FakeElement(), secret]));
  }
  const doc = { getElementById: (id: string) => els.get(id) ?? sections.get(id) ?? null };
  const prefs = fakePrefs(options.prefs);
  const check = vi.fn(options.check ?? (async (_id: ProviderId) => CONNECTED));
  const onVoicesChanged = vi.fn();
  const onUnlocked = vi.fn((_id: ProviderId) => {});
  const warn = vi.fn((_message: string) => {});
  const rows = initProviderRows(doc, { prefs, check, onVoicesChanged, onUnlocked, readingTabs: () => options.reading ?? [], warn });
  const of = (id: ProviderId) => {
    const ids = providerRowIds(id);
    return {
      toggle: els.get(ids.toggle)!,
      test: els.get(ids.test)!,
      label: () => els.get(ids.toggle)!.attrs.get('label'),
      result: () => els.get(ids.result)!.textContent,
      /** The fields' disabled flags: all true while the provider is on. */
      locked: () => sections.get(ids.section)!.fields.map((f) => f.disabled),
      /** The section's masked field, revealed or not. */
      secret: () => sections.get(ids.section)!.fields.find((f) => f.type === 'password')!,
      enabled: () => prefs.store[enabledPref(id)],
    };
  };
  return { prefs, rows, check, onVoicesChanged, onUnlocked, warn, of };
}

describe('initProviderRows', () => {
  it('paints every switch from its pref on load: off is "Enable" with the fields open, on is "Disable" with them locked', () => {
    const t = setup({ prefs: { [enabledPref('azure')]: true } });
    expect(t.of('openai').label()).toBe('Enable');
    expect(t.of('openai').locked()).toEqual([false, false]);
    expect(t.of('azure').label()).toBe('Disable');
    expect(t.of('azure').locked()).toEqual([true, true]);
    expect(t.of('local').label()).toBe('Enable');
    // Painting open fields hands them back to the preset rows, which gray out theirs
    expect(t.onUnlocked.mock.calls.map(([id]) => id)).toEqual(['openai', 'local', 'system']);
    expect(t.check).not.toHaveBeenCalled();
    expect(t.onVoicesChanged).not.toHaveBeenCalled();
  });

  it('enabling runs the check, and switches on only once it passes: the pref, the label, the lock, and the voices listed again', async () => {
    const pending = deferred<CheckOutcome>();
    const t = setup({ check: () => pending.promise });
    const azure = t.of('azure');
    const clicked = azure.toggle.fire('command');
    expect(t.check).toHaveBeenCalledWith('azure');
    // While the check runs: no pref yet, both buttons held, the line says so
    expect(azure.enabled()).toBeUndefined();
    expect(azure.label()).toBe('Checking…');
    expect(azure.toggle.disabled).toBe(true);
    expect(azure.test.disabled).toBe(true);
    expect(azure.result()).toBe('Checking…');
    pending.resolve(CONNECTED);
    await clicked;
    expect(azure.enabled()).toBe(true);
    expect(azure.label()).toBe('Disable');
    expect(azure.toggle.disabled).toBe(false);
    expect(azure.test.disabled).toBe(false);
    expect(azure.locked()).toEqual([true, true]);
    expect(azure.result()).toBe('Connected. 3 voices available.');
    expect(t.onVoicesChanged).toHaveBeenCalledTimes(1);
  });

  it('a failed check leaves the provider off, with the message where Test connection writes its own', async () => {
    const t = setup({ check: async () => REFUSED });
    const azure = t.of('azure');
    await azure.toggle.fire('command');
    expect(azure.enabled()).toBeUndefined();
    expect(azure.label()).toBe('Enable');
    expect(azure.locked()).toEqual([false, false]);
    expect(azure.result()).toBe('The server rejected the API key.');
    expect(t.onVoicesChanged).not.toHaveBeenCalled();
  });

  it('a check that throws reads as a failure, never as an unhandled rejection', async () => {
    const t = setup({ check: async () => Promise.reject(new Error('no such provider')) });
    const local = t.of('local');
    await local.toggle.fire('command');
    expect(local.enabled()).toBeUndefined();
    expect(local.label()).toBe('Enable');
    expect(local.result()).toBe('Connection failed: no such provider');
  });

  it('refuses to enable while a tab is reading, before any check: the user is told where', async () => {
    const t = setup({ reading: ['Deep learning'] });
    await t.of('openai').toggle.fire('command');
    expect(t.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
    expect(t.check).not.toHaveBeenCalled();
    expect(t.of('openai').enabled()).toBeUndefined();
    expect(t.of('openai').label()).toBe('Enable');
  });

  it('disabling switches off at once, unlocks the fields, clears the line, and lists the voices again', async () => {
    const t = setup({ prefs: { [enabledPref('openai')]: true } });
    const openai = t.of('openai');
    expect(openai.locked()).toEqual([true, true]);
    await openai.test.fire('command');
    expect(openai.result()).toBe('Connected. 3 voices available.');
    t.onUnlocked.mockClear();
    t.onVoicesChanged.mockClear();
    await openai.toggle.fire('command');
    expect(openai.enabled()).toBe(false);
    expect(openai.label()).toBe('Enable');
    expect(openai.locked()).toEqual([false, false]);
    // The last check's outcome no longer holds
    expect(openai.result()).toBe('');
    expect(t.onUnlocked).toHaveBeenCalledWith('openai');
    expect(t.onVoicesChanged).toHaveBeenCalledTimes(1);
    expect(t.check).toHaveBeenCalledTimes(1);
    expect(t.warn).not.toHaveBeenCalled();
  });

  // Its voices stop being published: an open player keeps listing them and
  // the next one to open does not, which is the divergence issue #11 is about
  it('refuses to disable while a tab is reading: the provider stays on and the fields stay locked', async () => {
    const t = setup({ prefs: { [enabledPref('openai')]: true }, reading: ['Deep learning'] });
    const openai = t.of('openai');
    await openai.toggle.fire('command');
    expect(t.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
    expect(openai.enabled()).toBe(true);
    expect(openai.label()).toBe('Disable');
    expect(openai.locked()).toEqual([true, true]);
    expect(t.onVoicesChanged).not.toHaveBeenCalled();
  });

  // The check may take a quarter of a minute; a player opened meanwhile
  // would be listing voices the pref is about to contradict
  it('checks again after the connection check, and refuses the write if a tab started reading meanwhile', async () => {
    const pending = deferred<CheckOutcome>();
    const reading: string[] = [];
    const t = setup({ check: () => pending.promise, reading });
    const azure = t.of('azure');
    const clicked = azure.toggle.fire('command');
    expect(t.check).toHaveBeenCalledWith('azure');
    reading.push('Deep learning');
    pending.resolve(CONNECTED);
    await clicked;
    expect(t.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
    expect(azure.enabled()).toBeUndefined();
    expect(azure.label()).toBe('Enable');
    expect(azure.locked()).toEqual([false, false]);
    expect(azure.result()).toBe('');
    expect(t.onVoicesChanged).not.toHaveBeenCalled();
    // The buttons are handed back: the retry costs one more check, no reload
    expect(azure.toggle.disabled).toBe(false);
    expect(azure.test.disabled).toBe(false);
  });

  it('Test connection probes without switching anything, and lists the voices again only for a provider that is on', async () => {
    const t = setup({ prefs: { [enabledPref('azure')]: true } });
    // Off: the outcome is shown, the pref and the fields stay as they are
    await t.of('openai').test.fire('command');
    expect(t.of('openai').result()).toBe('Connected. 3 voices available.');
    expect(t.of('openai').enabled()).toBeUndefined();
    expect(t.of('openai').label()).toBe('Enable');
    expect(t.onVoicesChanged).not.toHaveBeenCalled();
    // On: the server may have come back, so the browser lists again
    await t.of('azure').test.fire('command');
    expect(t.of('azure').label()).toBe('Disable');
    expect(t.of('azure').locked()).toEqual([true, true]);
    expect(t.onVoicesChanged).toHaveBeenCalledTimes(1);
  });

  it('Test connection failing on a provider that is on shows the message and lists nothing again', async () => {
    const t = setup({ prefs: { [enabledPref('local')]: true }, check: async () => REFUSED });
    await t.of('local').test.fire('command');
    expect(t.of('local').result()).toBe('The server rejected the API key.');
    expect(t.of('local').enabled()).toBe(true);
    expect(t.onVoicesChanged).not.toHaveBeenCalled();
  });

  it('holds both buttons while a check runs, and ignores clicks meanwhile', async () => {
    const pending = deferred<CheckOutcome>();
    const t = setup({ check: () => pending.promise });
    const local = t.of('local');
    const testing = local.test.fire('command');
    expect(local.result()).toBe('Testing…');
    expect(local.toggle.disabled).toBe(true);
    await local.toggle.fire('command');
    await local.test.fire('command');
    expect(t.check).toHaveBeenCalledTimes(1);
    pending.resolve(CONNECTED);
    await testing;
    expect(local.toggle.disabled).toBe(false);
    expect(local.test.disabled).toBe(false);
    expect(local.label()).toBe('Enable');
  });

  it('refresh repaints from the prefs, as after a settings restore', () => {
    const t = setup();
    t.prefs.set(enabledPref('local'), true);
    t.rows.refresh();
    expect(t.of('local').label()).toBe('Disable');
    expect(t.of('local').locked()).toEqual([true, true]);
    expect(t.of('openai').label()).toBe('Enable');
    expect(t.onVoicesChanged).not.toHaveBeenCalled();
  });

  // A masked field the user revealed with its own reveal button stays
  // revealed once the section is locked, and that button is inert on a
  // disabled input — so nothing could put it back. Enabling hides it (issue #19).
  it('hides a revealed secret when the section locks', async () => {
    const t = setup();
    const secret = t.of('local').secret();
    secret.revealPassword = true;
    await t.of('local').toggle.fire('command');
    expect(t.of('local').enabled()).toBe(true);
    expect(secret.disabled).toBe(true);
    expect(secret.revealPassword).toBe(false);
  });

  it('hides it on refresh too, as after a settings restore turns a provider on', () => {
    const t = setup();
    const secret = t.of('local').secret();
    secret.revealPassword = true;
    t.prefs.set(enabledPref('local'), true);
    t.rows.refresh();
    expect(secret.revealPassword).toBe(false);
  });

  // Unlocked is the state you are in because you are editing the field:
  // its own reveal button works there, and nothing here interferes
  it('leaves a revealed secret alone while the section is unlocked', async () => {
    const t = setup({ prefs: { [enabledPref('local')]: true } });
    const secret = t.of('local').secret();
    await t.of('local').toggle.fire('command');
    expect(t.of('local').enabled()).toBe(false);
    secret.revealPassword = true;
    t.rows.refresh();
    expect(secret.revealPassword).toBe(true);
  });

  // A restore writes the four switches straight to the prefs, so an enabled
  // provider can carry settings that were never checked on this machine
  // (issue #21). verifyEnabled is the commit point Enable would have been.
  describe('verifyEnabled, after a settings restore', () => {
    it('checks every provider the restored prefs turn on, and no others', async () => {
      const t = setup({ prefs: { [enabledPref('openai')]: true, [enabledPref('azure')]: true } });
      await t.rows.verifyEnabled();
      expect(t.check.mock.calls.map(([id]) => id).sort()).toEqual(['azure', 'openai']);
    });

    it('switches off a provider whose check fails, with the failure beside it', async () => {
      const t = setup({ prefs: { [enabledPref('azure')]: true }, check: async () => REFUSED });
      await t.rows.verifyEnabled();
      expect(t.of('azure').enabled()).toBe(false);
      expect(t.of('azure').label()).toBe('Enable');
      expect(t.of('azure').locked()).toEqual([false, false]);
      expect(t.of('azure').result()).toBe(REFUSED.message);
    });

    it('leaves a provider whose check passes on, with its message', async () => {
      const t = setup({ prefs: { [enabledPref('local')]: true } });
      await t.rows.verifyEnabled();
      expect(t.of('local').enabled()).toBe(true);
      expect(t.of('local').label()).toBe('Disable');
      expect(t.of('local').locked()).toEqual([true, true]);
      expect(t.of('local').result()).toBe(CONNECTED.message);
    });

    it('says which providers it turned off, and says so when none needed it', async () => {
      const bad = setup({ prefs: { [enabledPref('azure')]: true, [enabledPref('local')]: true }, check: async () => REFUSED });
      const said = await bad.rows.verifyEnabled();
      expect(said).toContain('azure');
      expect(said).toContain('local');
      expect(said).toMatch(/turned off/i);
      const good = setup({ prefs: { [enabledPref('local')]: true } });
      expect(await good.rows.verifyEnabled()).not.toMatch(/turned off/i);
      const none = setup();
      expect(await none.rows.verifyEnabled()).toBe('');
    });

    // A check that throws is a failed check, never an unhandled rejection
    it('treats a check that throws as a failure', async () => {
      const t = setup({
        prefs: { [enabledPref('azure')]: true },
        check: async () => {
          throw new Error('boom');
        },
      });
      await t.rows.verifyEnabled();
      expect(t.of('azure').enabled()).toBe(false);
      expect(t.of('azure').result()).toContain('boom');
    });

    it('lists the voices again only when a switch actually moved', async () => {
      const off = setup({ prefs: { [enabledPref('azure')]: true }, check: async () => REFUSED });
      await off.rows.verifyEnabled();
      expect(off.onVoicesChanged).toHaveBeenCalledTimes(1);
      const kept = setup({ prefs: { [enabledPref('azure')]: true } });
      await kept.rows.verifyEnabled();
      expect(kept.onVoicesChanged).not.toHaveBeenCalled();
    });

    it('holds the buttons while it runs and releases them after', async () => {
      const gate = deferred<CheckOutcome>();
      const t = setup({ prefs: { [enabledPref('azure')]: true }, check: () => gate.promise });
      const done = t.rows.verifyEnabled();
      expect(t.of('azure').toggle.disabled).toBe(true);
      expect(t.of('azure').test.disabled).toBe(true);
      expect(t.of('azure').result()).toBe('Checking…');
      gate.resolve(CONNECTED);
      await done;
      expect(t.of('azure').toggle.disabled).toBe(false);
      expect(t.of('azure').test.disabled).toBe(false);
    });

    it('leaves a section whose own check is already running alone', async () => {
      const gate = deferred<CheckOutcome>();
      const t = setup({ prefs: { [enabledPref('azure')]: true }, check: () => gate.promise });
      const testing = t.of('azure').test.fire('command');
      await t.rows.verifyEnabled();
      expect(t.check).toHaveBeenCalledTimes(1);
      gate.resolve(CONNECTED);
      await testing;
    });
  });

  it('tolerates a pane without the sections', () => {
    const doc = { getElementById: () => null };
    const deps = { prefs: fakePrefs(), check: vi.fn(async () => CONNECTED), onVoicesChanged: vi.fn(), readingTabs: () => [], warn: vi.fn() };
    expect(() => initProviderRows(doc, deps).refresh()).not.toThrow();
  });
});
