return (async () => {
  const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.providerTiers());
  const lv = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
  const readers = d.readers.map(r => ({ title: String(r.title).slice(0, 34),
    resolveShadow: r.resolveShadow, createElementWrapped: r.createElementWrapped, tierMemoryHook: r.tierMemoryHook,
    tiers: r.tiers, selectedTier: r.selectedTier, retagged: r.retagged,
    options: Array.isArray(r.options) ? r.options.map(o => o.value + '=' + o.label) : r.options }));
  for (const row of readers) {
    if (!row.resolveShadow || !row.createElementWrapped || !row.tierMemoryHook) throw new Error('a patch is missing: ' + JSON.stringify(row));
  }
  return JSON.stringify({ readers, liveVoiceList: lv }, null, 1);
})()
