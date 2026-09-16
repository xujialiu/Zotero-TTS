(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const id = state.fixtures.pdf.id;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readerOf = itemID => { const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i]; return null; };
  const reader = readerOf(id);
  const waitFor = async (test, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(100); } return test(); };
  if (!reader) throw new Error('fixture reader missing');
  const manager = () => reader._internalReader?._readAloudManager;
  const frameOf = () => reader._iframeWindow?.document?.getElementById('ztts-player-frame');
  const snap = () => ({ active: !!manager()?.active, paused: !!manager()?.paused, voice: manager()?.selectedVoiceID || null, speed: Number(manager()?.speed) || null, position: manager()?._controller?._position ?? null });
  const pref = suffix => Zotero.Prefs.get('zotero-tts.' + suffix);
  const settings = Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  if (settings && typeof settings.then === 'function') await settings;
  const win = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref'));
  if (!win) throw new Error('settings window did not open');
  try { await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
  const ready = await waitFor(() => win.document.getElementById('ztts-player-enabled'));
  if (!ready) throw new Error('plugin settings pane did not load');
  const d = win.document;
  const readSettings = () => ({ enabled: !!d.getElementById('ztts-player-enabled')?.checked, layout: d.getElementById('ztts-player-layout')?.value || null, label: d.getElementById('ztts-player-layout-label')?.textContent || null, menu: Array.from(d.querySelectorAll('#ztts-player-layout-menu [data-value]')).map(x => ({ value: x.getAttribute('data-value'), checked: x.getAttribute('aria-checked') })) });
  const before = { prefs: { enabled: pref('readAloud.usePluginPlayer'), layout: pref('readAloud.playerLayout') }, ui: readSettings(), manager: snap() };
  const menuButton = d.getElementById('ztts-player-layout-trigger');
  menuButton?.click(); await sleep(100);
  const floating = d.querySelector('#ztts-player-layout-menu [data-value="B"]');
  floating?.click(); await waitFor(() => pref('readAloud.playerLayout') === 'B');
  const afterSettingsLayout = { settings: readSettings(), manager: snap(), player: JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()) };
  const toggle = d.getElementById('ztts-player-enabled');
  const stateBeforeDisable = snap();
  if (toggle?.checked) toggle.click();
  await waitFor(() => pref('readAloud.usePluginPlayer') === false);
  await sleep(250);
  const frameWhenDisabled = frameOf();
  const disabled = { settings: readSettings(), iconHidden: !!reader._iframeWindow?.document?.getElementById('ztts-player-toggle')?.hidden, frameHidden: !!frameWhenDisabled?.hidden, manager: snap(), sameState: JSON.stringify(stateBeforeDisable) === JSON.stringify(snap()) };
  if (!toggle?.checked) toggle.click();
  await waitFor(() => pref('readAloud.usePluginPlayer') !== false);
  const enabledAgain = { settings: readSettings(), iconHidden: !!reader._iframeWindow?.document?.getElementById('ztts-player-toggle')?.hidden, manager: snap() };
  const reopenedIcon = reader._iframeWindow?.document?.getElementById('ztts-player-toggle');
  if (reopenedIcon && reader._internalReader?._readAloudManager?.active && reader._iframeWindow?.document?.getElementById('ztts-player-frame')?.hidden) reopenedIcon.click();
  await waitFor(() => !reader._iframeWindow?.document?.getElementById('ztts-player-frame')?.hidden);
  const frame = frameOf();
  const child = frame?.contentWindow ? Components.utils.waiveXrays(frame.contentWindow) : null;
  if (!frame || !child) throw new Error('player frame unavailable after settings re-enable');
  const playerDiag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  let openState = null; for (let i = 0; i < (playerDiag.readers || []).length; i++) if (playerDiag.readers[i]?.open) openState = playerDiag.readers[i].state;
  const candidates = openState?.voices || [];
  let candidate = null, candidateLabel = null;
  for (let i = 0; i < candidates.length; i++) if (!openState.favorites.includes(candidates[i].value)) { candidate = candidates[i].value; candidateLabel = candidates[i].label; break; }
  if (!candidate && candidates.length) { candidate = candidates[0].value; candidateLabel = candidates[0].label; }
  const favoriteViaPlayer = async () => {
    const picker = frame.contentDocument?.querySelector('[data-pick="voice"]'); picker?.click(); await sleep(100);
    const rows = frame.contentDocument?.querySelectorAll('.option-row') || [];
    for (let i = 0; i < rows.length; i++) {
      const option = rows[i].querySelector('.option');
      if (option && option.textContent === candidateLabel) { rows[i].querySelector('.favorite-heart')?.click(); return true; }
    }
    return false;
  };
  const favoritesBefore = pref('readAloud.favoriteVoices');
  const clickedOn = await favoriteViaPlayer();
  await waitFor(() => String(pref('readAloud.favoriteVoices')).includes(candidate));
  const favoritesOn = { clicked: clickedOn, pref: pref('readAloud.favoriteVoices'), player: JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()) };
  const browser = { status: d.getElementById('ztts-voices-status')?.textContent || null, tiers: [], locales: [], voices: [] };
  await waitFor(() => !(d.getElementById('ztts-voices-status')?.textContent || '').toLowerCase().includes('listing'));
  const tierColumn = d.getElementById('ztts-voices-tiers');
  const localeColumn = d.getElementById('ztts-voices-locales');
  const voiceColumn = d.getElementById('ztts-voices-list');
  const texts = node => { const out = []; const children = node?.children || []; for (let i = 0; i < children.length; i++) out.push(String(children[i].textContent || '').trim()); return out; };
  browser.tiers = texts(tierColumn); browser.locales = texts(localeColumn); browser.voices = texts(voiceColumn).slice(0, 12);
  let fishTier = null; for (let i = 0; i < (tierColumn?.children?.length || 0); i++) if ((tierColumn.children[i].textContent || '').toLowerCase().includes('fish')) fishTier = tierColumn.children[i];
  fishTier?.click(); await sleep(100);
  let english = null; for (let i = 0; i < (localeColumn?.children?.length || 0); i++) if ((localeColumn.children[i].textContent || '').toLowerCase().startsWith('english')) english = localeColumn.children[i];
  english?.click(); await sleep(150);
  let browserHeartOn = null;
  for (let i = 0; i < (voiceColumn?.children?.length || 0); i++) { const buttons = voiceColumn.children[i].querySelectorAll('button'); if (buttons.length >= 3 && String(buttons[2].textContent || '').trim() === candidateLabel) browserHeartOn = String(buttons[1].textContent || '').trim(); }
  const settingsFavoriteOn = { selectedTier: fishTier?.textContent || null, selectedLocale: english?.textContent || null, candidate, candidateLabel, heart: browserHeartOn, visible: browserHeartOn === '♥' };
  let browserHeart = null;
  for (let i = 0; i < (voiceColumn?.children?.length || 0); i++) { const buttons = voiceColumn.children[i].querySelectorAll('button'); if (buttons.length >= 3 && String(buttons[2].textContent || '').trim() === candidateLabel) { buttons[1].click(); browserHeart = String(buttons[1].textContent || '').trim(); break; } }
  await waitFor(() => !String(pref('readAloud.favoriteVoices')).includes(candidate));
  const favoritesOff = { pref: pref('readAloud.favoriteVoices'), browserHeart, player: JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()) };
  Services.prefs.setBoolPref('extensions.zotero.zotero-tts.readAloud.favoritesOnly', true);
  await sleep(150);
  const frame2 = frameOf(); const child2 = frame2?.contentWindow ? Components.utils.waiveXrays(frame2.contentWindow) : null;
  let guardError = null;
  if (child2 && candidate) { child2.zttsCommand('favorite', candidate); await sleep(700); const pd = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()); for (let i = 0; i < (pd.readers || []).length; i++) if (pd.readers[i]?.open) guardError = { actionError: pd.readers[i].actionError, stateError: pd.readers[i].state?.error }; }
  const guard = { favoritesOnly: pref('readAloud.favoritesOnly'), error: guardError, statusVisible: !frame2?.contentDocument?.querySelector('.status-button')?.hidden, statusTitle: frame2?.contentDocument?.querySelector('.status-button')?.title || null };
  // A search field owns keyboard focus; Shift+C must not change reading speed.
  Services.prefs.setBoolPref('extensions.zotero.zotero-tts.readAloud.favoritesOnly', false);
  const frame3 = frameOf(); const searchPicker = frame3?.contentDocument?.querySelector('[data-pick="voice"]');
  let search = frame3?.contentDocument?.querySelector('input[type="search"]');
  if (!search) { searchPicker?.click(); await sleep(80); search = frame3?.contentDocument?.querySelector('input[type="search"]'); }
  const speedBefore = manager()?.speed; let key = null;
  if (search) { search.focus(); const rw = Components.utils.waiveXrays(frame3.contentWindow); const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor); const K = rw.KeyboardEvent; const ev = (keyName, code, keyCode, shiftKey = false) => new K('', { key: keyName, code, keyCode, bubbles: true, cancelable: true, shiftKey }); tip.beginInputTransactionForTests(rw); key = { downShift: tip.keydown(ev('Shift', 'ShiftLeft', 16)), down: tip.keydown(ev('C', 'KeyC', 67, true)), up: tip.keyup(ev('C', 'KeyC', 67, true)), upShift: tip.keyup(ev('Shift', 'ShiftLeft', 16)) }; if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); await sleep(150); }
  const focusGuard = { searchFocused: !!search && frame3.contentDocument.activeElement === search, key, speedBefore, speedAfter: manager()?.speed, unchanged: speedBefore === manager()?.speed };
  try { win.close(); } catch (e) {}
  await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 3000);
  state.settingsFavorites = { before, afterSettingsLayout, disabled, enabledAgain, favoritesBefore, favoritesOn, browser, settingsFavoriteOn, favoritesOff, guard, focusGuard };
  return JSON.stringify(state.settingsFavorites, null, 1);
})()
