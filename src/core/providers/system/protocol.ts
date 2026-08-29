/**
 * The wire between the plugin and the speech daemon (daemon-script.win.ts),
 * and the arithmetic that turns its word marks into Zotero's timestamps.
 * Nothing here does I/O, so all of it is unit-tested against plain bytes.
 *
 * **Framing**: a uint32 little-endian byte length, then that many bytes of
 * UTF-8 JSON — Firefox's own native-messaging framing. Line framing was the
 * obvious alternative and is worse here: `Subprocess`'s reader hands back
 * arbitrary chunks, so a UTF-8 sequence split across two of them decodes to
 * replacement characters, and every string on the wire would need escaping
 * to stay out of that. A length says exactly how many bytes to read, so the
 * decode is always of a whole message and nothing needs escaping. Measured
 * end to end with Chinese: the word offsets came back exact.
 */

import type { Timestamp } from '../types';

/** One installed voice, as the daemon reports it. */
export type SystemVoiceRecord = {
  /** `sapi5/<token>` or `onecore/<token>`; see voices.ts for why the token and not the name. */
  id: string;
  /** What the voice is called: "Microsoft David". */
  name: string;
  /** The voice's own description, which is exactly Gecko's voice name: "Microsoft David - English (United States)". */
  desc: string;
  /** BCP-47, from the voice's culture. */
  lang: string;
};

/** One word, as both Windows APIs report it: when it starts, and where it sits in the text that was sent. */
export type WordMark = {
  /** Milliseconds into the audio. */
  t: number;
  /** UTF-16 offset of the word in the request's text. */
  c: number;
  /** Length of the word in UTF-16 units. */
  n: number;
};

/** What a request asks for. `Omit<…, 'id'>` over a union keeps only the shared keys, so the id is added rather than stripped. */
export type SystemRequestBody =
  | { op: 'ping' }
  | { op: 'voices' }
  | { op: 'speak'; voice: string; text: string; file: string };

export type SystemRequest = SystemRequestBody & { id: number };

export type SystemResponse = {
  id: number;
  ok: boolean;
  /** Sent once, unprompted, as soon as the daemon's loop is running. */
  ready?: boolean;
  error?: string;
  voices?: SystemVoiceRecord[];
  /** Why one of the two APIs contributed nothing; empty when both answered. */
  notes?: string[];
  /** Milliseconds of audio written to the file. */
  ms?: number;
  words?: WordMark[];
};

/** A message bigger than this is a desynchronized stream, not a message; both sides refuse it. */
export const MAX_FRAME_BYTES = 32 * 1024 * 1024;

export function encodeFrame(request: SystemRequest): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(request));
  const frame = new Uint8Array(4 + body.length);
  new DataView(frame.buffer).setUint32(0, body.length, true);
  frame.set(body, 4);
  return frame;
}

/** The byte length in a frame header; throws when it is absurd, which means the stream is out of step. */
export function decodeFrameLength(head: Uint8Array): number {
  if (head.length !== 4) throw new Error(`frame header is ${head.length} bytes, not 4`);
  const length = new DataView(head.buffer, head.byteOffset, 4).getUint32(0, true);
  if (length === 0 || length > MAX_FRAME_BYTES) throw new Error(`frame length ${length} is out of range`);
  return length;
}

export function decodeFrameBody(body: Uint8Array): SystemResponse {
  const text = new TextDecoder().decode(body);
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('daemon sent a non-object reply');
  const response = parsed as SystemResponse;
  if (typeof response.id !== 'number') throw new Error('daemon reply has no id');
  return response;
}

/**
 * The plugin's voice ids carry the API in front of the token
 * (`onecore/MSTTS_V110_enUS_MarkM`), which is what the daemon dispatches on.
 * Anything else is refused here rather than sent.
 */
export function isSystemVoiceId(id: string): boolean {
  return /^(sapi5|onecore)\/[^/]+$/.test(id);
}

/**
 * The word marks as Zotero's timestamps (core/providers/types.ts).
 *
 * Neither API gives a word's *end*: `SpeakProgress` has only
 * `AudioPosition`, and WinRT's cue `Duration` is always zero. A word
 * therefore ends where the next one starts, and the last one at the end of
 * the audio — the boundary the engine itself drew, not an estimate of
 * anything. `charStart`/`charEnd` are the engine's own offsets into the very
 * text that was sent, so unlike Kokoro's and Azure's they need no alignment
 * pass (core/align.ts).
 *
 * Returns `[]`, never a guess, when the marks and the audio disagree — a
 * mark at or past the end of the audio means the engine's timeline is not
 * the file's (the SAPI rate trap in daemon-script.win.ts), and the whole set
 * is unusable. The caller then falls back to sentence highlighting.
 */
export function timestampsFromMarks(marks: readonly WordMark[], audioMs: number, text: string): Timestamp[] {
  if (!marks.length || !(audioMs > 0)) return [];
  const out: Timestamp[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    if (!Number.isFinite(mark.t) || !Number.isFinite(mark.c) || !Number.isFinite(mark.n)) return [];
    // Past the end of the audio: the marks are on another timeline
    if (mark.t >= audioMs) return [];
    if (i > 0 && mark.t < marks[i - 1].t) return [];
    const charStart = mark.c;
    const charEnd = mark.c + mark.n;
    // Offsets are into the text we sent; one that is not says the daemon
    // spoke something else, and the highlight would land anywhere
    if (charStart < 0 || charEnd > text.length || charEnd <= charStart) return [];
    const end = i + 1 < marks.length ? marks[i + 1].t : audioMs;
    out.push({ start: mark.t / 1000, end: end / 1000, charStart, charEnd });
  }
  return out;
}

/**
 * Guards `WINDOWS_DAEMON_SCRIPT` at build time. Non-ASCII would survive
 * `-EncodedCommand` but not a copy of the script saved to disk, which
 * PowerShell 5.1 reads in the console codepage; there is no reason for it
 * here, so it is simply refused.
 */
export function firstNonAsciiIndex(script: string): number {
  for (let i = 0; i < script.length; i++) if (script.charCodeAt(i) > 126 || script.charCodeAt(i) < 9) return i;
  return -1;
}
