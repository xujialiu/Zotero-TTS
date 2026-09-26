(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const session = globalThis.__zttsDocumentVoicesSession;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixture = state.fixtures?.A;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 20000, step = 150) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const reader = () => (Zotero.Reader?._readers || []).find(entry => entry?.itemID === fixture?.itemID && entry?._internalReader);
  const manager = () => reader()?._internalReader?._readAloudManager;
  const report = async () => JSON.parse(await Zotero.ZoteroTTS.diagnostics.documentVoices());
  const rawRecord = () => {
    try { return JSON.parse(Services.prefs.getStringPref(prefix + 'documentVoices.user/' + fixture.key)); } catch (_) { return null; }
  };
  const syncDiag = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
  const fileName = 'zotero-tts-shared-settings.json';
  const webdav = () => String(Services.prefs.getStringPref(prefix + 'webdav.url')).replace(/\/+$/, '') + '/';
  const authHeader = () => {
    const user = Services.prefs.getStringPref(prefix + 'webdav.username');
    const pass = Services.prefs.getStringPref(prefix + 'webdav.password');
    const bytes = new TextEncoder().encode(user + ':' + pass);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return 'Basic ' + btoa(binary);
  };
  const getRemote = async () => {
    const response = await fetch(webdav() + fileName, { method: 'GET', headers: { Authorization: authHeader() }, cache: 'no-store' });
    return response.status === 404 ? null : response.text();
  };
  const putRemote = async text => {
    const response = await fetch(webdav() + fileName, { method: 'PUT', headers: { Authorization: authHeader(), 'Content-Type': 'application/json' }, body: text });
    if (!response.ok) throw new Error(`test WebDAV settings PUT failed: HTTP ${response.status}`);
  };
  const readItems = text => text ? (JSON.parse(text).items || []) : [];
  const updateRemoteVoice = async (baseText, key, voice, internalTs) => {
    const parsed = baseText ? JSON.parse(baseText) : { format: 'zotero-tts-shared-settings', version: 1, items: [] };
    const items = (parsed.items || []).filter(item => item.key !== key);
    items.push({ key, value: JSON.stringify({ voice: { id: voice.id, lang: voice.lang }, manual: true, ts: internalTs }), ts: internalTs, by: 'document-voices-test' });
    items.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    return JSON.stringify({ format: 'zotero-tts-shared-settings', version: 1, items });
  };
  const triggerSync = async () => {
    const before = syncDiag().transport?.lastAt || 0;
    Services.prefs.setBoolPref(prefix + 'webdav.syncSettings', false);
    Services.prefs.setBoolPref(prefix + 'webdav.syncSettings', true);
    return waitFor(() => {
      const current = syncDiag();
      const transport = current.transport || {};
      return transport.lastAt && transport.lastAt > before && transport.running === false && transport.lastOutcome !== 'error' ? current : null;
    }, 25000, 200);
  };
  const playerDoc = () => reader()?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  if (!session || !session.webdavMatched || !fixture || !state.voices?.A || !state.voices?.B) throw new Error('sync-deferral state/isolation missing');
  const r = reader();
  if (!r) throw new Error('fixture A reader missing');
  if (manager()?.active) r._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);
  const remoteBefore = await getRemote();
  if (session.remoteSharedSettingsBefore === undefined) session.remoteSharedSettingsBefore = remoteBefore;
  Services.prefs.setBoolPref(prefix + 'webdav.syncSettings', true);
  const seeded = await waitFor(() => {
    const value = syncDiag();
    const transport = value.transport || {};
    return transport.lastAt && transport.running === false && transport.lastOutcome !== 'error' ? value : null;
  }, 25000, 200);
  if (!seeded) throw new Error(`settings sync did not settle: ${JSON.stringify(syncDiag())}`);
  // Keep fixture A's local manual B as the session voice before introducing
  // remote A records; this write is the local side of the conflict.
  const localTs = Date.now();
  const localRecord = { voice: { id: state.voices.B.id, lang: state.voices.B.lang }, manual: true, ts: localTs };
  Services.prefs.setStringPref(prefix + 'documentVoices.user/' + fixture.key, JSON.stringify(localRecord));
  Services.prefs.setStringPref(prefix + 'documentVoiceChanged', String(Number(Services.prefs.getStringPref(prefix + 'documentVoiceChanged', '0')) + 1));
  await sleep(500);
  const main = Zotero.getMainWindow?.();
  if (main?.Zotero_Tabs?.select && r.tabID) main.Zotero_Tabs.select(r.tabID);
  r.focus?.(); r._iframeWindow?.focus?.();
  try { r._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  r._internalReader.toggleReadAloudPopup(true);
  await waitFor(() => playerDoc(), 10000);
  await waitFor(() => manager()?.active ? manager() : null, 10000);
  if (!manager()?.active) throw new Error('fixture A did not activate for settings sync deferral');
  if (manager().paused) {
    try { r._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
    r._internalReader.toggleReadAloudPaused();
    await waitFor(() => manager()?.paused === false, 5000);
  }
  const selectedBefore = manager().selectedVoiceID;
  const playingState = { active: !!manager().active, paused: !!manager().paused, selected: selectedBefore };
  if (selectedBefore !== state.voices.B.id) throw new Error(`local session did not start on B: ${JSON.stringify(playingState)}`);
  let remoteText = await getRemote();
  const key = `documentVoices.user/${fixture.key}`;
  const firstTs = Math.max(Date.now(), localTs + 2000);
  remoteText = await updateRemoteVoice(remoteText, key, state.voices.A, firstTs);
  await putRemote(remoteText);
  const firstSync = await triggerSync();
  const firstSaved = rawRecord();
  const firstSelected = manager().selectedVoiceID;
  const playingDeferred = firstSaved?.voice?.id === state.voices.A.id && firstSaved.manual === true && firstSelected === selectedBefore && manager().active && !manager().paused;
  if (!playingDeferred) throw new Error(`playing sync changed the session: ${JSON.stringify({firstSaved,firstSelected,session:{active:manager().active,paused:manager().paused},firstSync})}`);
  r._internalReader.toggleReadAloudPaused();
  await waitFor(() => manager()?.paused === true, 5000);
  const pausedSelected = manager().selectedVoiceID;
  const secondTs = firstTs + 2000;
  remoteText = await updateRemoteVoice(await getRemote(), key, state.voices.A, secondTs);
  await putRemote(remoteText);
  const secondSync = await triggerSync();
  const secondSaved = rawRecord();
  const pausedDeferred = secondSaved?.voice?.id === state.voices.A.id && secondSaved.ts >= secondTs && manager().selectedVoiceID === pausedSelected && manager().active && manager().paused;
  if (!pausedDeferred) throw new Error(`paused sync changed the session: ${JSON.stringify({secondSaved,selected:manager().selectedVoiceID,paused:manager().paused,secondSync})}`);
  r._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);
  try { r._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  r._internalReader.toggleReadAloudPopup(true);
  await waitFor(() => manager()?.active ? manager() : null, 10000);
  const adopted = await waitFor(() => manager()?.selectedVoiceID === state.voices.A.id ? manager().selectedVoiceID : null, 10000);
  if (!adopted) throw new Error(`deferred voice was not adopted after deactivate/activate: ${JSON.stringify({selected:manager()?.selectedVoiceID,record:rawRecord()})}`);
  const afterReopen = { selected: manager().selectedVoiceID, active: !!manager().active, paused: !!manager().paused, saved: rawRecord() };
  if (manager().active && !manager().paused) r._internalReader.toggleReadAloudPaused();
  await waitFor(() => manager()?.paused === true, 5000);
  r._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);
  state.sync = { key, playingState, firstSaved, firstSelected, firstSync: firstSync.transport, playingDeferred, secondSaved, pausedSelected, secondSync: secondSync.transport, pausedDeferred, afterReopen, remoteAfter: await getRemote() };
  return JSON.stringify({ status: 'PASS', key, playingState, firstSaved, firstSelected, playingDeferred, secondSaved, pausedSelected, pausedDeferred, afterReopen, sync: { first: firstSync.transport, second: secondSync.transport }, remoteItemCount: readItems(state.sync.remoteAfter).length }, null, 1);
})();
