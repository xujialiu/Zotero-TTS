import { describe, expect, it, vi } from 'vitest';
import { createSystemProvider, listSystemVoiceRecords, systemUnavailableReason } from '../../../../src/core/providers/system';
import type { Daemon } from '../../../../src/core/providers/system/daemon';
import type { SystemRequestBody, SystemResponse } from '../../../../src/core/providers/system/protocol';

const NEVER_ABORTS = { aborted: false, addEventListener() {}, removeEventListener() {} } as unknown as AbortSignal;

const VOICES = [
  { id: 'onecore/MSTTS_V110_enUS_MarkM', name: 'Microsoft Mark', desc: 'Microsoft Mark - English (United States)', lang: 'en-US' },
  { id: 'sapi5/TTS_MS_ZH-CN_HUIHUI_11.0', name: 'Microsoft Huihui Desktop', desc: 'Microsoft Huihui Desktop - Chinese (Simplified)', lang: 'zh-CN' },
];

/** The daemon replaced by a table of answers, so the provider is tested without a process. */
function fakeDaemon(answer: (request: SystemRequestBody) => Partial<SystemResponse> | Promise<Partial<SystemResponse>>) {
  const sent: SystemRequestBody[] = [];
  const daemon: Daemon = {
    send: async (request) => {
      sent.push(request);
      return { id: sent.length, ok: true, ...(await answer(request)) } as SystemResponse;
    },
    stop: () => {},
    reset: () => {},
    state: () => ({ running: true, starts: 1, sent: sent.length, queued: 0, lastError: null }),
  };
  return { daemon, sent };
}

function setup(options: { answer?: (r: SystemRequestBody) => any; bytes?: Uint8Array; daemon?: Daemon | null } = {}) {
  const files: string[] = [];
  const removed: string[] = [];
  const fake = fakeDaemon(options.answer ?? (() => ({ voices: VOICES })));
  const provider = createSystemProvider({
    daemon: options.daemon === undefined ? fake.daemon : options.daemon,
    unsupportedReason: options.daemon === null ? 'no helper on this platform' : undefined,
    tempFile: async () => {
      files.push(`C:\\tmp\\zotero-tts-abc-${files.length}.wav`);
      return files[files.length - 1];
    },
    readFile: async () => options.bytes ?? new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]),
    removeFile: async (path) => {
      removed.push(path);
    },
    debug: vi.fn(),
  });
  return { provider, files, removed, sent: fake.sent };
}

const TEXT = 'Read Aloud gives Zotero a voice, and this plugin gives it more.';
/** The marks Microsoft Mark actually returned for that sentence (WinRT word track, 2026-08-29). */
const MARKS = [
  { t: 101, c: 0, n: 4 },
  { t: 316, c: 5, n: 5 },
  { t: 641, c: 11, n: 5 },
  { t: 931, c: 17, n: 6 },
  { t: 3146, c: 58, n: 4 },
];

describe('createSystemProvider', () => {
  it('publishes the installed voices as catalog entries', async () => {
    const t = setup();
    await expect(t.provider.listVoices()).resolves.toEqual([
      { id: 'onecore/MSTTS_V110_enUS_MarkM', label: 'Microsoft Mark', locale: 'en-US' },
      { id: 'sapi5/TTS_MS_ZH-CN_HUIHUI_11.0', label: 'Microsoft Huihui Desktop', locale: 'zh-CN' },
    ]);
    expect(t.sent).toEqual([{ op: 'voices' }]);
    expect(t.provider.id).toBe('system');
  });

  it('reports an empty list as a failure, with whatever the helper said about either API', async () => {
    const t = setup({ answer: () => ({ voices: [], notes: ['System.Speech: assembly not found'] }) });
    await expect(t.provider.listVoices()).rejects.toThrow(/no installed voices: System.Speech: assembly not found/);
  });

  it('synthesizes through the helper, hands back the WAV, and removes the temp file', async () => {
    const t = setup({ answer: () => ({ ms: 4190, words: MARKS }) });
    const result = await t.provider.synthesize(TEXT, { voice: 'onecore/MSTTS_V110_enUS_MarkM', signal: NEVER_ABORTS });
    expect(t.sent).toEqual([{ op: 'speak', voice: 'onecore/MSTTS_V110_enUS_MarkM', text: TEXT, file: t.files[0] }]);
    expect(result.audio.type).toBe('audio/wav');
    expect(result.audio.size).toBe(8);
    expect(t.removed).toEqual(t.files);
  });

  it('turns the engine’s word marks into timestamps that slice their own words', async () => {
    const t = setup({ answer: () => ({ ms: 4190, words: MARKS }) });
    const result = await t.provider.synthesize(TEXT, { voice: 'onecore/MSTTS_V110_enUS_MarkM', signal: NEVER_ABORTS });
    expect(result.timestamps?.map((s) => TEXT.slice(s.charStart, s.charEnd))).toEqual(['Read', 'Aloud', 'gives', 'Zotero', 'more']);
    expect(result.note).toBeUndefined();
  });

  it('falls back to sentence highlighting, saying why, when the marks do not fit the audio', async () => {
    // System.Speech at its default rate: marks 22050/16000 too late
    const late = [{ t: 137, c: 0, n: 4 }, { t: 4767, c: 58, n: 4 }];
    const t = setup({ answer: () => ({ ms: 4559, words: late }) });
    const result = await t.provider.synthesize(TEXT, { voice: 'sapi5/TTS_MS_EN-US_DAVID_11.0', signal: NEVER_ABORTS });
    expect(result.timestamps).toBeUndefined();
    expect(result.note).toMatch(/2 word marks that do not fit 4559 ms/);
    // The audio is still delivered; only the word highlight is given up
    expect(result.audio.size).toBe(8);
  });

  it('says so plainly when the engine reported no marks at all', async () => {
    const t = setup({ answer: () => ({ ms: 1000, words: [] }) });
    const result = await t.provider.synthesize(TEXT, { voice: 'onecore/X', signal: NEVER_ABORTS });
    expect(result.note).toBe('the engine reported no word marks');
  });

  it('removes the temp file even when the helper failed, so a broken sentence leaks nothing', async () => {
    const t = setup({
      answer: () => {
        throw new Error('no such voice');
      },
    });
    await expect(t.provider.synthesize(TEXT, { voice: 'onecore/X', signal: NEVER_ABORTS })).rejects.toThrow(/no such voice/);
    expect(t.removed).toEqual(t.files);
  });

  it('refuses an empty audio file rather than handing the player nothing to decode', async () => {
    const t = setup({ answer: () => ({ ms: 100, words: [] }), bytes: new Uint8Array(0) });
    await expect(t.provider.synthesize(TEXT, { voice: 'onecore/X', signal: NEVER_ABORTS })).rejects.toThrow(/empty audio file/);
  });

  it('refuses a voice id that is not one of ours before spending a request on it', async () => {
    const t = setup();
    await expect(t.provider.synthesize(TEXT, { voice: 'af_bella', signal: NEVER_ABORTS })).rejects.toThrow(/Not a system voice id/);
    expect(t.sent).toEqual([]);
  });

  describe('the pane’s checks', () => {
    it('proves the configuration by listing, since there is nothing else to be wrong', async () => {
      const t = setup();
      await expect(t.provider.checkConnection!()).resolves.toBeUndefined();
      expect(t.sent).toEqual([{ op: 'voices' }]);
    });

    it('proves word timestamps with one real synthesis of the voice about to be offered', async () => {
      const t = setup({ answer: () => ({ ms: 900, words: [{ t: 40, c: 0, n: 4 }, { t: 400, c: 5, n: 5 }] }) });
      await expect(t.provider.checkWordTimestamps!('onecore/X')).resolves.toEqual({ ok: true });
      expect(t.sent[0]).toMatchObject({ op: 'speak', text: 'Read aloud.' });
    });

    it('reports a voice whose marks do not fit its audio, which is the trap worth catching', async () => {
      const t = setup({ answer: () => ({ ms: 300, words: [{ t: 40, c: 0, n: 4 }, { t: 400, c: 5, n: 5 }] }) });
      await expect(t.provider.checkWordTimestamps!('sapi5/X')).resolves.toEqual({
        ok: false,
        detail: "the engine's 2 word marks do not fit 300 ms of audio",
      });
    });
  });

  describe('on a platform with no helper', () => {
    it('says so, from every call, instead of failing obscurely', async () => {
      const t = setup({ daemon: null });
      await expect(t.provider.listVoices()).rejects.toThrow(/no helper on this platform/);
      await expect(t.provider.synthesize('x', { voice: 'onecore/X', signal: NEVER_ABORTS })).rejects.toThrow(/no helper on this platform/);
      await expect(t.provider.checkConnection!()).rejects.toThrow(/no helper on this platform/);
    });
  });
});

describe('listSystemVoiceRecords', () => {
  it('keeps the descriptions the catalog drops, which is what the id mapping needs', async () => {
    const fake = fakeDaemon(() => ({ voices: VOICES }));
    const records = await listSystemVoiceRecords({
      daemon: fake.daemon,
      tempFile: async () => '',
      readFile: async () => new Uint8Array(),
      removeFile: async () => {},
    });
    expect(records.map((r) => r.desc)).toEqual(['Microsoft Mark - English (United States)', 'Microsoft Huihui Desktop - Chinese (Simplified)']);
  });
});

// Issue #38: a tab upgraded over kept calling the stopped instance, whose
// daemon was released — and daemonOf's default blamed the platform, on a
// Windows that had run system voices a minute earlier. The reason the
// wiring hands over must say which of the two actually happened.
describe('systemUnavailableReason', () => {
  it('says the instance stopped once a running daemon was shut down', () => {
    expect(systemUnavailableReason({ stopped: true, platformReason: null })).toBe(
      'System voices are unavailable: this plugin instance has been stopped, likely replaced by an update. Reopen the tab to use the new build.',
    );
    // A stop outranks a platform message: a daemon ran, so the platform was fine
    expect(systemUnavailableReason({ stopped: true, platformReason: 'no helper on this platform' })).toMatch(/has been stopped/);
  });

  it('passes the platform reason through while nothing ever ran', () => {
    expect(systemUnavailableReason({ stopped: false, platformReason: 'no helper on this platform' })).toBe('no helper on this platform');
  });

  it('is silent while a daemon is expected to be there', () => {
    expect(systemUnavailableReason({ stopped: false, platformReason: null })).toBeUndefined();
  });
});
