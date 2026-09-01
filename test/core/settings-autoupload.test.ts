import { describe, expect, it, vi } from 'vitest';
import {
  AUTO_UPLOAD_DEBOUNCE_MS,
  AUTO_UPLOAD_RETRY_MS,
  createSettingsAutoUpload,
  type SettingsAutoUploadDeps,
} from '../../src/core/settings-autoupload';
import { WebDAVError } from '../../src/core/webdav';

function harness(over: Partial<SettingsAutoUploadDeps> = {}) {
  let clock = 0;
  const timers: { fn: () => void; at: number; handle: number }[] = [];
  let nextHandle = 1;
  const errors: unknown[] = [];
  const observers = new Map<string, () => void>();
  const unregistered: unknown[] = [];
  let enabled = true;
  /** What the next uploads do; empty means succeed. */
  const failures: unknown[] = [];
  const upload = vi.fn(async () => {
    const failure = failures.shift();
    if (failure) throw failure;
    return { name: 'zotero-tts-settings_office-pc.json', count: 46 };
  });

  const deps: SettingsAutoUploadDeps = {
    enabled: () => enabled,
    keys: ['zotero-tts.openai.apiKey', 'zotero-tts.prefetch'],
    registerObserver: (name, handler) => {
      observers.set(name, handler);
      return name;
    },
    unregisterObserver: (token) => void unregistered.push(token),
    upload,
    setTimeout: (fn, ms) => {
      const handle = nextHandle++;
      timers.push({ fn, at: clock + ms, handle });
      return handle;
    },
    clearTimeout: (handle) => {
      const i = timers.findIndex((t) => t.handle === handle);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => clock,
    error: (e) => void errors.push(e),
    debug: () => {},
    ...over,
  };

  const auto = createSettingsAutoUpload(deps);

  /** Advance the clock, firing every timer that comes due, and let the async runs settle. */
  const advance = async (ms: number) => {
    const target = clock + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      clock = due.at;
      due.fn();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    clock = target;
  };

  return {
    auto,
    upload,
    errors,
    observers,
    unregistered,
    timers,
    advance,
    fail: (e: unknown) => failures.push(e),
    setEnabled: (v: boolean) => (enabled = v),
  };
}

describe('createSettingsAutoUpload', () => {
  it('start() watches every key, and a pref change uploads after the quiet period', async () => {
    const h = harness();
    h.auto.start();
    expect(h.observers.size).toBe(2);
    h.observers.get('zotero-tts.openai.apiKey')!();
    expect(h.upload).not.toHaveBeenCalled();
    await h.advance(AUTO_UPLOAD_DEBOUNCE_MS);
    expect(h.upload).toHaveBeenCalledOnce();
    expect(h.auto.stats()).toMatchObject({ uploads: 1, lastOutcome: 'ok', pending: false, lastName: 'zotero-tts-settings_office-pc.json', lastCount: 46 });
  });

  it('a burst of changes becomes one upload, the quiet period restarting each time', async () => {
    const h = harness();
    h.auto.start();
    for (let i = 0; i < 5; i++) {
      h.observers.get('zotero-tts.prefetch')!();
      await h.advance(AUTO_UPLOAD_DEBOUNCE_MS / 2);
    }
    expect(h.upload).not.toHaveBeenCalled(); // never a full quiet period yet
    await h.advance(AUTO_UPLOAD_DEBOUNCE_MS);
    expect(h.upload).toHaveBeenCalledOnce();
  });

  it('a change while the switch is off is not queued', async () => {
    const h = harness();
    h.auto.start();
    h.setEnabled(false);
    h.auto.changed();
    await h.advance(AUTO_UPLOAD_DEBOUNCE_MS * 2);
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.auto.stats().pending).toBe(false);
  });

  it('a change queued while on is dropped when the switch goes off before it fires', async () => {
    const h = harness();
    h.auto.start();
    h.auto.changed();
    h.setEnabled(false);
    await h.advance(AUTO_UPLOAD_DEBOUNCE_MS);
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.auto.stats().pending).toBe(false);
  });

  it('a failed upload reports once per window and retries once the window passes', async () => {
    const h = harness();
    h.auto.start();
    h.fail(new WebDAVError('network', 'no reply'));
    h.auto.changed();
    await h.advance(AUTO_UPLOAD_DEBOUNCE_MS);
    expect(h.upload).toHaveBeenCalledOnce();
    expect(h.errors).toHaveLength(1);
    expect(h.auto.stats()).toMatchObject({ lastOutcome: 'error', pending: true });
    // The retry is armed for the window, not the debounce
    await h.advance(AUTO_UPLOAD_RETRY_MS);
    expect(h.upload).toHaveBeenCalledTimes(2);
    expect(h.auto.stats()).toMatchObject({ lastOutcome: 'ok', pending: false });
    expect(h.errors).toHaveLength(1);
  });

  it('an unusable configuration does not retry on a timer — the next change tries again', async () => {
    const h = harness();
    h.auto.start();
    h.fail(new WebDAVError('config', 'Set the WebDAV URL first.'));
    h.auto.changed();
    await h.advance(AUTO_UPLOAD_DEBOUNCE_MS);
    expect(h.errors).toHaveLength(1);
    expect(h.auto.stats()).toMatchObject({ lastOutcome: 'error', pending: false });
    await h.advance(AUTO_UPLOAD_RETRY_MS * 3);
    expect(h.upload).toHaveBeenCalledOnce(); // nothing rearmed
    h.auto.changed();
    await h.advance(AUTO_UPLOAD_DEBOUNCE_MS);
    expect(h.upload).toHaveBeenCalledTimes(2);
  });

  it('flush() uploads what is pending at once, and is a no-op with nothing pending', async () => {
    const h = harness();
    h.auto.start();
    await h.auto.flush();
    expect(h.upload).not.toHaveBeenCalled();
    h.auto.changed();
    await h.auto.flush();
    expect(h.upload).toHaveBeenCalledOnce();
    expect(h.timers).toHaveLength(0); // the debounce timer went with it
  });

  it('stop() unregisters everything and cancels the pending work', async () => {
    const h = harness();
    h.auto.start();
    h.auto.changed();
    h.auto.stop();
    expect(h.unregistered).toEqual(['zotero-tts.openai.apiKey', 'zotero-tts.prefetch']);
    await h.advance(AUTO_UPLOAD_DEBOUNCE_MS * 2);
    expect(h.upload).not.toHaveBeenCalled();
    expect(h.auto.stats().watching).toBe(0);
  });
});
