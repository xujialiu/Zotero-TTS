/**
 * The macOS backend: the operating system's voices through the two binaries
 * every Mac has, no compiler and no bundled executable (issue #23).
 *
 * - **The list** comes from `NSSpeechSynthesizer.availableVoices` through
 *   `/usr/bin/osascript -l JavaScript`, which is exactly what Gecko
 *   publishes — 191 for 191 on this Mac, measured 2026-08-31 and again
 *   2026-09-06 — where `AVSpeechSynthesisVoice` is not (it carries
 *   `super-compact` ids Gecko never shows). `attributesForVoice` gives the
 *   display name and the BCP-47 tag Gecko shows, including where they
 *   diverge from the identifier (`…kn-IN.Alpana` is "Soumya").
 * - **The audio** comes from `/usr/bin/say --file-format=WAVE
 *   --data-format=LEI16@22050 -o <file>`: 22050 Hz mono 16-bit, the shape
 *   the plugin already feeds Zotero. One process per sentence, 0.3–0.6 s
 *   at sentence length (4–20× real time, almost all of it startup), so
 *   nothing is kept alive and nothing is queued: `say` processes run side
 *   by side when prefetch asks for several.
 * - **No word marks.** The word range is delivered only through a delegate
 *   (`willSpeakRangeOfSpeechString`, `willSpeakWord`), passed by value,
 *   which JXA cannot implement and `say` does not expose. The provider
 *   highlights by sentence for these voices.
 *
 * **An unknown identifier is refused before `say` runs.** `say -v` with a
 * voice that does not exist exits 0, writes nothing to stderr, and produces
 * Samantha's audio byte for byte — not even the system default's (measured
 * 2026-09-06, from inside Zotero) — so the process gives no signal at all,
 * and the user would hear a different voice without a word. So every id is
 * checked against the enumerated set, re-listing once for one not seen (a
 * voice installed since), and refused with an error otherwise.
 *
 * Voice ids are `osx/<identifier>`: `osx/com.apple.voice.compact.en-US.Samantha`.
 * Same shape as `sapi5/` and `onecore/`, ASCII, stable across display
 * languages, and the exact tail of Gecko's own `urn:moz-tts:osx:<identifier>`
 * (voices.ts maps back to it, with no `?<lang>` suffix — Gecko's macOS
 * backend appends none).
 *
 * The text goes after `--`, so a sentence starting with a dash is not read
 * as a flag; `Subprocess` passes argv verbatim, so there is no shell
 * quoting. Stdin gives byte-identical output and buys nothing.
 */

import { SynthesisError } from '../errors';
import { withTimeout } from '../../timeout';
import type { SpeechBackend } from './backend';
import { OSX_ID_PREFIX, type SystemRequestBody, type SystemResponse, type SystemVoiceRecord } from './protocol';

/** Absolute paths, as the Windows helper's: macOS does hand Zotero a PATH (measured 2026-09-06), but a fixed path needs no search and cannot be shadowed. */
export const MAC_OSASCRIPT = '/usr/bin/osascript';
export const MAC_SAY = '/usr/bin/say';

/**
 * The listing, as JXA. One object per voice: the identifier, the display
 * name, the BCP-47 `VoiceLanguage` and the `VoiceLocaleIdentifier` (`en_US`;
 * `ar_001` for the Arabic voice, whose language tag is `ar-001`). The
 * result of the last expression is what osascript prints.
 */
export const MAC_VOICES_SCRIPT = [
  "ObjC.import('AppKit');",
  'var ids = $.NSSpeechSynthesizer.availableVoices;',
  'var out = [];',
  'for (var i = 0; i < ids.count; i++) {',
  '  var id = ids.objectAtIndex(i);',
  '  var attrs = $.NSSpeechSynthesizer.attributesForVoice(id);',
  '  var get = function (key) { var v = attrs.objectForKey(key); return v.isNil() ? null : ObjC.unwrap(v); };',
  "  out.push({ id: ObjC.unwrap(id), name: get('VoiceName'), language: get('VoiceLanguage'), locale: get('VoiceLocaleIdentifier') });",
  '}',
  'JSON.stringify(out);',
].join('\n');

export function macVoicesArguments(): string[] {
  return ['-l', 'JavaScript', '-e', MAC_VOICES_SCRIPT];
}

export function macSayArguments(identifier: string, file: string, text: string): string[] {
  return ['-v', identifier, '--file-format=WAVE', '--data-format=LEI16@22050', '-o', file, '--', text];
}

/** The tag the catalog groups on: Gecko's `VoiceLanguage`, else the locale identifier with its underscore turned into a hyphen. */
function languageTag(language: unknown, locale: unknown): string {
  if (typeof language === 'string' && language.trim()) return language.trim();
  if (typeof locale === 'string' && locale.trim()) return locale.trim().replace(/_/g, '-');
  return '';
}

/** What osascript printed, as records; throws when it is not a voice list at all. */
export function parseMacVoices(stdout: string): SystemVoiceRecord[] {
  const text = stdout.trim();
  const refuse = () => new Error(`osascript did not print a voice list: ${text.slice(0, 200) || '(nothing)'}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text || 'null');
  } catch {
    throw refuse();
  }
  if (!Array.isArray(parsed)) throw refuse();
  const out: SystemVoiceRecord[] = [];
  for (const entry of parsed) {
    const v = entry as { id?: unknown; name?: unknown; language?: unknown; locale?: unknown } | null;
    if (!v || typeof v.id !== 'string' || !v.id) continue;
    const name = typeof v.name === 'string' ? v.name : '';
    // desc is what Gecko shows as the voice's name, which on macOS is the name itself
    out.push({ id: OSX_ID_PREFIX + v.id, name, desc: name, lang: languageTag(v.language, v.locale) });
  }
  return out;
}

export type MacExit = { exitCode: number; stdout: string; stderr: string };

/** One running process: what it wrote and how it ended, and the kill the timeout uses. */
export interface MacProcess {
  output: Promise<MacExit>;
  kill(): void;
}

export interface MacBackendDeps {
  /** Starts one process and returns at once; rejects only when it cannot be started at all. */
  run(command: string, args: string[]): Promise<MacProcess>;
  /** How long any one process may take. */
  timeoutMs: number;
  debug?(message: string): void;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function createMacBackend(deps: MacBackendDeps): SpeechBackend {
  /** The identifiers the last listing carried; null until one has run. */
  let known: Set<string> | null = null;
  /** A listing in flight, shared by everything that needs one at that moment. */
  let listing: Promise<SystemVoiceRecord[]> | null = null;
  const running = new Set<MacProcess>();
  let spawned = 0;
  let nextId = 1;
  let lastError: string | null = null;

  /** Runs one process to its end, bounded; a non-zero exit is an error naming what it wrote. */
  async function runToEnd(command: string, args: string[], name: string): Promise<MacExit> {
    let proc: MacProcess;
    try {
      proc = await deps.run(command, args);
    } catch (e) {
      lastError = message(e);
      throw new SynthesisError('local-server-down', `Cannot start ${name}: ${lastError}`);
    }
    spawned += 1;
    running.add(proc);
    try {
      const overran = () => new SynthesisError('network', `${name} did not finish within ${Math.round(deps.timeoutMs / 1000)} s`);
      let timedOut = false;
      const exit = await withTimeout(proc.output, deps.timeoutMs, overran, () => {
        timedOut = true;
        proc.kill();
      });
      // The kill can end the process before the deadline's own rejection
      // lands; the reason is the deadline either way, not the signal
      if (timedOut) throw overran();
      if (exit.exitCode !== 0) {
        const said = exit.stderr.trim();
        throw new SynthesisError('unknown', `${name} exited with ${exit.exitCode}${said ? `: ${said}` : ''}`);
      }
      return exit;
    } catch (e) {
      lastError = message(e);
      throw e instanceof SynthesisError ? e : new SynthesisError('unknown', `${name} failed: ${lastError}`);
    } finally {
      running.delete(proc);
    }
  }

  function listVoices(): Promise<SystemVoiceRecord[]> {
    if (!listing) {
      listing = (async () => {
        const exit = await runToEnd(MAC_OSASCRIPT, macVoicesArguments(), 'osascript');
        let records: SystemVoiceRecord[];
        try {
          records = parseMacVoices(exit.stdout);
        } catch (e) {
          lastError = message(e);
          throw new SynthesisError('unknown', lastError);
        }
        known = new Set(records.map((r) => r.id.slice(OSX_ID_PREFIX.length)));
        deps.debug?.(`macOS lists ${records.length} voices`);
        return records;
      })().finally(() => {
        listing = null;
      });
    }
    return listing;
  }

  /** Whether the listing carries the identifier — after one fresh listing when it did not, since a voice may have been installed meanwhile. */
  async function isInstalled(identifier: string): Promise<boolean> {
    if (known?.has(identifier)) return true;
    await listVoices();
    return known?.has(identifier) ?? false;
  }

  async function speak(voice: string, text: string, file: string): Promise<void> {
    const identifier = voice.startsWith(OSX_ID_PREFIX) ? voice.slice(OSX_ID_PREFIX.length) : '';
    if (!identifier) throw new SynthesisError('unknown', `Not a macOS voice id: ${voice}`);
    if (!(await isInstalled(identifier))) {
      throw new SynthesisError('unknown', `macOS has no voice "${identifier}"; say would have spoken in another voice instead`);
    }
    await runToEnd(MAC_SAY, macSayArguments(identifier, file, text), 'say');
  }

  async function send(request: SystemRequestBody): Promise<SystemResponse> {
    const id = nextId++;
    switch (request.op) {
      case 'ping':
        return { id, ok: true };
      case 'voices':
        return { id, ok: true, voices: await listVoices() };
      case 'speak':
        await speak(request.voice, request.text, request.file);
        // No `words` and no `ms`: nothing the provider could mistake for a timeline
        return { id, ok: true };
    }
  }

  return {
    platform: 'mac',
    wordTimestamps: false,
    send,
    stop: () => {
      for (const proc of running) {
        try {
          proc.kill();
        } catch {
          // Already gone
        }
      }
      known = null;
      listing = null;
    },
    reset: () => {
      lastError = null;
    },
    state: () => ({ running: running.size, spawned, voices: known ? known.size : null, lastError }),
  };
}
