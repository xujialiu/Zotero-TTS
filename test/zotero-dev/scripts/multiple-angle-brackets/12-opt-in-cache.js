(async () => {
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === 25444) reader = list[i];
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  const trace = [];
  internal.toggleReadAloudPopup(false);
  for (let i = 0; i < 30 && manager?.active; i++) await new Promise(resolve => setTimeout(resolve, 100));
  Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', true);
  internal.toggleReadAloudPopup(true);
  for (let i = 0; i < 30; i++) {
    trace.push({ ms: i * 100, active: !!manager?.active, paused: manager ? !!manager.paused : null });
    if (i >= 3 && manager?.active && !manager.paused) { manager.pause(); break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const source = '<Log in> <Register> <Play as guest>';
  const result = await manager._options.remoteInterface.getAudio({ text: source, lang: 'en' }, { id: manager.selectedVoiceID });
  return JSON.stringify({ traceCount: trace.length, configured: true, effective: JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings()),
    audioBytes: result.audio?.size ?? null, timestamps: result.timestamps ? Array.from(result.timestamps, timestamp => ({
      charStart: timestamp.charStart, charEnd: timestamp.charEnd, sourceSlice: source.slice(timestamp.charStart, timestamp.charEnd),
    })) : null }, null, 1);
})()
