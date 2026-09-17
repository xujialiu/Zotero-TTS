return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const p = Services.prefs;
  const key = name => 'extensions.zotero.zotero-tts.' + name;
  const getBool = name => p.getBoolPref(key(name));
  const setBool = (name, value) => p.setBoolPref(key(name), !!value);
  const readers = () => Zotero.Reader._readers || [];
  const byItem = itemID => { for (const r of readers()) if (r?.itemID === itemID) return r; return null; };
  const titleOf = itemID => { try { const i = Zotero.Items.get(itemID); return i?.parentItem?.title || i?.getField?.('title') || String(itemID); } catch { return String(itemID); } };
  const waitFor = async (fn, ms = 10000, step = 100) => {
    const end = Date.now() + ms; let last = null;
    while (Date.now() < end) { last = fn(); if (last) return last; await sleep(step); }
    return null;
  };
  const pane = async () => {
    let win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) { Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); for (let i = 0; i < 80 && !win; i++) { await sleep(100); win = Services.wm.getMostRecentWindow('zotero:pref'); } }
    if (!win) throw new Error('settings window is missing');
    try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch {}
    await waitFor(() => win.document.getElementById('ztts-enable-local'), 10000, 100);
    if (!win.document.getElementById('ztts-enable-local')) throw new Error('Zotero-TTS pane is not ready');
    return win;
  };
  const dialog = async (doc, ms = 10000) => await waitFor(() => doc.getElementById('ztts-notice'), ms, 50);
  const dialogEvidence = d => ({
    text: [...d.querySelectorAll('div')].map(x => String(x.textContent || '').trim()).filter(Boolean),
    buttons: [...d.querySelectorAll('button')].map(x => String(x.textContent || '').trim()),
  });
  const closeDialog = async (doc, d) => { try { d?.querySelector('button')?.click(); } catch {} await waitFor(() => !doc.getElementById('ztts-notice'), 5000, 50); };
  const clickText = (doc, selector, test) => {
    for (const b of doc.querySelectorAll(selector + ' button')) if (test(String(b.textContent || '').trim(), b)) { b.click(); return b; }
    return null;
  };
  const waitPref = async (name, wanted, ms = 12000) => await waitFor(() => getBool(name) === wanted, ms, 100);
  const voiceInfo = entry => {
    const m = entry.manager;
    let voice = null;
    try { voice = m?._voice; } catch {}
    return { id: m?.selectedVoiceID || null, label: String(voice?.label || voice?.name || voice?.id || m?.selectedVoiceID || ''), tier: m?._selectedTier || null };
  };
  const stateOf = entry => {
    const m = entry.manager, c = m?._controller;
    return { active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null, tier: m?._selectedTier || null,
      position: Number.isFinite(c?._position) ? Number(c._position) : null };
  };
  const idList = value => { try { const x = JSON.parse(value || '[]'); return Array.isArray(x) ? x.map(String) : []; } catch { return []; } };
  const favoriteString = () => p.getStringPref(key('readAloud.favoriteVoices'), '');
  const hasFavorite = id => idList(favoriteString()).includes(id);
  const markSettingsVoice = async (doc, providerText, localeText, voiceLabel) => {
    let b = clickText(doc, '#ztts-voices-tiers', (t) => t.startsWith(providerText));
    if (!b) throw new Error('settings provider column missing: ' + providerText);
    await sleep(120);
    b = clickText(doc, '#ztts-voices-locales', (t) => t.includes(localeText));
    if (!b) throw new Error('settings locale column missing: ' + localeText);
    await sleep(120);
    let target = null;
    for (const row of doc.querySelectorAll('#ztts-voices-list > div')) {
      const buttons = row.querySelectorAll('button');
      if (buttons.length >= 3 && String(buttons[2].textContent || '').trim() === voiceLabel) { target = buttons[1]; break; }
    }
    if (!target) throw new Error('settings voice row missing: ' + voiceLabel);
    const before = { glyph: String(target.textContent || '').trim(), pressed: target.getAttribute('aria-pressed') };
    if (before.glyph !== '♥' && before.pressed !== 'true') target.click();
    await waitFor(() => hasFavorite('local::' + voiceLabel), 4000, 100);
    return { before, after: { glyph: String(target.textContent || '').trim(), pressed: target.getAttribute('aria-pressed'), marked: hasFavorite('local::' + voiceLabel) } };
  };
  const unmarkSettingsVoice = async (doc, providerText, localeText, voiceLabel) => {
    clickText(doc, '#ztts-voices-tiers', t => t.startsWith(providerText)); await sleep(120);
    clickText(doc, '#ztts-voices-locales', t => t.includes(localeText)); await sleep(120);
    for (const row of doc.querySelectorAll('#ztts-voices-list > div')) {
      const buttons = row.querySelectorAll('button');
      if (buttons.length >= 3 && String(buttons[2].textContent || '').trim() === voiceLabel) { buttons[1].click(); return buttons[1]; }
    }
    throw new Error('settings voice row missing for unmark: ' + voiceLabel);
  };
  const playerFrame = entry => entry.reader?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const playerFavorite = async (entry, voiceLabel) => {
    const doc = playerFrame(entry); if (!doc) throw new Error('plugin player frame is missing');
    const trigger = doc.querySelector('button[data-pick="voice"]'); if (!trigger) throw new Error('plugin voice picker is missing');
    trigger.click();
    const pop = await waitFor(() => doc.querySelector('.picker-popover'), 3000, 50); if (!pop) throw new Error('plugin voice picker did not open');
    let heart = null;
    for (const row of pop.querySelectorAll('.option-row')) {
      const option = row.querySelector('.option');
      if (String(option?.textContent || '').trim() === voiceLabel) { heart = row.querySelector('.favorite-heart'); break; }
    }
    if (!heart) throw new Error('plugin voice heart is missing: ' + voiceLabel);
    const before = { glyph: String(heart.textContent || '').trim(), pressed: heart.getAttribute('aria-pressed') };
    if (before.glyph !== '♥' && before.pressed !== 'true') heart.click();
    await waitFor(() => hasFavorite(entry.manager.selectedVoiceID), 4000, 100);
    trigger.click();
    return { before, after: { glyph: String(heart.textContent || '').trim(), pressed: heart.getAttribute('aria-pressed'), marked: hasFavorite(entry.manager.selectedVoiceID) } };
  };
  const out = { status: 'FAIL', rows: [], diagnostics: {}, errors: [] };
  let paneWin = null, originalFish = null, originalFavoritesOnly = null;
  try {
    const opened = state.opened || [];
    if (opened.length !== 2) throw new Error('fixture state is missing two opened readers');
    const A = opened[0], B = opened[1];
    const mA = A.manager, mB = B.manager;
    originalFish = getBool('fish.enabled'); originalFavoritesOnly = getBool('readAloud.favoritesOnly');
    paneWin = await pane(); const doc = paneWin.document;
    // The setup script leaves both fixtures on Kokoro. If a probe was
    // interrupted after a later handoff, restore B to that safe starting
    // point before exercising Fish as the unused provider.
    if (mB.selectedVoiceID !== state.fixtureVoice) {
      mB.selectTier('kokoro'); mB.selectVoice(state.fixtureVoice || 'local::af_bella');
      await waitFor(() => mB.active && mB.paused && mB.selectedVoiceID === (state.fixtureVoice || 'local::af_bella'), 15000, 100);
    }
    const beforeA = { ...stateOf(A), controller: mA._controller, catalog: mA._allVoices };
    const beforeB = { ...stateOf(B), controller: mB._controller, catalog: mB._allVoices };

    // Safe unused-provider UI change: both fixtures currently use Kokoro.
    const fishButton = doc.getElementById('ztts-enable-fish');
    if (!fishButton) throw new Error('Fish switch is missing');
    const fishStart = { enabled: getBool('fish.enabled'), label: fishButton.getAttribute('label') };
    if (!fishStart.enabled) throw new Error('Fish was not enabled for the unused-provider check');
    fishButton.click();
    const fishDisabled = await waitPref('fish.enabled', false, 15000);
    const disableSafe = { applied: fishDisabled, notice: !!doc.getElementById('ztts-notice'), A: stateOf(A), B: stateOf(B) };
    if (!fishDisabled || disableSafe.notice || !disableSafe.A.active || !disableSafe.A.paused || !disableSafe.B.active || !disableSafe.B.paused) throw new Error('unused Fish disable was not safe: ' + JSON.stringify(disableSafe));
    fishButton.click();
    const fishEnabled = await waitPref('fish.enabled', true, 30000);
    const fishReenable = { applied: fishEnabled, label: fishButton.getAttribute('label'), result: doc.getElementById('ztts-test-result-fish')?.textContent || '' };
    if (!fishEnabled) throw new Error('configured Fish could not be re-enabled: ' + JSON.stringify(fishReenable));
    await sleep(800);
    const afterSafe = { A: stateOf(A), B: stateOf(B), sameControllers: mA._controller === beforeA.controller && mB._controller === beforeB.controller,
      sameVoices: mA.selectedVoiceID === beforeA.voice && mB.selectedVoiceID === beforeB.voice };
    if (!afterSafe.sameControllers || !afterSafe.sameVoices) throw new Error('unused provider changed a fixture session: ' + JSON.stringify(afterSafe));
    out.rows.push({ check: 'unused provider', fishStart, disableSafe: { applied: fishDisabled, active: [disableSafe.A.active, disableSafe.B.active], paused: [disableSafe.A.paused, disableSafe.B.paused] }, reenable: fishReenable, controllerIdentity: afterSafe.sameControllers, selectedVoiceIdentity: afterSafe.sameVoices, status: 'PASS' });

    // Make the second paused reader use a Fish voice, then leave its tab in
    // the background. The first reader remains on configured Kokoro.
    let fishID = null;
    for (let i = 0; i < (mB._allVoices?.length || 0); i++) { const id = mB._allVoices[i]?.id; if (typeof id === 'string' && /^fish::en\//.test(id)) { fishID = id; break; } }
    if (!fishID) throw new Error('Fish English fixture voice is missing after re-enable');
    mB.selectTier('fish'); mB.selectVoice(fishID);
    await waitFor(() => mB.active && mB.paused && String(mB.selectedVoiceID || '').startsWith('fish::'), 15000, 100);
    if (!mB.active || !mB.paused || !String(mB.selectedVoiceID || '').startsWith('fish::')) throw new Error('second fixture did not move to Fish');
    const main = Zotero.getMainWindow?.(); main?.Zotero_Tabs?.select(A.tabID);
    await sleep(200);
    const titles = { A: titleOf(A.itemID), B: titleOf(B.itemID) };
    const impactFish = JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact(JSON.stringify({ 'fish.enabled': false })));
    const impactUnrelated = JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact(JSON.stringify({ 'readAloud.favoriteVoices': favoriteString() + '[]' })));
    const fishAffected = impactFish.affected || [];
    if (fishAffected.length !== 1 || fishAffected[0] !== titles.B) throw new Error('background/paused impact mismatch: ' + JSON.stringify({ impactFish, titles }));
    if ((impactUnrelated.affected || []).length !== 0) throw new Error('unrelated edit was reported as affecting a session: ' + JSON.stringify(impactUnrelated));
    out.rows.push({ check: 'background and paused', sessions: impactFish.sessions, fishChangeAffected: fishAffected, unrelatedAffected: impactUnrelated.affected || [], selectedTab: main?.Zotero_Tabs?.selectedID || null, backgroundTab: B.tabID, status: 'PASS' });

    // Used-provider UI refusal: local is used by A, Fish by background B.
    const localButton = doc.getElementById('ztts-enable-local');
    const localBefore = { enabled: getBool('local.enabled'), label: localButton?.getAttribute('label'), A: stateOf(A), B: stateOf(B) };
    localButton.click();
    const dLocal = await dialog(doc, 8000);
    if (!dLocal) throw new Error('used Kokoro switch did not show an in-pane notice');
    const localDialog = dialogEvidence(dLocal);
    const localDuring = { pref: getBool('local.enabled'), label: localButton.getAttribute('label'), A: stateOf(A), B: stateOf(B) };
    const okOnly = localDialog.buttons.length === 1 && !localDialog.buttons.some(t => /stop|continue/i.test(t));
    if (!localDuring.pref || !okOnly || !localDialog.text.some(t => t.includes(titles.A)) || !localDuring.A.active || !localDuring.A.paused) throw new Error('used provider refusal mismatch: ' + JSON.stringify({ localBefore, localDialog, localDuring }));
    await closeDialog(doc, dLocal);
    const localRefusal = { localDialog, prefStayedTrue: getBool('local.enabled'), playerStayed: { A: stateOf(A), B: stateOf(B) } };
    out.rows.push({ check: 'used provider', affected: [titles.A], ...localRefusal, status: 'PASS' });

    // The settings browser can change an unrelated favorite while sessions
    // read. Mark the local current voice and a second local voice through it.
    const localLabel = String(mA._voice?.label || mA._voice?.name || 'af_bella');
    const browserCurrent = await markSettingsVoice(doc, 'Kokoro', 'English (United States)', localLabel);
    let browserOther = null;
    for (const candidate of ['af_heart', 'af_alloy', 'af_aoede']) {
      if (candidate === localLabel || hasFavorite('local::' + candidate)) continue;
      try { browserOther = await markSettingsVoice(doc, 'Kokoro', 'English (United States)', candidate); break; } catch {}
    }
    if (!browserOther) throw new Error('could not mark an unrelated Kokoro voice in settings browser');
    // Exercise the plugin player's own favorite control on the background
    // Fish reader; the player remains active and paused throughout.
    const fishLabel = String(mB._voice?.label || mB._voice?.name || mB.selectedVoiceID);
    const playerCurrent = await playerFavorite(B, fishLabel);
    // A voice switch may still be preparing when the paused session is
    // inspected. The guard protects both sides of that handoff, so mark all
    // protected fixture voices before testing the allowed filter enable.
    const protectedNow = JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact('{}'));
    const protectedMarked = [];
    for (const session of protectedNow.sessions || []) {
      for (const voice of session.voices || []) {
        if (hasFavorite(voice.id)) { protectedMarked.push({ id: voice.id, already: true }); continue; }
        if (voice.id.startsWith('local::')) {
          const label = voice.id.slice('local::'.length);
          try { await markSettingsVoice(doc, 'Kokoro', 'English (United States)', label); protectedMarked.push({ id: voice.id, via: 'settings' }); } catch (e) { throw new Error('could not mark protected Kokoro handoff voice ' + voice.id + ': ' + String(e)); }
        } else if (voice.id.startsWith('fish::')) {
          let label = voice.id;
          for (let i = 0; i < (mB._allVoices?.length || 0); i++) if (mB._allVoices[i]?.id === voice.id) { label = String(mB._allVoices[i]?.label || mB._allVoices[i]?.name || voice.id); break; }
          await playerFavorite(B, label); protectedMarked.push({ id: voice.id, via: 'player' });
        }
      }
    }
    const markedCurrent = hasFavorite(mA.selectedVoiceID) && hasFavorite(mB.selectedVoiceID);
    if (!markedCurrent || protectedNow.sessions?.some(s => s.voices?.some(v => !hasFavorite(v.id)))) throw new Error('protected voices were not all marked: ' + JSON.stringify({ local: mA.selectedVoiceID, fish: mB.selectedVoiceID, protectedNow, favoritesChars: favoriteString().length }));

    const favoriteBox = doc.getElementById('ztts-favorites-only');
    if (!favoriteBox) throw new Error('favorites-only checkbox is missing');
    const setFavoritesOnlyUi = async wanted => {
      if (getBool('readAloud.favoritesOnly') === wanted) return true;
      favoriteBox.checked = wanted;
      favoriteBox.doCommand();
      return !!await waitPref('readAloud.favoritesOnly', wanted, 8000);
    };
    await setFavoritesOnlyUi(true);
    const favoritesOn = await waitPref('readAloud.favoritesOnly', true, 5000);
    const onState = { applied: favoritesOn, pref: getBool('readAloud.favoritesOnly'), A: stateOf(A), B: stateOf(B), markedCurrent };
    if (!favoritesOn || !onState.A.active || !onState.A.paused || !onState.B.active || !onState.B.paused) throw new Error('favorites-only did not apply safely: ' + JSON.stringify(onState));

    // Unmarking a current voice while the filter is on is refused with the
    // same OK-only notice; no preference or playback state may move.
    const unmarkStart = { favorites: favoriteString(), A: stateOf(A), B: stateOf(B) };
    await unmarkSettingsVoice(doc, 'Kokoro', 'English (United States)', localLabel);
    const dUnmark = await dialog(doc, 8000);
    if (!dUnmark) throw new Error('unmarking a current voice did not show a notice');
    const unmarkDialog = dialogEvidence(dUnmark), unmarkDuring = { favorites: favoriteString(), A: stateOf(A), B: stateOf(B), pref: getBool('readAloud.favoritesOnly') };
    if (unmarkDialog.buttons.length !== 1 || !unmarkDialog.text.some(t => t.includes(titles.A)) || unmarkDuring.favorites !== unmarkStart.favorites || !unmarkDuring.A.active || !unmarkDuring.A.paused) throw new Error('current unmark refusal mismatch: ' + JSON.stringify({ unmarkDialog, unmarkStart, unmarkDuring }));
    await closeDialog(doc, dUnmark);

    // Narrowing off is allowed; removing the current favorite then makes the
    // next attempt to enable the filter refuse as a whole.
    await setFavoritesOnlyUi(false);
    await unmarkSettingsVoice(doc, 'Kokoro', 'English (United States)', localLabel);
    const unmarked = await waitFor(() => !hasFavorite(mA.selectedVoiceID), 4000, 100);
    if (!unmarked) throw new Error('current voice could not be unmarked with filter off');
    favoriteBox.checked = true;
    favoriteBox.doCommand();
    const dEnableUnmarked = await dialog(doc, 8000);
    if (!dEnableUnmarked) throw new Error('enabling favorites-only over an unmarked current voice did not refuse');
    const enableUnmarkedDialog = dialogEvidence(dEnableUnmarked), enableUnmarkedDuring = { pref: getBool('readAloud.favoritesOnly'), favorites: favoriteString(), A: stateOf(A), B: stateOf(B) };
    if (enableUnmarkedDialog.buttons.length !== 1 || !enableUnmarkedDialog.text.some(t => t.includes(titles.A)) || enableUnmarkedDuring.pref || !enableUnmarkedDuring.A.active || !enableUnmarkedDuring.A.paused) throw new Error('unmarked enable refusal mismatch: ' + JSON.stringify({ enableUnmarkedDialog, enableUnmarkedDuring }));
    await closeDialog(doc, dEnableUnmarked);
    // Restore the fixture's current local favorite before the next script.
    await markSettingsVoice(doc, 'Kokoro', 'English (United States)', localLabel);
    out.rows.push({ check: 'favorites filter', settingsCurrent: browserCurrent, settingsOther: browserOther, playerCurrent, protectedMarked, enable: onState, unmarkCurrent: { dialog: unmarkDialog, prefUnchanged: unmarkDuring.favorites === unmarkStart.favorites }, enableOverUnmarked: { dialog: enableUnmarkedDialog, prefStayedOff: !enableUnmarkedDuring.pref }, restoredCurrent: hasFavorite(mA.selectedVoiceID), status: 'PASS' });
    setBool('readAloud.favoritesOnly', originalFavoritesOnly);
    await sleep(500);
    out.diagnostics.readingImpact = JSON.parse(await Zotero.ZoteroTTS.diagnostics.readingImpact(JSON.stringify({ 'local.enabled': false, 'fish.enabled': false })));
    out.diagnostics.liveVoiceList = JSON.parse(await Zotero.ZoteroTTS.diagnostics.liveVoiceList());
    out.status = 'PASS';
    return JSON.stringify(out, null, 1);
  } catch (error) {
    out.error = String(error);
    out.stack = error?.stack ? String(error.stack).split('\n').slice(0, 5).join(' | ') : null;
    throw new Error(JSON.stringify(out));
  } finally {
    // Never leave the filter on, and close any pane dialog. The provider and
    // Kokoro changes are restored by the final teardown script, even when a
    // later row fails.
    try { const d = paneWin?.document?.getElementById('ztts-notice'); if (d) d.close(); } catch {}
    if (originalFavoritesOnly !== null) { try { setBool('readAloud.favoritesOnly', originalFavoritesOnly); } catch {} }
    try { const host = Services.wm.getMostRecentWindow('navigator:browser'); if (host && host.windowState !== 2) host.minimize(); } catch {}
  }
})()
