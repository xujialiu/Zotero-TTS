(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const current = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const before = state.backup?.beforeOld;
  if (!before) throw new Error('old-backup baseline missing');
  const sameRecords = JSON.stringify(current.records) === JSON.stringify(before.records);
  const sameDefault = JSON.stringify(current.defaultVoice) === JSON.stringify(before.defaultVoice);
  if (!sameRecords || !sameDefault) throw new Error(`old backup changed document voices: ${JSON.stringify({before,current})}`);
  state.backup.oldRestore = { sameRecords, sameDefault, records: current.records, defaultVoice: current.defaultVoice };
  return JSON.stringify({ status: 'PASS', sameRecords, sameDefault, records: current.records, defaultVoice: current.defaultVoice }, null, 1);
})();
