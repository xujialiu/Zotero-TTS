return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs, prefix = 'extensions.zotero.zotero-tts.';
  const K = n => prefix + n;
  const read = name => {
    const key = K(name), type = p.getPrefType(key), user = p.prefHasUserValue(key);
    let value = null; try { value = type === p.PREF_BOOL ? p.getBoolPref(key) : type === p.PREF_INT ? p.getIntPref(key) : type === p.PREF_STRING ? p.getStringPref(key) : null; } catch {}
    return { key, type, user, value };
  };
  const restore = rec => {
    if (!rec) return;
    if (!rec.user) { if (p.prefHasUserValue(rec.key)) p.clearUserPref(rec.key); return; }
    if (rec.type === p.PREF_BOOL) p.setBoolPref(rec.key, !!rec.value);
    else if (rec.type === p.PREF_INT) p.setIntPref(rec.key, Number(rec.value));
    else if (rec.type === p.PREF_STRING) p.setStringPref(rec.key, String(rec.value));
  };
  const waitFor = async (fn, ms = 10000, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); } return null; };
  const readerBy = itemID => { for (const r of Zotero.Reader._readers || []) if (r?.itemID === itemID) return r; return null; };
  const pane = async () => {
    let w = Services.wm.getMostRecentWindow('zotero:pref');
    if (!w) { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); for (let i = 0; i < 80 && !w; i++) { await sleep(100); w = Services.wm.getMostRecentWindow('zotero:pref'); } }
    if (!w) throw new Error('settings window missing');
    try { await w.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    await waitFor(() => w.document.getElementById('ztts-enable-local'), 10000, 100);
    return w;
  };
  const opened = state.opened || [];
  if (opened.length !== 2) throw new Error('fixtures missing for settings sync');
  const A = opened[0], B = opened[1], mA = A.manager, mB = B.manager;
  const extra = { localVoice: read('local.voice'), compatibleVoices: read('compatible.voices'), shortcut: read('shortcuts.toggleOptions'), syncSettings: read('webdav.syncSettings'), syncState: (() => { const key = K('webdav.syncState'), type = p.getPrefType(key), user = p.prefHasUserValue(key); let value = null; try { if (type === p.PREF_STRING) value = p.getStringPref(key); } catch {} return { key, type, user, value }; })() };
  const out = { status: 'FAIL', rows: [], errors: [] };
  let sandbox = null, oldFetch = null, server = null, paneWin = null;
  try {
    const reopenPaused = async entry => {
      if (entry.manager.active) return;
      try { const host = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser'); host?.restore?.(); host?.focus?.(); host?.Zotero_Tabs?.select(entry.tabID); entry.reader.focus?.(); entry.reader._iframeWindow?.focus?.(); } catch {}
      try { entry.internal.toggleReadAloudPopup(true); } catch (e) { throw new Error('could not reopen fixture for sync: ' + String(e)); }
      const ready = await waitFor(() => { if (entry.manager.active && !entry.manager.paused) { try { entry.manager.pause?.(); } catch {} } return entry.manager.active && entry.manager.paused && entry.manager._controller; }, 24000, 100);
      if (!ready) throw new Error('reopened fixture did not become paused: ' + JSON.stringify({ itemID: entry.itemID, active: !!entry.manager.active, paused: !!entry.manager.paused }));
    };
    await reopenPaused(A); await reopenPaused(B);
    const quiescent = await waitFor(() => {
      try { return JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync()).transport?.running === false; } catch { return null; }
    }, 20000, 150);
    if (!quiescent) throw new Error('a prior settings-sync flight did not settle before the controlled transport was installed');
    // The full case assigns B to Fish in the background-impact step. This
    // focused sync supplement starts from 00/01 alone, so make that fixture
    // separation explicitly before deferring A's Kokoro section.
    if (!String(mB.selectedVoiceID || '').startsWith('fish::')) {
      let fishID = null;
      for (let i = 0; i < (mB._allVoices?.length || 0); i++) { const id = String(mB._allVoices[i]?.id || ''); if (/^fish::en\//.test(id)) { fishID = id; break; } }
      if (!fishID) throw new Error('Fish fixture voice is missing before sync supplement');
      try { mB.selectTier('fish'); mB.selectVoice(fishID); } catch (e) { throw new Error('could not switch B to Fish for sync supplement: ' + String(e)); }
      try { B.reader._iframeWindow?.document?.notifyUserGestureActivation?.(); mB.play?.(); } catch {}
      const moved = await waitFor(() => mB.selectedVoiceID === fishID && mB.active && !mB.paused, 15000, 100);
      if (!moved) throw new Error('B did not settle on Fish before sync supplement: ' + JSON.stringify({ selected: mB.selectedVoiceID, fishID, active: !!mB.active, paused: !!mB.paused }));
      await sleep(300);
      try { mB.pause?.(); } catch { try { mB.togglePaused?.(); } catch {} }
      await sleep(120);
    }
    paneWin = await pane();
    const now = Date.now() + 120000;
    const currentShortcut = String(extra.shortcut.value || 'Shift+O');
    const remoteLocalVoice = String(extra.localVoice.value || 'af_bella') === 'af_bella' ? 'af_nic' : 'af_bella';
    const remoteCompatibleVoice = 'reading-guard-unused-provider-' + Date.now();
    const remoteShortcut = currentShortcut === 'Shift+Q' ? 'Shift+R' : 'Shift+Q';
    const remoteText = JSON.stringify({ format: 'zotero-tts-shared-settings', version: 1, items: [
      { key: 'local.voice', value: remoteLocalVoice, ts: now + 1, by: 'reading-guard-fixture' },
      { key: 'compatible.voices', value: remoteCompatibleVoice, ts: now + 2, by: 'reading-guard-fixture' },
      { key: 'shortcuts.toggleOptions', value: remoteShortcut, ts: now + 3, by: 'reading-guard-fixture' },
    ] });
    server = { remoteText, text: remoteText, requests: [], uploads: [] };
    sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
    oldFetch = sandbox.fetch;
    const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: () => body });
    sandbox.fetch = function(input, init) {
      const method = String(init?.method || 'GET').toUpperCase(), url = String(input);
      const relevant = /zotero-tts-shared-settings\.json(?:$|\?)/.test(url);
      if (!relevant) return Reflect.apply(oldFetch, sandbox, [input, init]);
      server.requests.push({ method, target: url.replace(/^https?:\/\/[^/]+/i, '') });
      if (method === 'GET') return response(200, server.text);
      if (method === 'PUT') {
        const body = typeof init?.body === 'string' ? init.body : '';
        server.uploads.push({ chars: body.length, keys: (() => { try { return (JSON.parse(body).items || []).map(x => String(x.key)); } catch { return []; } })() });
        server.text = body;
        return response(200, '');
      }
      return response(405, '');
    };
    const before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync());
    const beforeSyncs = Number(before.transport?.syncs || 0);
    const beforeAt = Number(before.transport?.lastAt || 0);
    const oldLocal = String(extra.localVoice.value || '');
    p.setBoolPref(K('webdav.syncSettings'), true);
    const synced = await waitFor(() => {
      try {
        const d = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync()), s = d.transport || {};
        const applied = s.lastApplied?.applied || [];
        return s.syncs > beforeSyncs && Number(s.lastAt || 0) > beforeAt && s.remoteItems === 3 && server.requests.length > 0 && s.running === false
          && applied.includes('compatible.voices') && applied.includes('shortcuts.toggleOptions')
          && String(p.getStringPref(K('compatible.voices'))) === remoteCompatibleVoice
          && String(p.getStringPref(K('shortcuts.toggleOptions'))) === remoteShortcut
          && (s.lastOutcome === 'deferred' || Number(s.deferred || 0) > 0) ? d : null;
      } catch { return null; }
    }, 30000, 150);
    if (!synced) throw new Error('controlled settings sync did not complete with a deferred group: ' + JSON.stringify({ before, requests: server.requests }));
    const s1 = synced.transport || {};
    const appliedKeys = s1.lastApplied?.applied || [];
    const deferredCount = Number(s1.lastApplied?.deferred ?? s1.deferred ?? 0);
    const localAfterSync = String(p.getStringPref(K('local.voice')));
    const compatibleAfterSync = String(p.getStringPref(K('compatible.voices')));
    const shortcutAfterSync = String(p.getStringPref(K('shortcuts.toggleOptions')));
    const syncRow = { check: 'background sync', remote: { groups: ['local', 'compatible', 'shortcut'], valueLengths: { localVoice: remoteLocalVoice.length, compatibleVoices: remoteCompatibleVoice.length, shortcut: remoteShortcut.length } },
      requests: server.requests, uploaded: server.uploads.map(x => ({ chars: x.chars, keys: x.keys })), stats: s1,
      appliedKeys, deferredCount, localVoice: { before: oldLocal, after: localAfterSync, expectedDeferred: remoteLocalVoice },
      unusedProviderApplied: compatibleAfterSync === remoteCompatibleVoice, shortcutApplied: shortcutAfterSync === remoteShortcut,
      fixtureStateWhileDeferred: { A: { active: !!mA.active, paused: !!mA.paused, voice: mA.selectedVoiceID || null }, B: { active: !!mB.active, paused: !!mB.paused, voice: mB.selectedVoiceID || null } } };
    if (localAfterSync !== oldLocal || compatibleAfterSync !== remoteCompatibleVoice || shortcutAfterSync !== remoteShortcut || !appliedKeys.includes('compatible.voices') || !appliedKeys.includes('shortcuts.toggleOptions') || appliedKeys.includes('local.voice') || deferredCount < 1) throw new Error('background sync grouping mismatch: ' + JSON.stringify(syncRow));
    // A paused player is still a held session: waiting after the paused
    // state does not release the deferred local section.
    await sleep(1200);
    const pausedHold = { localVoice: String(p.getStringPref(K('local.voice'))), deferred: Number((JSON.parse(await Zotero.ZoteroTTS.diagnostics.settingsSync())).transport?.deferred || 0), active: !!mA.active, paused: !!mA.paused };
    if (pausedHold.localVoice !== oldLocal || !pausedHold.active || !pausedHold.paused) throw new Error('paused session released deferred sync: ' + JSON.stringify(pausedHold));
    // Close only A's player; the reader tab stays open. Its deactivate hook
    // pokes the same settings transport and applies the deferred section.
    const aTab = A.tabID;
    try { A.internal.toggleReadAloudPopup(false); } catch (e) { throw new Error('could not close A player for deferred apply: ' + String(e)); }
    const closedA = await waitFor(() => !mA.active, 8000, 100);
    const appliedAfterClose = await waitFor(() => {
      try {
        const value = String(p.getStringPref(K('local.voice'))), d = JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsSync()), s = d.transport || {};
        return value === remoteLocalVoice && s.running === false && (s.lastApplied?.applied || []).includes('local.voice') ? d : null;
      } catch { return null; }
    }, 30000, 150);
    const aStillTab = !!readerBy(A.itemID) && readerBy(A.itemID)?.tabID === aTab;
    const closeRow = { afterClose: { closedA, tabStillOpen: aStillTab, active: !!mA.active, paused: !!mA.paused }, localVoice: String(p.getStringPref(K('local.voice'))), expected: remoteLocalVoice, stats: appliedAfterClose?.transport || null, finalApplied: appliedAfterClose?.transport?.lastApplied || null, B: { active: !!mB.active, paused: !!mB.paused, voice: mB.selectedVoiceID || null } };
    if (!closedA || !aStillTab || !appliedAfterClose || closeRow.stats?.running !== false || !(closeRow.stats?.lastApplied?.applied || []).includes('local.voice') || closeRow.localVoice !== remoteLocalVoice || !mB.active || !mB.paused) throw new Error('deferred settings were not fully settled after closing A player: ' + JSON.stringify(closeRow));
    out.rows.push({ check: 'background sync', status: 'PASS', initial: syncRow, pausedHold, close: closeRow });
    out.rows.push({ check: 'restore', status: 'NOT TESTABLE', reason: 'File picker and native confirmation are blocking native dialogs; case specifies unit-only coverage.', combinedImpact: JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact(JSON.stringify({ 'local.voice': 'restore-affecting', 'compatible.voices': 'restore-unrelated', 'shortcuts.toggleOptions': 'restore-shortcut' }))), nativePromptDriven: false });
    out.status = 'PASS';
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error); out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  } finally {
    try { if (sandbox && oldFetch) sandbox.fetch = oldFetch; } catch {}
    try { p.setBoolPref(K('webdav.syncSettings'), false); } catch {}
    try { restore(extra.localVoice); restore(extra.compatibleVoices); restore(extra.shortcut); restore(extra.syncState); restore(extra.syncSettings); } catch {}
    try { const host = Services.wm.getMostRecentWindow('navigator:browser'); if (host && host.windowState !== 2) host.minimize(); } catch {}
  }
})()
