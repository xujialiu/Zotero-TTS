export interface StartupParams {
  id: string;
  version: string;
  rootURI: string;
}

async function startup(_params: StartupParams): Promise<void> {
  Zotero.debug('[zotero-tts] startup');
}

async function shutdown(): Promise<void> {
  Zotero.debug('[zotero-tts] shutdown');
}

Zotero.ZoteroTTS = { startup, shutdown };
