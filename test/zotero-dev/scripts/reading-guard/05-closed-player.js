return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state, sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs, K = n => 'extensions.zotero.zotero-tts.' + n;
  const getBool = n => p.getBoolPref(K(n));
  const setBool = (n, v) => p.setBoolPref(K(n), !!v);
  const read = name => { const key = K(name), type = p.getPrefType(key), user = p.prefHasUserValue(key); let value = null; try { value = type === p.PREF_BOOL ? p.getBoolPref(key) : type === p.PREF_INT ? p.getIntPref(key) : type === p.PREF_STRING ? p.getStringPref(key) : null; } catch {} return { key, type, user, value }; };
  const restore = rec => { if (!rec) return; if (!rec.user) { if (p.prefHasUserValue(rec.key)) p.clearUserPref(rec.key); return; } if (rec.type === p.PREF_BOOL) p.setBoolPref(rec.key, !!rec.value); else if (rec.type === p.PREF_INT) p.setIntPref(rec.key, Number(rec.value)); else if (rec.type === p.PREF_STRING) p.setStringPref(rec.key, String(rec.value)); };
  const waitFor = async (fn, ms = 10000, step = 100) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); } return null; };
  const readerFor = id => { for (const r of Zotero.Reader._readers || []) if (r?.itemID === id) return r; return null; };
  const opened = state.opened || []; if (opened.length !== 2) throw new Error('fixtures missing for closed-player check');
  const A = opened[0], B = opened[1], mA = A.manager, mB = B.manager;
  const before = { localEnabled: read('local.enabled'), memory: read('readAloud.memory') };
  const out = { status: 'FAIL', rows: [], errors: [] };
  let win = null;
  try {
    win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); for (let i = 0; i < 80 && !win; i++) { await sleep(100); win = Services.wm.getMostRecentWindow('zotero:pref'); } }
    if (!win) throw new Error('settings window missing');
    try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    const doc = win.document, localButton = doc.getElementById('ztts-enable-local');
    if (!localButton) throw new Error('Kokoro switch missing');
    const desiredLocal = 'local::af_bella';
    // The previous sync/handoff may have left the closed reader's native
    // remembered voice on Fish. Seed a known Kokoro voice explicitly before
    // closing it, so the following disable really removes the provider that
    // the stale list is expected to contain.
    try { const x = JSON.parse(p.getStringPref(K('readAloud.memory')) || '{}'); x.voice = { id: desiredLocal, lang: 'en' }; p.setStringPref(K('readAloud.memory'), JSON.stringify(x)); } catch {}
    // Populate a real cached list before closing A, so the following provider
    // edit has a stale-list candidate to invalidate.
    if (!mA.active) {
      try { const host = Zotero.getMainWindow?.(); host?.restore?.(); host?.focus?.(); host?.Zotero_Tabs?.select(A.tabID); A.reader.focus?.(); A.reader._iframeWindow?.focus?.(); } catch {}
      try { A.internal.toggleReadAloudPopup(true); } catch (e) { throw new Error('could not open A to seed cached list: ' + String(e)); }
      const ready = await waitFor(() => { if (mA.active && !mA.paused) { try { mA.togglePaused?.(); } catch {} } return mA.active && mA.paused && mA._controller && mA._allVoices?.length; }, 24000, 100);
      if (!ready) throw new Error('A did not seed a cached list: ' + JSON.stringify({ active: !!mA.active, paused: !!mA.paused, voices: mA._allVoices?.length ?? null }));
    }
    if (mA.selectedVoiceID !== desiredLocal) {
      try { mA.selectTier('kokoro'); mA.selectVoice(desiredLocal); } catch (e) { throw new Error('could not choose Kokoro seed voice: ' + String(e)); }
      try { A.reader._iframeWindow?.document?.notifyUserGestureActivation?.(); mA.play?.(); } catch {}
      const choseLocal = await waitFor(() => mA.selectedVoiceID === desiredLocal && mA.active && !mA.paused, 15000, 100);
      if (!choseLocal) throw new Error('Kokoro seed voice did not commit: ' + JSON.stringify({ selected: mA.selectedVoiceID, active: !!mA.active, paused: !!mA.paused }));
      try { mA.pause?.(); } catch { try { mA.togglePaused?.(); } catch {} }
      await sleep(120);
    }
    if (!mA.active || !mA.paused) { try { mA.togglePaused?.(); } catch {} await sleep(100); }
    const oldID = String(mA.selectedVoiceID || '');
    const oldCatalog = mA._allVoices;
    const oldList = { voice: oldID, count: mA._allVoices?.length ?? 0, popup: !!A.internal?._state?.readAloudState?.popupOpen };
    try { A.internal.toggleReadAloudPopup(false); } catch (e) { throw new Error('could not close A before provider edit: ' + String(e)); }
    const closed = await waitFor(() => !mA.active, 8000, 100);
    if (!closed) throw new Error('A player did not close');
    const staleBefore = { active: !!mA.active, voice: mA.selectedVoiceID || null, count: mA._allVoices?.length ?? 0 };
    // Provider disable is a real settings-pane action. B is Fish, so this
    // edit is allowed while A's player is closed.
    if (getBool('local.enabled')) localButton.click();
    const disabled = await waitFor(() => !getBool('local.enabled'), 12000, 100);
    const cleared = await waitFor(() => (mA._allVoices?.length ?? 0) === 0 && !mA._voice && !mA.selectedVoiceID, 8000, 100);
    const staleAfterDisable = { disabled, listCleared: !!cleared, active: !!mA.active, voice: mA.selectedVoiceID || null, count: mA._allVoices?.length ?? 0, B: { active: !!mB.active, paused: !!mB.paused, voice: mB.selectedVoiceID || null } };
    if (!disabled || !cleared || mA.active || !mB.active || !mB.paused) throw new Error('closed-player invalidation mismatch: ' + JSON.stringify({ oldList, staleBefore, staleAfterDisable }));
    // Re-enable through the actual Kokoro check, then reopen with the voice
    // remembered before closing. The reopened manager must discover fresh
    // choices and resolve that remembered id.
    localButton.click();
    const enabled = await waitFor(() => getBool('local.enabled'), 30000, 150);
    const enableResult = { enabled, label: localButton.getAttribute('label'), result: doc.getElementById('ztts-test-result-local')?.textContent || '' };
    if (!enabled) throw new Error('Kokoro did not re-enable after closed-player edit: ' + JSON.stringify(enableResult));
    let memory = {}; try { memory = JSON.parse(p.getStringPref(K('readAloud.memory')) || '{}'); } catch {}
    memory.voice = { id: oldID, lang: 'en' }; p.setStringPref(K('readAloud.memory'), JSON.stringify(memory));
    const host = Zotero.getMainWindow?.() || Services.wm.getMostRecentWindow('navigator:browser');
    try { host?.restore?.(); host?.focus?.(); host?.Zotero_Tabs?.select(A.tabID); A.reader.focus?.(); A.reader._iframeWindow?.focus?.(); } catch {}
    try { A.internal.toggleReadAloudPopup(true); } catch (e) { throw new Error('reopen after fresh discovery failed: ' + String(e)); }
    const reopened = await waitFor(() => { if (mA.active && !mA.paused) { try { mA.togglePaused?.(); } catch {} } return mA.active && mA.paused && mA._controller && mA._allVoices?.length; }, 30000, 100);
    const fresh = { reopened: !!reopened, active: !!mA.active, paused: !!mA.paused, selectedVoice: mA.selectedVoiceID || null, expectedRememberedVoice: oldID, count: mA._allVoices?.length ?? 0, freshCatalogArray: mA._allVoices !== oldCatalog, popup: !!A.internal?._state?.readAloudState?.popupOpen };
    if (!reopened || fresh.selectedVoice !== oldID || !fresh.freshCatalogArray || fresh.count === 0) throw new Error('reopen resolved a stale or wrong voice list: ' + JSON.stringify({ oldList, staleAfterDisable, enableResult, fresh }));
    out.rows.push({ check: 'closed player', status: 'PASS', oldList, staleBefore, staleAfterDisable, enableResult, fresh, B: { active: !!mB.active, paused: !!mB.paused, voice: mB.selectedVoiceID || null } });
    out.rows.push({ check: 'restore', status: 'NOT TESTABLE', reason: 'Native file picker/confirmation paths are unit-only per case; no blocking prompt was driven.' });
    out.status = 'PASS';
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error); out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  } finally {
    try { restore(before.localEnabled); restore(before.memory); } catch {}
    try { const host = Services.wm.getMostRecentWindow('navigator:browser'); if (host && host.windowState !== 2) host.minimize(); } catch {}
  }
})()
