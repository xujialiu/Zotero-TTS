return (() => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const get = suffix => { let value = null; try { value = Zotero.Prefs.get('zotero-tts.' + suffix); } catch (e) {} return { value, user: Services.prefs.prefHasUserValue(prefix + suffix) }; };
  const secret = suffix => { const e = get(suffix); return { set: typeof e.value === 'string' && e.value.length > 0, chars: typeof e.value === 'string' ? e.value.length : null, user: e.user }; };
  const out = {
    providers: {
      openai: { enabled: get('openai.enabled'), server: get('openai.server'), baseURL: get('openai.baseURL'), model: get('openai.model'), voice: get('openai.voice'), voices: secret('openai.voices'), apiKey: secret('openai.apiKey'), headers: secret('openai.headers'), presetValues: secret('openai.presetValues') },
      azure: { enabled: get('azure.enabled'), region: get('azure.region'), voice: get('azure.voice'), apiKey: secret('azure.apiKey') },
      cloudflare: { enabled: get('cloudflare.enabled'), accountId: secret('cloudflare.accountId'), apiToken: secret('cloudflare.apiToken') },
      speechify: { enabled: get('speechify.enabled'), apiKey: secret('speechify.apiKey') },
      fish: { enabled: get('fish.enabled'), freeOnly: get('fish.freeOnly'), voices: secret('fish.voices'), includeOfficial: get('fish.includeOfficial'), includeOwn: get('fish.includeOwn'), includeManual: get('fish.includeManual'), apiKey: secret('fish.apiKey') },
      fishspeech: { enabled: get('fishspeech.enabled'), baseURL: get('fishspeech.baseURL'), headers: secret('fishspeech.headers') },
      local: { enabled: get('local.enabled'), engine: get('local.engine'), baseURL: get('local.baseURL'), voice: get('local.voice'), headers: secret('local.headers') },
      system: { enabled: get('system.enabled') },
    },
    general: { volume: get('readAloud.volume'), sameForAll: get('readAloud.sameForAllDocuments'), prefetch: get('prefetch'), prefetchEnabled: get('prefetchEnabled'), syncPositions: get('webdav.syncPositions'), autoUploadSettings: get('webdav.autoUploadSettings'), syncSettings: get('webdav.syncSettings') },
    presets: {},
  };
  let text = '';
  try { text = Zotero.Prefs.get('zotero-tts.openai.presetValues') || ''; } catch (e) {}
  try {
    const raw = JSON.parse(text);
    for (const id of ['openai', 'chatterbox', 'mimo', 'other']) {
      const e = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw[id] : null;
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      out.presets[id] = { baseURL: typeof e.baseURL === 'string' ? e.baseURL : null, model: typeof e.model === 'string' ? e.model : null, hasApiKey: typeof e.apiKey === 'string' && e.apiKey.length > 0, apiKeyChars: typeof e.apiKey === 'string' ? e.apiKey.length : null, hasVoices: typeof e.voices === 'string' && e.voices.length > 0, voicesChars: typeof e.voices === 'string' ? e.voices.length : null, hasHeaders: typeof e.headers === 'string' && e.headers.length > 0, headersChars: typeof e.headers === 'string' ? e.headers.length : null };
    }
  } catch (e) { out.presetsParseError = String(e); }
  return JSON.stringify(out, null, 1);
})()
