return (async () => {
  const itemID = Zotero.__ztts95Fixture?.itemID;
  if (!itemID) return JSON.stringify({ called: false, error: 'fixture identity is missing' }, null, 1);
  let called = false;
  let callError = null;
  try { Zotero.Reader.open(itemID); called = true; } catch (e) { callError = String(e); }
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const list = Zotero.Reader._readers || [];
    const rows = [];
    for (let j = 0; j < list.length; j++) {
      const r = list[j];
      if (r.itemID !== itemID) continue;
      const m = r._internalReader?._readAloudManager;
      rows.push({
        index: j,
        internal: !!r._internalReader,
        manager: !!m,
        active: !!m?.active,
        paused: m ? !!m.paused : null,
        popupOpen: !!r._internalReader?._state?.readAloudState?.popupOpen,
        selectedVoice: m?.selectedVoiceID ?? null,
        selectedTier: m?._selectedTier ?? null,
        segments: m?._segments?.length ?? null,
      });
    }
    samples.push({ ms: i * 100, rows });
    if (rows.some(row => row.internal && row.manager)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const final = samples[samples.length - 1] ?? null;
  return JSON.stringify({ called, callError, final, sampleCount: samples.length }, null, 1);
})()
