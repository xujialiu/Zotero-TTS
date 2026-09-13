(async () => {
  const full = 'extensions.zotero.zotero-tts.prefetchEnabled';
  const before = { value: !!Zotero.Prefs.get('zotero-tts.prefetchEnabled'), user: Services.prefs.prefHasUserValue(full) };
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === 25444) reader = list[i];
  const manager = reader?._internalReader?._readAloudManager;
  const iface = manager?._options?.remoteInterface;
  const calls = [];
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  sandbox.fetch = function(input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    calls.push({ path: String(input).replace(/^https?:\/\/[^/]+/, ''), input: body?.input ?? null });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  let result = null;
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    const audio = await iface.getAudio({ text: '<>' }, { id: manager.selectedVoiceID });
    result = { audioBytes: audio.audio?.size ?? null, error: audio.error ?? null, timestamps: audio.timestamps ?? null };
  } catch (e) { error = String(e); }
  finally {
    sandbox.fetch = originalFetch;
    if (before.user) Zotero.Prefs.set('zotero-tts.prefetchEnabled', before.value);
    else Services.prefs.clearUserPref(full);
  }
  return JSON.stringify({ source: '<>', result, calls, error }, null, 1);
})()
