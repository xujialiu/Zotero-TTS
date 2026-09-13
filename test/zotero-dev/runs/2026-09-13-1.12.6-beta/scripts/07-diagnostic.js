return (async () => {
  const itemID = Zotero.__ztts97Fixture?.itemID;
  const readers = Zotero.Reader._readers || [];
  let index = -1;
  for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === itemID) { index = i; break; }
  const diagnostic = JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch(undefined, index));
  return JSON.stringify({
    mechanism: diagnostic.mechanism ?? null,
    bindings: diagnostic.bindings ?? null,
    fixture: diagnostic.readers?.[index] ?? null,
  }, null, 1);
})()
