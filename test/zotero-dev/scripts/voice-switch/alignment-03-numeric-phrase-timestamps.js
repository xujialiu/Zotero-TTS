return (async () => {
  const fixture = Zotero.__ztts95Kokoro?.fixtureA;
  const reader = fixture?.reader;
  const manager = reader?._internalReader?._readAloudManager;
  const text = 'We scanned 3 by 3 mm today.';
  const ids = ['local::af_bella', 'local::af_jadzia'];
  const out = { textChars: text.length, results: [], errors: [] };
  if (!manager) { out.errors.push('fixture manager missing'); return JSON.stringify(out, null, 1); }
  const iface = manager._options?.remoteInterface;
  if (!iface?.getAudio) { out.errors.push('remote interface getAudio missing'); return JSON.stringify(out, null, 1); }
  for (const id of ids) {
    const voice = (manager._allVoices || []).find(v => v?.id === id) ?? { id };
    const started = Date.now();
    try {
      const result = await iface.getAudio({ text }, voice);
      const rows = [];
      const timestamps = result?.timestamps || [];
      for (let i = 0; i < timestamps.length; i++) {
        const t = timestamps[i];
        rows.push({ start: Number(t.start), end: Number(t.end), charStart: Number(t.charStart),
          charEnd: Number(t.charEnd), sourceSlice: text.slice(Number(t.charStart), Number(t.charEnd)) });
      }
      out.results.push({ voice: id, elapsedMs: Date.now() - started, audioBytes: Number(result?.audio?.size ?? 0),
        timestamps: rows, timestampCount: rows.length, note: result?.note ?? null });
    } catch (e) { out.results.push({ voice: id, elapsedMs: Date.now() - started, error: String(e) }); }
  }
  return JSON.stringify(out, null, 1);
})()
