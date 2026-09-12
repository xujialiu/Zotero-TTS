(async () => {
  const specs = [['cacheAudio', 'bool'], ['prefetchEnabled', 'bool']];
  const snap = {};
  for (const [suffix] of specs) {
    const full = 'extensions.zotero.zotero-tts.' + suffix;
    snap[suffix] = {value: !!Zotero.Prefs.get('zotero-tts.' + suffix), user: Services.prefs.prefHasUserValue(full)};
  }
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === 25431) reader = list[i];
  const manager = reader && reader._internalReader && reader._internalReader._readAloudManager;
  const iface = manager && manager._options && manager._options.remoteInterface;
  const voiceID = manager && manager.selectedVoiceID;
  const sources = ['<Hello world>.', '“<The quick brown fox jumps over the lazy dog>!”'];
  const calls = [], results = [];
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const wrappedFetch = function(input, init) {
    let text = null, format = null, referenceID = null;
    try {
      if (typeof (init && init.body) === 'string') {
        const body = JSON.parse(init.body);
        text = typeof body.text === 'string' ? body.text : null;
        format = typeof body.format === 'string' ? body.format : null;
        referenceID = typeof body.reference_id === 'string' ? body.reference_id : null;
      }
    } catch (e) {}
    let path = String(input), marker = path.indexOf('://');
    if (marker >= 0) { const slash = path.indexOf('/', marker + 3); if (slash >= 0) path = path.slice(slash); }
    calls.push({path, method: init && init.method || 'GET', text, format, referenceID});
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  try {
    sandbox.fetch = wrappedFetch;
    Zotero.Prefs.set('zotero-tts.cacheAudio', false);
    Zotero.Prefs.set('zotero-tts.prefetchEnabled', false);
    for (const source of sources) {
      const result = await iface.getAudio({text: source}, {id: voiceID});
      results.push({source, audioBytes: result.audio && result.audio.size || null,
        timestamps: result.timestamps && result.timestamps.map(t => ({start:t.start,end:t.end,
          charStart:t.charStart,charEnd:t.charEnd,sourceSlice:source.slice(t.charStart,t.charEnd)}))});
    }
  } finally {
    sandbox.fetch = originalFetch;
    for (const [suffix] of specs) {
      const full = 'extensions.zotero.zotero-tts.' + suffix;
      if (snap[suffix].user) Zotero.Prefs.set('zotero-tts.' + suffix, snap[suffix].value);
      else Services.prefs.clearUserPref(full);
    }
  }
  return JSON.stringify({calls, results}, null, 1);
})()
