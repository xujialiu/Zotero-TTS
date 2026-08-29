import { describe, expect, it } from 'vitest';
import {
  decodeFrameBody,
  decodeFrameLength,
  encodeFrame,
  firstNonAsciiIndex,
  isSystemVoiceId,
  MAX_FRAME_BYTES,
  timestampsFromMarks,
  type WordMark,
} from '../../../../src/core/providers/system/protocol';
import { encodeCommand, WINDOWS_DAEMON_SCRIPT, windowsCommandArguments } from '../../../../src/core/providers/system/daemon-script.win';

const head = (frame: Uint8Array) => frame.slice(0, 4);
const body = (frame: Uint8Array) => frame.slice(4);

describe('framing', () => {
  it('writes a little-endian byte length in front of UTF-8 JSON', () => {
    const frame = encodeFrame({ id: 7, op: 'ping' });
    const json = JSON.stringify({ id: 7, op: 'ping' });
    expect(decodeFrameLength(head(frame))).toBe(new TextEncoder().encode(json).length);
    expect(new TextDecoder().decode(body(frame))).toBe(json);
  });

  it('measures the text in bytes, not characters, so a multi-byte request is read whole', () => {
    const text = '朗读功能让 Zotero 有了声音。';
    const frame = encodeFrame({ id: 1, op: 'speak', voice: 'onecore/X', text, file: 'C:\\t.wav' });
    const length = decodeFrameLength(head(frame));
    expect(length).toBeGreaterThan(JSON.stringify({ id: 1, op: 'speak', voice: 'onecore/X', text, file: 'C:\\t.wav' }).length);
    expect(body(frame).length).toBe(length);
    expect(decodeFrameBody(body(frame) as unknown as Uint8Array)).toBeTruthy();
  });

  it('refuses a length of zero or one past the ceiling: the stream is out of step, not carrying a huge message', () => {
    const at = (value: number) => {
      const buffer = new Uint8Array(4);
      new DataView(buffer.buffer).setUint32(0, value, true);
      return buffer;
    };
    expect(() => decodeFrameLength(at(0))).toThrow(/out of range/);
    expect(() => decodeFrameLength(at(MAX_FRAME_BYTES + 1))).toThrow(/out of range/);
    expect(decodeFrameLength(at(MAX_FRAME_BYTES))).toBe(MAX_FRAME_BYTES);
    expect(() => decodeFrameLength(new Uint8Array(3))).toThrow(/not 4/);
  });

  it('refuses a reply that is not an object with an id', () => {
    const bytes = (text: string) => new TextEncoder().encode(text);
    expect(() => decodeFrameBody(bytes('[1,2]'))).toThrow(/non-object/);
    expect(() => decodeFrameBody(bytes('{"ok":true}'))).toThrow(/no id/);
    expect(() => decodeFrameBody(bytes('not json'))).toThrow();
    expect(decodeFrameBody(bytes('{"id":3,"ok":true}'))).toEqual({ id: 3, ok: true });
  });
});

describe('isSystemVoiceId', () => {
  it('takes only an API and a token', () => {
    expect(isSystemVoiceId('sapi5/TTS_MS_EN-US_DAVID_11.0')).toBe(true);
    expect(isSystemVoiceId('onecore/MSTTS_V110_enUS_MarkM')).toBe(true);
    expect(isSystemVoiceId('sapi5/')).toBe(false);
    expect(isSystemVoiceId('espeak/x')).toBe(false);
    expect(isSystemVoiceId('onecore/a/b')).toBe(false);
    expect(isSystemVoiceId('system::onecore/x')).toBe(false);
  });
});

describe('timestampsFromMarks', () => {
  // The real marks Microsoft Mark returned for this sentence, measured
  // 2026-08-29 through the WinRT word-boundary track
  const text = 'Read Aloud gives Zotero a voice, and this plugin gives it more.';
  const marks: WordMark[] = [
    { t: 101, c: 0, n: 4 },
    { t: 316, c: 5, n: 5 },
    { t: 641, c: 11, n: 5 },
    { t: 3146, c: 58, n: 4 },
  ];

  it('carries the engine offsets through untouched, so each timestamp slices its own word', () => {
    const stamps = timestampsFromMarks(marks, 4190, text);
    expect(stamps.map((s) => text.slice(s.charStart, s.charEnd))).toEqual(['Read', 'Aloud', 'gives', 'more']);
  });

  it('ends a word where the next begins, and the last one at the end of the audio', () => {
    const stamps = timestampsFromMarks(marks, 4190, text);
    expect(stamps[0]).toEqual({ start: 0.101, end: 0.316, charStart: 0, charEnd: 4 });
    expect(stamps[2].end).toBe(3.146);
    expect(stamps[3].end).toBe(4.19);
  });

  it('drops the whole set when a mark runs past the audio — the SAPI rate trap, where the engine timeline is not the file', () => {
    // The same sentence through System.Speech at its default 22050 Hz: every
    // mark is 22050/16000 late and the last lands past 4559 ms of audio
    const late: WordMark[] = [
      { t: 137, c: 0, n: 4 },
      { t: 440, c: 5, n: 5 },
      { t: 4767, c: 58, n: 4 },
    ];
    expect(timestampsFromMarks(late, 4559, text)).toEqual([]);
    // …and the same marks are fine once the helper asks for 16 kHz output
    expect(timestampsFromMarks([{ t: 100, c: 0, n: 4 }, { t: 3460, c: 58, n: 4 }], 4559, text)).toHaveLength(2);
  });

  it('drops the set when an offset is outside the text it was given', () => {
    expect(timestampsFromMarks([{ t: 10, c: 0, n: 4 }, { t: 20, c: 60, n: 40 }], 1000, text)).toEqual([]);
    expect(timestampsFromMarks([{ t: 10, c: -1, n: 4 }], 1000, text)).toEqual([]);
    expect(timestampsFromMarks([{ t: 10, c: 3, n: 0 }], 1000, text)).toEqual([]);
  });

  it('drops the set when the marks go backwards, or a number is not one', () => {
    expect(timestampsFromMarks([{ t: 500, c: 0, n: 4 }, { t: 100, c: 5, n: 5 }], 1000, text)).toEqual([]);
    expect(timestampsFromMarks([{ t: NaN, c: 0, n: 4 }], 1000, text)).toEqual([]);
  });

  it('has nothing to say without marks or without audio', () => {
    expect(timestampsFromMarks([], 4000, text)).toEqual([]);
    expect(timestampsFromMarks(marks, 0, text)).toEqual([]);
  });
});

describe('the Windows daemon script', () => {
  it('is ASCII, so a copy read as a .ps1 in any console codepage still parses', () => {
    const at = firstNonAsciiIndex(WINDOWS_DAEMON_SCRIPT);
    expect(at === -1 ? '' : WINDOWS_DAEMON_SCRIPT.slice(at - 40, at + 40)).toBe('');
  });

  it('fits the command line CreateProcess accepts, with room to grow', () => {
    const encoded = encodeCommand(WINDOWS_DAEMON_SCRIPT, (binary) => Buffer.from(binary, 'binary').toString('base64'));
    const line = windowsCommandArguments(encoded).join(' ').length;
    expect(line).toBeLessThan(24_000);
  });

  it('encodes as base64 of UTF-16LE, which is what -EncodedCommand reads', () => {
    const encoded = encodeCommand('hi', (binary) => Buffer.from(binary, 'binary').toString('base64'));
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe('hi');
  });

  it('speaks the protocol this module frames: a handshake, the three ops, and 16 kHz SAPI output', () => {
    expect(WINDOWS_DAEMON_SCRIPT).toContain('"ready":true');
    for (const op of ["'ping'", "'voices'", "'speak'"]) expect(WINDOWS_DAEMON_SCRIPT).toContain(op);
    // The rate the marks are counted at; anything else silently skews them
    expect(WINDOWS_DAEMON_SCRIPT).toContain('SpeechAudioFormatInfo(16000');
    // Raw streams, never the console: the helper runs without one
    expect(WINDOWS_DAEMON_SCRIPT).toContain('OpenStandardInput()');
    expect(WINDOWS_DAEMON_SCRIPT).not.toContain('OutputEncoding');
    // Word timings come from the cue track, not from Markers, which stays empty
    expect(WINDOWS_DAEMON_SCRIPT).toContain('IncludeWordBoundaryMetadata');
    expect(WINDOWS_DAEMON_SCRIPT).toContain("'SpeechWord'");
  });
});
