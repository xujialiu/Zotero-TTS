import { probeZotero, refreshReport, stopProbe } from './probe';

export interface StartupParams {
  id: string;
  version: string;
  rootURI: string;
}

async function startup(_params: StartupParams): Promise<void> {
  Zotero.debug('[zotero-tts] startup');
  await probeZotero();
}

async function shutdown(): Promise<void> {
  stopProbe();
  Zotero.debug('[zotero-tts] shutdown');
}

// refreshReport 暴露出去，便于在 Run JavaScript 窗口里手动重探
Zotero.ZoteroTTS = { startup, shutdown, refreshReport };
