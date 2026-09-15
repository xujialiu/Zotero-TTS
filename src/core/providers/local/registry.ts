import type { TTSProvider } from '../types';
import { kokoroAdapter, type LocalEngineDeps } from './kokoro';

export type LocalEngineAdapter = {
  id: string;
  label: string;
  /** Short engine name for voice labels: "Kokoro-af_bella". */
  voiceName: string;
  /** Where the engine lives, for the section's heading (issue #112): the host as shown, the address the link opens. */
  site?: { host: string; url: string };
  defaultBaseURL: string;
  capabilities: { wordTimestamps: boolean };
  create(baseURL: string, deps: LocalEngineDeps): TTSProvider;
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
