(async () => {
  const fixtureID = 24434;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  const manager = reader?._internalReader?._readAloudManager;
  const iface = manager?._options?.remoteInterface;
  const voiceID = manager?.selectedVoiceID;
  const source = '<> []';
  const calls = [];
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  sandbox.fetch = function(input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    calls.push({ path: String(input).replace(/^https?:\/\/[^/]+/, ''), text: body?.text ?? body?.input ?? null });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  let result = null;
  let error = null;
  try {
    if (!iface || !voiceID) throw new Error('fixture remote interface or voice missing');
    result = await iface.getAudio(Object.freeze({ text: source, lang: 'en' }), { id: voiceID });
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  finally { sandbox.fetch = originalFetch; }
  return JSON.stringify({ configuredPairs: Zotero.Prefs.get('zotero-tts.readAloud.bracketPairs'), source, calls, result: result ? { audioBytes: result.audio?.size ?? null, error: result.error ?? null, timestamps: result.timestamps ? Array.from(result.timestamps, timestamp => ({ start: timestamp.start, end: timestamp.end, charStart: timestamp.charStart, charEnd: timestamp.charEnd, sourceSlice: source.slice(timestamp.charStart, timestamp.charEnd) })) : null } : null, error }, null, 1);
})()
