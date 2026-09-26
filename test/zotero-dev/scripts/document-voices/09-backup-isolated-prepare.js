(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const params = Zotero.ZoteroTTSRun.params || {};
  const backupPath = String(params.backupPath || state.backup?.path || '');
  const parent = backupPath.replace(/[\\/][^\\/]*$/, '');
  if (!parent) throw new Error('backupPath param/state missing');
  const path = parent + (backupPath.includes('\\') ? '\\' : '/') + 'document-voices-export-isolated.json';
  if (!state.backup?.backup) throw new Error('exported backup object missing');
  const isolated = JSON.parse(JSON.stringify(state.backup.backup));
  isolated.settings['webdav.syncSettings'] = false;
  isolated.settings['webdav.syncPositions'] = false;
  isolated.settings['webdav.autoUploadSettings'] = false;
  await IOUtils.writeUTF8(path, JSON.stringify(isolated, null, 2) + '\n');
  state.backup.isolatedPath = path;
  return JSON.stringify({ status: 'PASS', path, settings: Object.keys(isolated.settings || {}).length, syncSettings: isolated.settings['webdav.syncSettings'] }, null, 1);
})();
