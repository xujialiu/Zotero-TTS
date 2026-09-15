return (async () => {
  const root = Zotero.__ztts95Kokoro;
  const fixture = root?.fixtureA;
  const reader = fixture?.reader;
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!reader || !manager) throw new Error('Kokoro fixture manager is missing');
  const out = { status: 'NOT TESTABLE', provider: 'Kokoro', volume: null, errors: [] };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const prefetchName = 'extensions.zotero.zotero-tts.prefetchEnabled';
  const prefetch = { value: Services.prefs.getBoolPref(prefetchName), user: Services.prefs.prefHasUserValue(prefetchName) };
  try {
    Services.prefs.setBoolPref(prefetchName, false);
    out.volume = Zotero.Prefs.get('zotero-tts.readAloud.volume');
    const all = Components.utils.waiveXrays(manager.allVoices) || [];
    let voice = null;
    for (let i = 0; i < (all?.length ?? 0); i++) {
      if (String(all[i]?.id ?? '').startsWith('local::')) { voice = all[i]; break; }
    }
    if (!voice) { out.errors.push('no listed Kokoro voice'); return JSON.stringify(out, null, 1); }
    const controller = Components.utils.waiveXrays(manager._controller);
    const segment = controller?._segments?.[0] ?? manager._segments?.[0];
    const remote = Components.utils.waiveXrays(manager._options)?.remoteInterface;
    if (!segment || !remote || typeof remote.getAudio !== 'function') { out.errors.push('Kokoro remote interface or segment is missing'); return JSON.stringify(out, null, 1); }
    const started = Date.now();
    const result = await Promise.race([
      Promise.resolve(remote.getAudio(segment, voice.impl)),
      new Promise(resolve => setTimeout(() => resolve({ error: 'bounded probe timeout' }), 15000)),
    ]);
    const elapsedMs = Date.now() - started;
    const audio = result?.audio;
    const timestamps = result?.timestamps;
    out.voice = String(voice.id);
    out.elapsedMs = elapsedMs;
    out.audioBytes = Number(audio?.size ?? 0);
    out.timestampCount = Number(timestamps?.length ?? 0);
    out.error = result?.error ?? null;
    out.status = out.audioBytes > 0 ? 'PASS' : 'NOT TESTABLE';
  } catch (e) { out.errors.push(String(e)); }
  finally {
    if (prefetch.user) Services.prefs.setBoolPref(prefetchName, prefetch.value);
    else if (Services.prefs.prefHasUserValue(prefetchName)) Services.prefs.clearUserPref(prefetchName);
  }
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (e) { await sleep(1); } }
  return JSON.stringify(out, null, 1);
})()
