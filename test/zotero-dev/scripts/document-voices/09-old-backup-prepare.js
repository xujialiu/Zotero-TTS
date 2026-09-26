(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const params = Zotero.ZoteroTTSRun.params || {};
  const backupPath = String(params.backupPath || state.backup?.path || '');
  const parent = backupPath.replace(/[\\/][^\\/]*$/, '');
  if (!parent) throw new Error('backupPath param/state missing');
  const path = parent + (backupPath.includes('\\') ? '\\' : '/') + 'document-voices-old.json';
  if (!state.backup?.backup) throw new Error('exported backup object missing');
  const old = JSON.parse(JSON.stringify(state.backup.backup));
  for (const key of Object.keys(old.settings || {})) if (key.startsWith('documentVoices.')) delete old.settings[key];
  await IOUtils.writeUTF8(path, JSON.stringify(old, null, 2) + '\n');
  const current = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  state.backup.beforeOld = { records: current.records, defaultVoice: current.defaultVoice };
  state.backup.oldPath = path;
  return JSON.stringify({ status: 'PASS', path, settings: Object.keys(old.settings || {}).length, omittedDocumentKeys: Object.keys(state.backup.backup.settings || {}).filter(key => key.startsWith('documentVoices.')).length }, null, 1);
})();
