(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const params = Zotero.ZoteroTTSRun.params || {};
  const path = String(params.backupPath || '');
  if (!path) throw new Error('backupPath param missing');
  const text = await IOUtils.readUTF8(path);
  const backup = JSON.parse(text);
  const settings = backup.settings || {};
  const keyA = `documentVoices.user/${state.fixtures?.A?.key}`;
  const keyB = `documentVoices.user/${state.fixtures?.B?.key}`;
  const keyC = `documentVoices.user/${state.fixtureC?.key}`;
  const docs = Object.fromEntries([keyA, keyB, keyC].map(key => {
    try { return [key, JSON.parse(settings[key])]; } catch (_) { return [key, null]; }
  }));
  const defaultVoice = JSON.parse(settings['readAloud.defaultVoice'] || 'null');
  const expected = [keyA, keyB, keyC].every(key => docs[key]?.voice?.id && typeof docs[key].manual === 'boolean' && Number.isSafeInteger(docs[key].ts));
  if (backup.format !== 'zotero-tts-settings' || !settings['readAloud.defaultVoice'] || !expected) throw new Error(`exported backup omitted document voice/default keys: ${JSON.stringify({format:backup.format,defaultVoice,docs,keys:Object.keys(settings).length})}`);
  state.backup = { path, text, backup, docs, defaultVoice, keyA, keyB, keyC };
  return JSON.stringify({ status: 'PASS', format: backup.format, version: backup.version, settingCount: Object.keys(settings).length, defaultVoice, docs, documentKeys: [keyA, keyB, keyC] }, null, 1);
})();
