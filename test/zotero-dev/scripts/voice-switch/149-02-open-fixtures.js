(async () => {
  const session = Zotero.__ztts149;
  const fixtures = session?.fixtures || [];
  if (fixtures.length !== 2) throw new Error('149 fixtures are missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const findReader = itemID => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i];
    return null;
  };
  const waitFor = async (test, timeout = 24000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const opened = [];
  for (const fixture of fixtures) {
    let callError = null;
    try {
      const result = Zotero.Reader.open(fixture.itemID);
      if (result && typeof result.then === 'function') await result;
    } catch (e) { callError = String(e); }
    const reader = await waitFor(() => {
      const candidate = findReader(fixture.itemID);
      return candidate?._internalReader?._readAloudManager ? candidate : null;
    });
    if (!reader) throw new Error(`reader did not initialize for ${fixture.kind}: ${callError || 'timeout'}`);
    const manager = reader._internalReader._readAloudManager;
    const segments = await waitFor(() => {
      const rows = manager._segments || reader._internalReader._readAloudSegments?.segments;
      return rows?.length ? rows : null;
    });
    let engine = null;
    try { engine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()); } catch (e) { engine = { error: String(e) }; }
    const engineReader = Array.isArray(engine?.readers) ? engine.readers.find(row => Number(row.itemID) === Number(fixture.itemID)) : null;
    const allVoices = [];
    const list = manager.allVoices || [];
    for (let i = 0; i < list.length; i++) {
      const voice = list[i];
      let id = null, provider = null, name = null, lang = null, tier = null;
      try { id = voice?.id ?? null; provider = voice?.provider ?? null; name = voice?.name ?? voice?.label ?? null; lang = voice?.lang ?? voice?.locale ?? null; tier = voice?.tier ?? null; } catch (_) {}
      if (id !== null) allVoices.push({ id, provider, name, lang, tier });
    }
    opened.push({
      kind: fixture.kind, itemID: fixture.itemID, key: fixture.key, tabID: reader.tabID ?? null,
      callError, manager: {
        active: !!manager.active, paused: !!manager.paused, selectedVoice: manager.selectedVoiceID ?? null,
        selectedTier: manager._selectedTier ?? null, segments: segments?.length ?? null,
        allVoices: allVoices.length, voicesForLanguage: manager.voicesForLanguage?.length ?? null,
        popupOpen: !!reader._internalReader?._state?.readAloudState?.popupOpen,
      },
      engine: engineReader ? {
        session: engineReader.session, ended: engineReader.session?.ended ?? null,
        controller: engineReader.controller ?? null, position: engineReader.session?.position ?? null,
        currentIndex: engineReader.session?.currentIndex ?? null, playing: engineReader.session?.playing ?? null,
      } : { present: false },
      voiceSample: allVoices.slice(0, 12),
    });
  }
  session.opened = opened;
  const main = Zotero.getMainWindow?.();
  if (main?.Zotero_Tabs?.select && opened[0]?.tabID) main.Zotero_Tabs.select(opened[0].tabID);
  return JSON.stringify({ status: 'PASS', opened }, null, 1);
})();
