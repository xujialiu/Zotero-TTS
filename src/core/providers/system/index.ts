/**
 * The operating system as an ordinary provider (issue #12).
 *
 * Read Aloud's Local tier has always been fed from two places that never
 * meet: the plugin's voices arrive through the remote interface, the
 * operating system's straight from the reader iframe's
 * `window.speechSynthesis`. Everything the plugin does for a voice — the
 * voice browser, samples, ♥ and favorites-only, the audio cache, prefetch,
 * one voice everywhere, settings backup — therefore stopped at the OS
 * voices, and no lesser fix closes that: the Web Speech API has no bytes to
 * give (no audio, stream or capture member anywhere on it), so the plugin
 * either leaves those voices second-class or synthesizes them itself.
 *
 * This synthesizes them itself. What is re-implemented is the access path,
 * not the voices and not the player: the same SAPI / OneCore token produces
 * identical audio, Zotero still segments, skips, positions and highlights.
 * What is gained is everything above plus word-level timestamps, which
 * Zotero's own path cannot produce at all (`BrowserReadAloudController`
 * tracks only `charIndex`).
 *
 * Audio comes back through a temp file rather than the pipe: SAPI writes the
 * WAV itself, so a file is where the bytes already are, and the alternative
 * — a few hundred KB of base64 per sentence through a pipe read in chunks —
 * buys nothing. The file is deleted as soon as it is read, and again if the
 * read failed.
 *
 * Speed is not passed to the engine. Audio is made at the voice's natural
 * pace like every other provider's (core/providers/types.ts) and Read
 * Aloud's slider time-stretches it, so the cache stays valid across speeds
 * and one speed setting drives every voice. Zotero's own path changes the
 * engine's rate instead, so the same voice sounds slightly different here —
 * consistency with the plugin's other voices is the trade that was made.
 */

import { SynthesisError } from '../errors';
import type { SynthesisOptions, SynthesisResult, TTSProvider, VoiceInfo } from '../types';
import type { Daemon } from './daemon';
import { isSystemVoiceId, timestampsFromMarks, type SystemVoiceRecord, type WordMark } from './protocol';
import { readVoiceRecords, toVoiceInfo } from './voices';

export interface SystemProviderDeps {
  /** The session's helper process. Absent means this platform has none, and every call says so. */
  daemon?: Daemon | null;
  /** A fresh path for one WAV; the provider deletes it. Async because Gecko's temp directory is resolved lazily. */
  tempFile(): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  removeFile(path: string): Promise<void>;
  /** Why the platform has no helper, for the message the pane shows. */
  unsupportedReason?: string;
  debug?(message: string): void;
}

/** Text long enough to be worth a word mark, for the checks in the settings pane. */
const PROBE_TEXT = 'Read aloud.';

function daemonOf(deps: SystemProviderDeps): Daemon {
  if (!deps.daemon) {
    throw new SynthesisError('local-server-down', deps.unsupportedReason ?? 'System voices are not available on this platform.');
  }
  return deps.daemon;
}

/**
 * The installed voices as the helper reports them, descriptions and all.
 * Exported because the catalog entry (`toVoiceInfo`) drops the description,
 * and the settings pane needs it to recognize the same voice in Zotero's own
 * ids (read-aloud/system-voice-choices.ts).
 */
export async function listSystemVoiceRecords(deps: SystemProviderDeps): Promise<SystemVoiceRecord[]> {
  const response = await daemonOf(deps).send({ op: 'voices' });
  const records = readVoiceRecords(response.voices);
  if (!records.length) {
    const notes = Array.isArray(response.notes) ? response.notes.filter((n) => typeof n === 'string') : [];
    throw new SynthesisError('unknown', `Windows reported no installed voices${notes.length ? `: ${notes.join('; ')}` : ''}`);
  }
  // One API failing while the other answers is not fatal — half the voices
  // is better than none — but it is why a familiar voice went missing
  for (const note of response.notes ?? []) deps.debug?.(`system voices: ${note}`);
  return records;
}

export function createSystemProvider(deps: SystemProviderDeps): TTSProvider {
  const daemon = (): Daemon => daemonOf(deps);

  /** The synthesis, without the timestamp arithmetic; the temp file is gone by the time it returns either way. */
  async function speak(text: string, voice: string): Promise<{ audio: Blob; ms: number; words: WordMark[] }> {
    if (!isSystemVoiceId(voice)) throw new SynthesisError('unknown', `Not a system voice id: ${voice}`);
    const file = await deps.tempFile();
    try {
      const response = await daemon().send({ op: 'speak', voice, text, file });
      const bytes = await deps.readFile(file);
      if (!bytes.length) throw new SynthesisError('decode-failed', 'The Windows speech helper wrote an empty audio file');
      const words = Array.isArray(response.words) ? response.words : [];
      return { audio: new Blob([bytes as BlobPart], { type: 'audio/wav' }), ms: typeof response.ms === 'number' ? response.ms : 0, words };
    } finally {
      // Best effort: a file that was never written has nothing to remove,
      // and a temp file left behind must never be the thing that fails a
      // sentence. Zotero's temp directory is swept by Windows anyway.
      try {
        await deps.removeFile(file);
      } catch {
        /* nothing to clean up */
      }
    }
  }

  return {
    id: 'system',
    capabilities: { wordTimestamps: true },

    async listVoices(): Promise<VoiceInfo[]> {
      return (await listSystemVoiceRecords(deps)).map(toVoiceInfo);
    },

    async synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      const { audio, ms, words } = await speak(text, o.voice);
      const timestamps = timestampsFromMarks(words, ms, text);
      if (timestamps.length) return { audio, timestamps };
      return {
        audio,
        note: words.length
          ? `the engine reported ${words.length} word marks that do not fit ${ms} ms of audio`
          : 'the engine reported no word marks',
      };
    },

    /** Starting the helper and listing the voices is the whole configuration; there is nothing else to be wrong. */
    async checkConnection(): Promise<void> {
      await listSystemVoiceRecords(deps);
    },

    /**
     * Word timestamps are per engine, not per configuration, so unlike
     * Kokoro's this proves the voice the pane is about to offer rather than
     * the server behind it — and it is the check that would catch a SAPI
     * voice whose timeline is not its audio's (daemon-script.win.ts).
     */
    async checkWordTimestamps(voice: string): Promise<{ ok: boolean; detail?: string }> {
      const { ms, words } = await speak(PROBE_TEXT, voice);
      if (!words.length) return { ok: false, detail: 'the engine reported no word marks' };
      const timestamps = timestampsFromMarks(words, ms, PROBE_TEXT);
      return timestamps.length ? { ok: true } : { ok: false, detail: `the engine's ${words.length} word marks do not fit ${ms} ms of audio` };
    },
  };
}
