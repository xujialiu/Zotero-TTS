/**
 * The seam between the system provider and the platform that synthesizes
 * for it (issue #23). The provider (index.ts) knows only this shape; what
 * stands behind it is one of two things:
 *
 * - **Windows**: the long-lived PowerShell helper (daemon.ts) — one process
 *   per session, a serial queue, a restart budget, word marks from both
 *   speech APIs.
 * - **macOS**: a process per request (mac.ts) — `say` writes the WAV,
 *   `osascript` lists the voices — with nothing to keep alive and no
 *   protocol, and no word marks: the word range only ever reaches a
 *   delegate `say` does not expose, so these voices highlight by sentence,
 *   which is exactly what Zotero's own path gives them.
 *
 * Linux has neither, and the provider says so from every call.
 */

import type { SystemRequestBody, SystemResponse } from './protocol';

export interface SpeechBackend {
  /** Whose engines answer: names the platform in messages and the diagnostics. */
  readonly platform: 'win' | 'mac';
  /**
   * Whether `speak` answers with word marks. Without them the provider
   * declares sentence-level highlighting, hands the audio over with a note,
   * and the settings pane says so instead of probing for marks.
   */
  readonly wordTimestamps: boolean;
  /** Sends one request, starting whatever it needs. Rejects with a SynthesisError. */
  send(request: SystemRequestBody): Promise<SystemResponse>;
  /** Kills whatever is running; the next `send` starts afresh. */
  stop(): void;
  /** Forgets a spent start budget or a last error, so a fixed environment can be tried again without restarting Zotero. */
  reset(): void;
  /** Plain data for the diagnostics: what is up, what has been done, and why it last failed. */
  state(): Record<string, unknown>;
}
