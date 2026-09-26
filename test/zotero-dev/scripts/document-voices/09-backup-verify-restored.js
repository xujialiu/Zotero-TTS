(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const expected = state.backup?.docs;
  const expectedDefault = state.backup?.defaultVoice;
  const current = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const sameRecords = Object.entries(expected || {}).every(([key, value]) => current.records[key] === JSON.stringify(value))
    && Object.keys(current.records).length === Object.keys(expected || {}).length;
  const sameDefault = JSON.stringify(current.defaultVoice) === JSON.stringify(expectedDefault);
  const syncOff = !Services.prefs.getBoolPref('extensions.zotero.zotero-tts.webdav.syncSettings');
  if (!sameRecords || !sameDefault || !syncOff) throw new Error(`backup restore mismatch: ${JSON.stringify({sameRecords,sameDefault,syncOff,current,expected,expectedDefault})}`);
  state.backup.restored = { sameRecords, sameDefault, syncOff, records: current.records, defaultVoice: current.defaultVoice };
  return JSON.stringify({ status: 'PASS', sameRecords, sameDefault, syncOff, records: current.records, defaultVoice: current.defaultVoice }, null, 1);
})();
