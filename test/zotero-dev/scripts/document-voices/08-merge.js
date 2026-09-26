(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const session = globalThis.__zttsDocumentVoicesSession;
  const prefix = 'extensions.zotero.zotero-tts.';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 25000, step = 200) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = test();
      if (value) return value;
      await sleep(step);
    }
    return test();
  };
  const syncDiag = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync());
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
    const response = await fetch(webdav() + 'zotero-tts-shared-settings.json', { headers: { Authorization: authHeader() }, cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`test WebDAV settings GET failed: HTTP ${response.status}`);
    return response.text();
  };
  const putRemote = async text => {
    const response = await fetch(webdav() + 'zotero-tts-shared-settings.json', { method: 'PUT', headers: { Authorization: authHeader(), 'Content-Type': 'application/json' }, body: text });
    if (!response.ok) throw new Error(`test WebDAV settings PUT failed: HTTP ${response.status}`);
  };
  const raw = key => {
    try { return JSON.parse(Services.prefs.getStringPref(prefix + key)); } catch (_) { return null; }
  };
  const update = (text, key, record, by) => {
    const parsed = text ? JSON.parse(text) : { format: 'zotero-tts-shared-settings', version: 1, items: [] };
    const items = (parsed.items || []).filter(item => item.key !== key);
    items.push({ key, value: JSON.stringify(record), ts: record.ts, by });
    items.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    return JSON.stringify({ format: 'zotero-tts-shared-settings', version: 1, items });
  };
  const trigger = async () => {
    const before = syncDiag().transport?.lastAt || 0;
    Services.prefs.setBoolPref(prefix + 'webdav.syncSettings', false);
    Services.prefs.setBoolPref(prefix + 'webdav.syncSettings', true);
    return waitFor(() => {
      const value = syncDiag();
      const t = value.transport || {};
      return t.lastAt && t.lastAt > before && t.running === false && t.lastOutcome !== 'error' ? value : null;
    });
  };
  if (!session?.webdavMatched || !state.sync || !state.fixtures?.A || !state.fixtureC || !state.voices?.A || !state.voices?.B) throw new Error('merge state/isolation missing');
  const keyA = `documentVoices.user/${state.fixtures.A.key}`;
  const keyC = `documentVoices.user/${state.fixtureC.key}`;
  const localA = raw(keyA);
  const localC = raw(keyC);
  if (!localA?.manual || !localC?.manual) throw new Error(`merge needs two local manual records: ${JSON.stringify({localA,localC})}`);
  const inheritedA = { voice: { id: state.voices.B.id, lang: state.voices.B.lang }, manual: false, ts: localA.ts + 10000 };
  const newerManualC = { voice: { id: state.voices.B.id, lang: state.voices.B.lang }, manual: true, ts: localC.ts + 10000 };
  let remote = await getRemote();
  remote = update(remote, keyA, inheritedA, 'remote-inherited-test');
  remote = update(remote, keyC, newerManualC, 'remote-manual-test');
  await putRemote(remote);
  const sync = await trigger();
  const afterA = raw(keyA);
  const afterC = raw(keyC);
  const uploaded = await getRemote();
  const remoteItems = (JSON.parse(uploaded || '{}').items || []);
  const remoteA = remoteItems.find(item => item.key === keyA);
  const remoteC = remoteItems.find(item => item.key === keyC);
  const remoteRecord = item => { try { return JSON.parse(item?.value); } catch (_) { return null; } };
  const retainedManual = afterA?.voice?.id === localA.voice.id && afterA.manual === true && afterA.ts === localA.ts;
  const adoptedIndependent = afterC?.voice?.id === state.voices.B.id && afterC.manual === true && afterC.ts === newerManualC.ts;
  const uploadedBoth = remoteRecord(remoteA)?.voice?.id === localA.voice.id && remoteRecord(remoteA)?.manual === true
    && remoteRecord(remoteC)?.voice?.id === state.voices.B.id && remoteRecord(remoteC)?.manual === true;
  if (!retainedManual || !adoptedIndependent || !uploadedBoth) throw new Error(`merge mismatch: ${JSON.stringify({localA,localC,inheritedA,newerManualC,afterA,afterC,remoteA:remoteRecord(remoteA),remoteC:remoteRecord(remoteC),sync:sync.transport})}`);
  state.merge = { keyA, keyC, localA, localC, inheritedA, newerManualC, afterA, afterC, retainedManual, adoptedIndependent, uploadedBoth, transport: sync.transport, remoteAfter: uploaded };
  return JSON.stringify({ status: 'PASS', keyA, keyC, localA, localC, inheritedA, newerManualC, afterA, afterC, retainedManual, adoptedIndependent, uploadedBoth, transport: sync.transport, remoteItems: remoteItems.length }, null, 1);
})();
