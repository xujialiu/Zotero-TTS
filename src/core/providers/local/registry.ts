import type { TTSProvider } from '../types';
import { kokoroAdapter } from './kokoro';

export type LocalEngineAdapter = {
  id: string;
  label: string;
  /** Short engine name for voice labels: "TTS-Kokoro-af_bella". */
  voiceName: string;
  defaultBaseURL: string;
  capabilities: { wordTimestamps: boolean };
  create(baseURL: string, deps: { fetch: typeof fetch }): TTSProvider;
};

/**
 * Adding a new local engine = write an adapter file + add one line here.
 * The preferences pane renders its dropdown from this array; no engine
 * name is hardcoded.
 */
export const LOCAL_ENGINES: readonly LocalEngineAdapter[] = [kokoroAdapter];

export function getLocalEngine(id: string): LocalEngineAdapter | undefined {
  return LOCAL_ENGINES.find((e) => e.id === id);
}
