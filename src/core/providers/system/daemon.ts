/**
 * The client for the speech daemon: one long-lived helper process for the
 * whole Zotero session, started at the first request and killed at plugin
 * shutdown (nothing reaps it for us).
 *
 * Everything Zotero-flavored is injected — spawning, the clock, the log — so
 * the whole lifecycle is exercised against a fake process in the tests: the
 * handshake, the serial queue, a request that times out, a daemon that dies
 * mid-session, one that will not start at all.
 *
 * Three rules it exists to keep:
 *
 * - **Serial.** The daemon is one PowerShell runspace and answers one
 *   request at a time; a second frame written while the first is being
 *   spoken would sit in the pipe anyway. So requests queue here, where the
 *   waiting is visible, instead of in a pipe where it is not. Warm
 *   round trips are 10–100 ms (measured), well inside the prefetch horizon.
 * - **Never hang.** Every request is bounded (core/timeout.ts). A daemon
 *   that misses its deadline is not merely slow — the protocol is
 *   lock-step, so a missing reply desynchronizes every later one — and it
 *   is killed, not waited for.
 * - **Restart once, then stay down.** A process that dies is restarted for
 *   the next request, but a daemon that dies repeatedly is a broken
 *   environment (PowerShell in ConstrainedLanguage, AppLocker, a killed
 *   host), and retrying it forever would spawn a process per sentence. After
 *   `MAX_STARTS` failures the provider reports the last error and stops
 *   trying until something calls `reset` — which the settings pane's Test
 *   connection does.
 */

import { SynthesisError } from '../errors';
import { withTimeout } from '../../timeout';
import { decodeFrameBody, decodeFrameLength, encodeFrame, type SystemRequestBody, type SystemResponse } from './protocol';

/**
 * One running helper process. `read` resolves with exactly `length` bytes,
 * or rejects once the process has closed its output — which is what
 * `Subprocess`'s own pipe does (`ERROR_END_OF_FILE`), so the Zotero side of
 * this is a thin wrapper.
 */
export interface DaemonProcess {
  write(bytes: Uint8Array): Promise<unknown>;
  read(length: number): Promise<Uint8Array>;
  kill(): void;
}

export interface DaemonDeps {
  /** Starts the helper. Rejects when the platform has none, or when the host refuses to run it. */
  spawn(): Promise<DaemonProcess>;
  /** How long any one request, the handshake included, may take. */
  timeoutMs: number;
  /** Ring for the debug output; one line per start, stop and failure. */
  debug?(message: string): void;
  log?(e: unknown): void;
}

/** How many times a session will start the helper before giving up on it. */
export const MAX_STARTS = 3;

export interface Daemon {
  /** Sends one request, starting the helper if needed. Rejects with a SynthesisError. */
  send(request: SystemRequestBody): Promise<SystemResponse>;
  /** Kills the helper and empties the queue; the next `send` starts a new one. */
  stop(): void;
  /** Forgets a spent start budget, so a fixed environment can be tried again without restarting Zotero. */
  reset(): void;
  /** Plain data for the diagnostics: whether it is up, what it has done, and why it last stopped. */
  state(): { running: boolean; starts: number; sent: number; queued: number; lastError: string | null };
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function createDaemon(deps: DaemonDeps): Daemon {
  let process: DaemonProcess | null = null;
  /** The tail of the serial queue: every send chains onto it, so one request is in flight at a time. */
  let queue: Promise<unknown> = Promise.resolve();
  let queued = 0;
  let starts = 0;
  let sent = 0;
  let nextId = 1;
  let lastError: string | null = null;

  /** Drops the process without waiting for it; the next request starts a fresh one. */
  function discard(why: string): void {
    if (!process) return;
    const dying = process;
    process = null;
    deps.debug?.(`speech daemon stopped: ${why}`);
    try {
      dying.kill();
    } catch (e) {
      deps.log?.(e);
    }
  }

  async function readFrame(proc: DaemonProcess): Promise<SystemResponse> {
    const length = decodeFrameLength(await proc.read(4));
    return decodeFrameBody(await proc.read(length));
  }

  /** A started helper that has already announced itself, or a rejection saying why there is none. */
  async function ensureProcess(): Promise<DaemonProcess> {
    if (process) return process;
    if (starts >= MAX_STARTS) {
      throw new SynthesisError('local-server-down', `The Windows speech helper failed to start ${starts} times: ${lastError ?? 'unknown error'}`);
    }
    starts += 1;
    let started: DaemonProcess;
    try {
      started = await deps.spawn();
    } catch (e) {
      lastError = message(e);
      throw new SynthesisError('local-server-down', `Cannot start the Windows speech helper: ${lastError}`);
    }
    try {
      // The unprompted ready frame. Until it arrives the helper may still be
      // loading System.Speech; measured at ~285 ms cold, and a host that
      // never gets there (no PowerShell, a policy that blocks it) fails here
      // rather than on the first sentence.
      const hello = await withTimeout(
        readFrame(started),
        deps.timeoutMs,
        () => new SynthesisError('network', `The Windows speech helper did not start within ${Math.round(deps.timeoutMs / 1000)} s`),
        () => started.kill(),
      );
      if (!hello.ready) throw new Error(`the helper's first message was not its handshake: ${JSON.stringify(hello)}`);
    } catch (e) {
      lastError = message(e);
      try {
        started.kill();
      } catch {
        // Already gone; the rejection below is what matters
      }
      throw e instanceof SynthesisError ? e : new SynthesisError('local-server-down', `The Windows speech helper failed to start: ${lastError}`);
    }
    process = started;
    deps.debug?.(`speech daemon started (attempt ${starts})`);
    return started;
  }

  async function exchange(request: SystemRequestBody): Promise<SystemResponse> {
    const proc = await ensureProcess();
    const id = nextId++;
    let response: SystemResponse;
    try {
      await proc.write(encodeFrame({ ...request, id }));
      response = await withTimeout(
        readFrame(proc),
        deps.timeoutMs,
        () => new SynthesisError('network', `The Windows speech helper did not answer within ${Math.round(deps.timeoutMs / 1000)} s`),
        // Lock-step: a late reply would be read as the next request's, so
        // the process goes rather than the stream being left out of step
        () => discard('a request timed out'),
      );
      if (response.id !== id) throw new Error(`the helper answered request ${response.id} while ${id} was in flight`);
    } catch (e) {
      // The pipe or the protocol broke — a dead process, a desynchronized
      // stream, a deadline missed. None of that is recoverable in place, so
      // the helper goes and the next request starts a fresh one.
      lastError = message(e);
      discard(lastError);
      throw e instanceof SynthesisError ? e : new SynthesisError('unknown', `The Windows speech helper failed: ${lastError}`);
    }
    sent += 1;
    // An error the helper itself reported is the one failure the process
    // survives: it answered in step and is ready for the next request.
    if (!response.ok) {
      lastError = response.error || 'the Windows speech helper reported an error';
      throw new SynthesisError('unknown', lastError);
    }
    return response;
  }

  function send(request: SystemRequestBody): Promise<SystemResponse> {
    queued += 1;
    // Chain onto the tail whether it settled or threw, so one failed request
    // never wedges the queue behind it
    const result = queue.then(
      () => exchange(request),
      () => exchange(request),
    );
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      queued -= 1;
    });
  }

  return {
    send,
    stop: () => {
      discard('the plugin is shutting down');
      queue = Promise.resolve();
    },
    reset: () => {
      starts = 0;
      lastError = null;
    },
    state: () => ({ running: !!process, starts, sent, queued, lastError }),
  };
}
