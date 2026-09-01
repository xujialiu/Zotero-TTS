import { WebDAVError } from './webdav';

/**
 * Keeps this machine's settings file on the server fresh (#41): observe
 * every settings pref, and a quiet moment after the last change, upload —
 * to this machine's own `zotero-tts-settings_<id>.json`, so no two machines
 * ever contend for a file. Upload only, by design: settings from another
 * machine are never applied by anything but the user's own pull.
 *
 * The module is only the debounce and the gating; what an upload actually
 * is — build the backup, name the file, PUT it — comes in as one injected
 * `upload()`, so this stays pure and the tests drive it with fake timers.
 *
 * Failure behavior follows the transport's (#40): reported once per window,
 * retried once per window — except a `config` failure (no usable URL),
 * which drops the pending work instead of retrying every minute forever;
 * the next actual change tries again. A change while the switch is off is
 * simply not queued: turning the switch on is itself a pref change, so the
 * current settings upload moments later anyway.
 */

/** A change uploads after this much quiet — several fields edited in a row become one upload. */
export const AUTO_UPLOAD_DEBOUNCE_MS = 10_000;

/** A failed upload retries at most once per window, and says so once per window. */
export const AUTO_UPLOAD_RETRY_MS = 60_000;

export interface SettingsAutoUploadDeps {
  /** The webdav.autoUploadSettings switch, read at change and again at fire time. */
  enabled(): boolean;
  /** The pref names to observe, relative to `extensions.zotero.` — every DEFAULTS key. */
  keys: string[];
  registerObserver(name: string, handler: () => void): unknown;
  unregisterObserver(token: unknown): void;
  /** One real upload; resolves with what was written, for the stats. */
  upload(): Promise<{ name: string; count: number }>;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  error(e: unknown): void;
  debug(message: string): void;
}

export interface SettingsAutoUploadStats {
  /** Observers actually registered; below keys.length means some registrations threw. */
  watching: number;
  /** A change is waiting for its quiet moment or its retry window. */
  pending: boolean;
  uploads: number;
  lastOutcome: 'ok' | 'error' | null;
  lastAt: number | null;
  lastError: string | null;
  lastName: string | null;
  lastCount: number | null;
}

export interface SettingsAutoUpload {
  start(): void;
  /** One prod from outside the observed prefs — the machine-id rename (webdav-rows). */
  changed(): void;
  /** Upload whatever is pending, now; a no-op when nothing is. The caller bounds the wait. */
  flush(): Promise<void>;
  /** Unregister and cancel; whatever is still pending is dropped — flush first at shutdown. */
  stop(): void;
  stats(): SettingsAutoUploadStats;
}

export function createSettingsAutoUpload(deps: SettingsAutoUploadDeps): SettingsAutoUpload {
  const tokens: unknown[] = [];
  let pending = false;
  let timer: unknown = null;
  let running: Promise<void> | null = null;
  let uploads = 0;
  let lastOutcome: SettingsAutoUploadStats['lastOutcome'] = null;
  let lastAt: number | null = null;
  let lastError: string | null = null;
  let lastName: string | null = null;
  let lastCount: number | null = null;
  let lastReportAt = Number.NEGATIVE_INFINITY;

  function report(e: unknown): void {
    try {
      deps.error(e);
    } catch {
      // Reporting must never be the thing that throws
    }
  }

  function reportGated(e: unknown): void {
    const at = deps.now();
    if (at - lastReportAt < AUTO_UPLOAD_RETRY_MS) return;
    lastReportAt = at;
    report(e);
  }

  function disarm(): void {
    if (timer === null) return;
    try {
      deps.clearTimeout(timer);
    } catch {
      // A dead timer host at shutdown; nothing left to cancel
    }
    timer = null;
  }

  function arm(ms: number): void {
    disarm();
    try {
      timer = deps.setTimeout(() => {
        timer = null;
        void run();
      }, ms);
    } catch (e) {
      report(e);
    }
  }

  /** Never rejects: outcome and error land in the stats and the gated report. */
  function run(): Promise<void> {
    if (running) return running;
    if (!pending) return Promise.resolve();
    running = (async () => {
      try {
        if (!deps.enabled()) {
          // Switched off while the change waited: the change is not wanted
          pending = false;
          return;
        }
        pending = false;
        try {
          const { name, count } = await deps.upload();
          uploads++;
          lastOutcome = 'ok';
          lastAt = deps.now();
          lastError = null;
          lastName = name;
          lastCount = count;
          deps.debug(`settings auto-upload: ${count} settings to ${name}`);
        } catch (e) {
          lastOutcome = 'error';
          lastAt = deps.now();
          lastError = String(e);
          reportGated(e);
          // An unusable configuration retries on the next change, not on a
          // timer — otherwise a blank URL logs an error a minute forever
          if (!(e instanceof WebDAVError && e.kind === 'config')) {
            pending = true;
            arm(AUTO_UPLOAD_RETRY_MS);
          }
        }
      } finally {
        running = null;
      }
    })();
    return running;
  }

  function changed(): void {
    if (!deps.enabled()) return;
    pending = true;
    arm(AUTO_UPLOAD_DEBOUNCE_MS);
  }

  return {
    start: () => {
      for (const name of deps.keys) {
        try {
          tokens.push(deps.registerObserver(name, changed));
        } catch (e) {
          report(e);
        }
      }
    },
    changed,
    flush: async () => {
      disarm();
      if (running) await running;
      await run();
    },
    stop: () => {
      disarm();
      pending = false;
      for (const token of tokens) {
        try {
          deps.unregisterObserver(token);
        } catch {
          // Already gone at shutdown
        }
      }
      tokens.length = 0;
    },
    stats: () => ({
      watching: tokens.length,
      pending,
      uploads,
      lastOutcome,
      lastAt,
      lastError,
      lastName,
      lastCount,
    }),
  };
}
