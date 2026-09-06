/**
 * The operating system as an ordinary provider (issue #12; macOS since #23).
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
 * not the voices and not the player: the same SAPI / OneCore token, the
 * same macOS voice identifier, produces identical audio, and Zotero still
 * segments, skips, positions and highlights. What is gained is everything
 * above — plus, on Windows, word-level timestamps, which Zotero's own path
 * cannot produce at all (`BrowserReadAloudController` tracks only
 * `charIndex`). macOS gives none (mac.ts), so there the highlight stays by
 * sentence, as it is for these voices on Zotero's own path.
 *
 * How the platform is reached is behind `SpeechBackend` (backend.ts): the
 * Windows helper process (daemon.ts) or a `say` per sentence (mac.ts).
 * Everything here is the same for both.
 *
 * Audio comes back through a temp file rather than the pipe: both engines
 * write the WAV themselves, so a file is where the bytes already are, and
 * the alternative — a few hundred KB of base64 per sentence through a pipe
 * read in chunks — buys nothing. The file is deleted as soon as it is read,
 * and again if the read failed.
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
import { wavDataLength } from '../../wav';
import type { SpeechBackend } from './backend';
import { isSystemVoiceId, timestampsFromMarks, type SystemVoiceRecord, type WordMark } from './protocol';
import { readVoiceRecords, toVoiceInfo } from './voices';

export interface SystemProviderDeps {
  /** The session's backend (backend.ts). Absent means this platform has none, and every call says so. */
  backend?: SpeechBackend | null;
  /** A fresh path for one WAV; the provider deletes it. Async because Gecko's temp directory is resolved lazily. */
  tempFile(): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  removeFile(path: string): Promise<void>;
  /** Why the platform has no backend, for the message the pane shows. */
  unsupportedReason?: string;
  debug?(message: string): void;
}

/** Text long enough to be worth a word mark, for the checks in the settings pane. */
const PROBE_TEXT = 'Read aloud.';

/** How the messages name the platform: what reported the voices, whose helper wrote the file. */
export function platformName(backend: Pick<SpeechBackend, 'platform'>): string {
  return backend.platform === 'mac' ? 'macOS' : 'Windows';
}

function backendOf(deps: SystemProviderDeps): SpeechBackend {
  if (!deps.backend) {
    throw new SynthesisError('local-server-down', deps.unsupportedReason ?? 'System voices are not available on this platform.');
  }
  return deps.backend;
}

/**
 * The unsupported-reason the wiring should hand over when there is no
 * backend. A backend that ran and was shut down means the instance stopped —
 * an in-place upgrade does that under any open tab still calling it (issue
 * #38) — and saying "platform" then blames the wrong thing entirely.
 */
export function systemUnavailableReason(state: { stopped: boolean; platformReason?: string | null }): string | undefined {
  if (state.stopped) {
    return 'System voices are unavailable: this plugin instance has been stopped, likely replaced by an update. Reopen the tab to use the new build.';
  }
  return state.platformReason ?? undefined;
}

/**
 * The installed voices as the backend reports them, descriptions and all.
 * Exported because the catalog entry (`toVoiceInfo`) drops the description,
 * and the settings pane needs it to recognize the same voice in Zotero's own
 * ids (read-aloud/system-voice-choices.ts).
 */
export async function listSystemVoiceRecords(deps: SystemProviderDeps): Promise<SystemVoiceRecord[]> {
  const backend = backendOf(deps);
  const response = await backend.send({ op: 'voices' });
  const records = readVoiceRecords(response.voices);
  if (!records.length) {
    const notes = Array.isArray(response.notes) ? response.notes.filter((n) => typeof n === 'string') : [];
    throw new SynthesisError('unknown', `${platformName(backend)} reported no installed voices${notes.length ? `: ${notes.join('; ')}` : ''}`);
  }
  // One API failing while the other answers is not fatal — half the voices
  // is better than none — but it is why a familiar voice went missing
  for (const note of response.notes ?? []) deps.debug?.(`system voices: ${note}`);
  return records;
}

export function createSystemProvider(deps: SystemProviderDeps): TTSProvider {
  const backend = (): SpeechBackend => backendOf(deps);

  /** The synthesis, without the timestamp arithmetic; the temp file is gone by the time it returns either way. */
  async function speak(text: string, voice: string): Promise<{ audio: Blob; ms: number; words: WordMark[] }> {
    if (!isSystemVoiceId(voice)) throw new SynthesisError('unknown', `Not a system voice id: ${voice}`);
    const file = await deps.tempFile();
    try {
      const response = await backend().send({ op: 'speak', voice, text, file });
      const bytes = await deps.readFile(file);
      if (!bytes.length) throw new SynthesisError('decode-failed', `The ${platformName(backend())} speech helper wrote an empty audio file`);
      const words = Array.isArray(response.words) ? response.words : [];
      const ms = typeof response.ms === 'number' ? response.ms : 0;
      // A header with no samples — what say writes for text it cannot voice
      // (core/wav.ts) — goes on as empty audio, which the remote interface
      // plays as a short pause (issue #42); the bytes themselves would fail
      // Zotero's decode, and a decode failure is a silent stop
      if (wavDataLength(bytes) === 0) {
        deps.debug?.(`system: the engine wrote no samples for ${text.length} chars`);
        return { audio: new Blob([], { type: 'audio/wav' }), ms, words };
      }
      return { audio: new Blob([bytes as BlobPart], { type: 'audio/wav' }), ms, words };
    } finally {
      // Best effort: a file that was never written has nothing to remove,
      // and a temp file left behind must never be the thing that fails a
      // sentence. The temp directory is swept by the system anyway.
      try {
        await deps.removeFile(file);
      } catch {
        /* nothing to clean up */
      }
    }
  }

  /** A backend without word marks: the audio is handed over as it is, and the pane says so instead of probing. */
  const sentenceOnly = (): boolean => !backend().wordTimestamps;

  const provider: TTSProvider = {
    id: 'system',
    // Read once: the backend is the session's and does not change under a provider
    capabilities: { wordTimestamps: deps.backend?.wordTimestamps ?? true },

    async listVoices(): Promise<VoiceInfo[]> {
      return (await listSystemVoiceRecords(deps)).map(toVoiceInfo);
    },

    async synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult> {
      const { audio, ms, words } = await speak(text, o.voice);
      if (sentenceOnly()) return { audio, note: `${platformName(backend())} voices come without word timings` };
      const timestamps = timestampsFromMarks(words, ms, text);
      if (timestamps.length) return { audio, timestamps };
      return {
        audio,
        note: words.length
          ? `the engine reported ${words.length} word marks that do not fit ${ms} ms of audio`
          : 'the engine reported no word marks',
      };
    },

    /** Starting the backend and listing the voices is the whole configuration; there is nothing else to be wrong. */
    async checkConnection(): Promise<void> {
      await listSystemVoiceRecords(deps);
    },

    /**
     * Word timestamps are per engine, not per configuration, so unlike
     * Kokoro's this proves the voice the pane is about to offer rather than
     * the server behind it — and it is the check that would catch a SAPI
     * voice whose timeline is not its audio's (daemon-script.win.ts). A
     * backend that has none says so without spending a synthesis.
     */
    async checkWordTimestamps(voice: string): Promise<{ ok: boolean; detail?: string }> {
      if (sentenceOnly()) return { ok: false, detail: `${platformName(backend())} voices have none, so the sentence is highlighted` };
      const { ms, words } = await speak(PROBE_TEXT, voice);
      if (!words.length) return { ok: false, detail: 'the engine reported no word marks' };
      const timestamps = timestampsFromMarks(words, ms, PROBE_TEXT);
      return timestamps.length ? { ok: true } : { ok: false, detail: `the engine's ${words.length} word marks do not fit ${ms} ms of audio` };
    },
  };

  // A backend without marks proves it can synthesize with one probe instead
  // — a broken `say` is caught in the pane, not mid-sentence. On Windows the
  // marks probe above already is that synthesis, so there is no second one.
  if (deps.backend && !deps.backend.wordTimestamps) {
    provider.checkSynthesis = async (voice: string): Promise<void> => {
      await speak(PROBE_TEXT, voice);
    };
  }

  return provider;
}
