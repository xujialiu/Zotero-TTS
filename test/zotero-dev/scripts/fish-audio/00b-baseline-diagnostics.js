(async () => {
  const session = Zotero.__fishVerify;
  if (!session?.isolated) throw new Error('WebDAV isolation baseline missing; run 00-baseline-and-isolate.js first');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, timeout = 10000, step = 150) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  if (!Zotero.ZoteroTTS?.diagnostics) throw new Error('Fish diagnostics unavailable after install/startup');
  const docs = JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const positionBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const positionSyncBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  const settingsSyncBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
  const settingsUploadBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
  const settled = await waitFor(async () => {
    const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
    const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
    return position.store?.queued === 0 && position.store?.writing === false
      && position.store?.lastError === null && sync.transport?.running === false
      && sync.shared?.transport?.running === false && settings.transport?.pendingChange === false
      && settings.transport?.running === false && upload.autoUpload?.pending === false;
  });
  if (!settled) throw new Error('test WebDAV transports did not settle after isolation');
  const position = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const sync = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync());
  const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
  const upload = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsUpload());
  session.baselineDocumentVoices = docs;
  session.positionBefore = position;
  session.positionSyncBefore = sync;
  session.settingsSyncBefore = settings;
  session.settingsUploadBefore = upload;
  session.beforeTransportsSettled = true;
  return JSON.stringify({
    status: 'PASS',
    beforeTransportsSettled: true,
    positionBefore: { database: position.database, store: position.store, localEntries: sync.localEntries, sharedDocuments: sync.shared?.documents },
    pending: {
      positionStore: { queued: position.store?.queued, writing: position.store?.writing, lastError: position.store?.lastError },
      positionTransport: { running: sync.transport?.running, lastError: sync.transport?.lastError },
      sharedTransport: { running: sync.shared?.transport?.running, lastError: sync.shared?.transport?.lastError },
      settingsSync: { pendingChange: settings.transport?.pendingChange, running: settings.transport?.running, lastError: settings.transport?.lastError },
      settingsUpload: { pending: upload.autoUpload?.pending, lastError: upload.autoUpload?.lastError },
    },
    openReaderPositionPlugin: session.openReaderPositionPlugin || false,
    webdavDestinationMatched: true,
  }, null, 1);
})();
