(async () => {
  const run = Zotero.ZoteroTTSRun;
  const state = run.state || (run.state = {});
  const p = run.params || {};
  const pluginPrefix = 'extensions.zotero.zotero-tts.';
  const nativeVoicePref = 'extensions.zotero.reader.readAloudVoices';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { const value = test(); if (value) return value; await sleep(100); } return test(); };
  const join = (a, b) => String(a).replace(/[\\/]$/, '') + (Zotero.isWin ? '\\' : '/') + String(b).split('/').join(Zotero.isWin ? '\\' : '/');
  const readerOf = itemID => { const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i]; return null; };
  const full = suffix => pluginPrefix + suffix;
  const readPref = suffix => {
    const name = suffix === 'reader.readAloudVoices' ? nativeVoicePref : full(suffix), type = Services.prefs.getPrefType(name);
    let value = null;
    if (type === Services.prefs.PREF_STRING) value = Services.prefs.getStringPref(name);
    else if (type === Services.prefs.PREF_BOOL) value = Services.prefs.getBoolPref(name);
    else if (type === Services.prefs.PREF_INT) value = Services.prefs.getIntPref(name);
    return { value, user: Services.prefs.prefHasUserValue(name), type };
  };
  const setPref = (suffix, snap) => {
    const name = suffix === 'reader.readAloudVoices' ? nativeVoicePref : full(suffix);
    if (snap.type === Services.prefs.PREF_STRING) Services.prefs.setStringPref(name, String(snap.value));
    else if (snap.type === Services.prefs.PREF_BOOL) Services.prefs.setBoolPref(name, !!snap.value);
    else if (snap.type === Services.prefs.PREF_INT) Services.prefs.setIntPref(name, Math.round(Number(snap.value)));
    if (!snap.user && Services.prefs.prefHasUserValue(name)) Services.prefs.clearUserPref(name);
  };
  const names = ['readAloud.volume', 'readAloud.memory', 'readAloud.favoriteVoices', 'readAloud.favoritesOnly', 'readAloud.usePluginPlayer', 'readAloud.playerLayout', 'readAloud.autoScrollEnabled', 'readAloud.autoScrollMode', 'readAloud.keepFollowingWhileVisible', 'readAloud.globalSpeed', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings', 'prefetchEnabled', 'cacheAudio'];
  const baseline = { prefs: {}, native: readPref('reader.readAloudVoices'), debugStoring: !!Zotero.Debug?.storing, owner: [] };
  for (const suffix of names) baseline.prefs[suffix] = readPref(suffix);
  const beforeReaders = Zotero.Reader?._readers || [];
  for (let i = 0; i < beforeReaders.length; i++) { const r = beforeReaders[i]; if (!r) continue; const m = r._internalReader?._readAloudManager; baseline.owner.push({ itemID: r.itemID, active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null }); }
  state.compactBaseline = baseline;
  const fixture = { id: null, item: null }, errors = [];
  let reader = null, settingsWin = null;
  const frame = () => reader?._iframeWindow?.document?.getElementById('ztts-player-frame');
  const button = () => reader?._iframeWindow?.document?.getElementById('ztts-player-toggle');
  const measureStyle = (element, props) => { if (!element) return null; const style = getComputedStyle(element); const out = {}; for (const prop of props) out[prop] = style[prop]; const rect = element.getBoundingClientRect(); out.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; return out; };
  const measurePlayer = () => {
    const f = frame(), d = f?.contentDocument; if (!f || !d) return { error: 'player frame missing' };
    const root = d.querySelector('.player'), pop = d.querySelector('.popover');
    const host = { nodes: { frame: d.defaultView?.frameElement?.ownerDocument?.querySelectorAll('#ztts-player-frame').length ?? null, style: d.defaultView?.frameElement?.ownerDocument?.querySelectorAll('#ztts-player-style').length ?? null, icon: d.defaultView?.frameElement?.ownerDocument?.querySelectorAll('#ztts-player-toggle').length ?? null, prototype: d.defaultView?.frameElement?.ownerDocument?.querySelectorAll('#ztts-player-prototype, #ztts-player-prototype-layout, #ztts-player-toolbar-slot').length ?? null } };
    const chevrons = []; const list = d.querySelectorAll('.picker .chevron'); for (let i = 0; i < list.length; i++) { const c = list[i], parent = c.parentElement?.getBoundingClientRect(), r = c.getBoundingClientRect(), s = getComputedStyle(c); chevrons.push({ width: s.width, height: s.height, flex: s.flex, alignSelf: s.alignSelf, opacity: s.opacity, maskImage: s.maskImage, centerDelta: parent ? Number(((r.x + r.width / 2) - (parent.right - r.width / 2)).toFixed(2)) : null }); }
    const footer = d.querySelector('.controls'), rootRect = root?.getBoundingClientRect(); const footerControls = []; const controls = footer?.children || []; for (let i = 0; i < controls.length; i++) { const el = controls[i], r = el.getBoundingClientRect(), s = getComputedStyle(el), hidden = s.display === 'none' || el.hidden; footerControls.push({ selector: el.className || el.getAttribute('data-adjust') || el.tagName, hidden, width: s.width, height: s.height, padding: s.padding, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, inside: !!rootRect && (hidden || (r.left >= rootRect.left && r.right <= rootRect.right && r.top >= rootRect.top && r.bottom <= rootRect.bottom)) }); }
    const sheets = []; const sheetList = d.styleSheets || []; for (let i = 0; i < sheetList.length; i++) { const sheet = sheetList[i]; const href = sheet.href || null; const rules = []; try { const cssRules = sheet.cssRules || []; for (let j = 0; j < cssRules.length; j++) { const rule = cssRules[j]; const selector = rule.selectorText || ''; if (/layout-B|\.option|\.popover|\.controls|\.picker/.test(selector)) rules.push({ selector, cssText: rule.cssText || null }); } } catch (e) {} sheets.push({ href, rules }); }
    return { host, frame: { width: f.style.width, height: f.style.height, dataLayout: f.getAttribute('data-layout'), rect: (()=>{ const r=f.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height }; })() }, root: measureStyle(root, ['width', 'height', 'padding', 'gap', 'gridTemplateRows', 'overflow', 'fontFamily', 'fontSize']), overflow: root ? { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, scrollHeight: root.scrollHeight, clientHeight: root.clientHeight } : null, footer: footer ? { rect: (()=>{const r=footer.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})(), controls: footerControls } : null, chevrons, popover: pop ? measureStyle(pop, ['width', 'height', 'padding', 'gap', 'fontFamily', 'fontSize']) : null, stylesheets: sheets };
  };
  const openClosePicker = async key => {
    const d = frame()?.contentDocument, picker = d?.querySelector(`[data-pick="${key}"]`); if (!picker) return { key, error: 'picker missing' };
    picker.click(); await sleep(90); const pop = d.querySelector('.popover'), option = pop?.querySelector('.option'); const first = { open: !!pop, popover: measureStyle(pop, ['width', 'height', 'padding', 'gap']), option: measureStyle(option, ['height', 'minHeight', 'padding', 'lineHeight']), search: measureStyle(pop?.querySelector('input[type="search"]'), ['padding', 'height', 'lineHeight']) };
    picker.click(); await sleep(90); const closed = !d.querySelector('.popover'); return { key, first, secondClickClosed: closed };
  };
  const openCloseLayout = async () => {
    const d = frame()?.contentDocument, trigger = d?.querySelector('.layout-menu'); if (!trigger) return { error: 'layout menu missing' };
    trigger.click(); await sleep(90); const pop = d.querySelector('.popover'), option = pop?.querySelector('.layout-option'), selected = pop?.querySelector('.layout-option.chosen'); const first = { open: !!pop, popover: measureStyle(pop, ['width', 'height', 'padding', 'gap']), option: measureStyle(option, ['height', 'minHeight', 'padding', 'lineHeight']), selected: selected ? { background: getComputedStyle(selected).backgroundColor, color: getComputedStyle(selected).color } : null };
    trigger.click(); await sleep(90); return { first, secondClickClosed: !d.querySelector('.popover') };
  };
  const openCloseRange = async key => {
    const d = frame()?.contentDocument, trigger = d?.querySelector(`[data-adjust="${key}"]`); if (!trigger) return { key, error: 'range trigger missing' };
    trigger.click(); await sleep(90); const pop = d.querySelector('.popover'), first = { open: !!pop, popover: measureStyle(pop, ['width', 'height', 'padding', 'gap']), title: measureStyle(pop?.querySelector('.range-title'), ['margin', 'height']), range: measureStyle(pop?.querySelector('input[type="range"]'), ['margin', 'height']), presets: measureStyle(pop?.querySelector('.presets'), ['gap']) };
    trigger.click(); await sleep(90); return { key, first, secondClickClosed: !d.querySelector('.popover') };
  };
  const measureLayout = async layout => {
    const child = frame()?.contentWindow ? Components.utils.waiveXrays(frame().contentWindow) : null; child?.zttsSwitchLayout?.(layout); await waitFor(() => frame()?.getAttribute('data-layout') === layout); await sleep(120);
    const d = frame()?.contentDocument, rows = []; for (const key of ['provider', 'locale', 'voice']) rows.push(await openClosePicker(key)); const layoutMenu = await openCloseLayout(); const ranges = [await openCloseRange('speed'), await openCloseRange('volume')];
    return { layout, player: measurePlayer(), pickers: rows, layoutMenu, ranges };
  };
  const measureSettings = async () => {
    const opened = Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top'); if (opened && typeof opened.then === 'function') await opened; settingsWin = await waitFor(() => Services.wm.getMostRecentWindow('zotero:pref')); if (!settingsWin) return { error: 'settings window missing' };
    try { await settingsWin.Zotero_Preferences.navigateToPane('zotero-tts-pane'); } catch (e) {}
    const d = await waitFor(() => settingsWin.document.getElementById('ztts-player-layout-trigger')); if (!d) return { error: 'settings pane missing' }; const doc = settingsWin.document, trigger = doc.getElementById('ztts-player-layout-trigger'), menu = doc.getElementById('ztts-player-layout-menu'), label = doc.getElementById('ztts-player-layout-caption'), chevron = trigger.querySelector('.ztts-player-chevron');
    trigger.click(); await sleep(100); const option = menu.querySelector('.ztts-player-layout-option'), first = { open: menu.matches(':popover-open'), menu: measureStyle(menu, ['width', 'height', 'padding', 'margin']), option: measureStyle(option, ['height', 'minHeight', 'padding', 'lineHeight']), trigger: measureStyle(trigger, ['width', 'marginInlineStart', 'marginInlineEnd']), label: measureStyle(label, ['width', 'marginInlineStart', 'marginInlineEnd']), chevron: measureStyle(chevron, ['width', 'height', 'flex', 'alignSelf', 'opacity', 'maskImage']), noX: !menu.textContent.includes('×') };
    trigger.click(); await sleep(100); const secondClickClosed = !menu.matches(':popover-open'); try { settingsWin.close(); } catch (e) {} await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 3000); settingsWin = null; return { first, secondClickClosed };
  };
  try {
    Services.prefs.setIntPref(full('readAloud.volume'), 0); Services.prefs.setBoolPref(full('webdav.syncPositions'), false); Services.prefs.setBoolPref(full('webdav.autoUploadSettings'), false); Services.prefs.setBoolPref(full('webdav.syncSettings'), false); Services.prefs.setBoolPref(full('readAloud.usePluginPlayer'), true); Services.prefs.setStringPref(full('readAloud.playerLayout'), 'A');
    const rawDir = p.fixturesDir || join(p.root || '', 'test/fixtures'); const dir = Zotero.isWin ? String(rawDir).split('/').join('\\') : rawDir;
    const imported = await Zotero.Attachments.importFromFile({ file: join(dir, 'fixture-a.pdf'), libraryID: Zotero.Libraries.userLibraryID, title: 'Zotero-TTS compact UI ' + String(p.runId || Date.now()) }); fixture.item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported; fixture.id = fixture.item?.id ?? null; if (!fixture.id) throw new Error('compact UI fixture import failed');
    const opened = Zotero.Reader.open(fixture.id); if (opened && typeof opened.then === 'function') await opened; reader = await waitFor(() => readerOf(fixture.id)?._internalReader?._readAloudManager ? readerOf(fixture.id) : null, 12000); if (!reader) throw new Error('compact UI reader missing');
    if (frame()?.hidden) button()?.click(); await waitFor(() => !frame()?.hidden && !!frame()?.contentDocument?.querySelector('.player')); await waitFor(() => !!reader._internalReader?._readAloudManager?.active); await sleep(700); const play = frame()?.contentDocument?.querySelector('.play'); if (!reader._internalReader?._readAloudManager?.paused) play?.click(); await waitFor(() => !!reader._internalReader?._readAloudManager?.paused);
    const layouts = [await measureLayout('A'), await measureLayout('top'), await measureLayout('B')];
    const settings = await measureSettings();
    let resource = null; try { resource = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()).resource || null; } catch (e) {}
    state.compactUI = { fixtureId: fixture.id, resource, layouts, settings, ownerBefore: baseline.owner };
  } catch (e) { errors.push(String(e)); state.compactUI = { fixtureId: fixture.id, errors, ownerBefore: baseline.owner }; }
  finally {
    if (settingsWin) try { settingsWin.close(); } catch (e) {}
    if (fixture.id) { try { const r = readerOf(fixture.id); if (r) { const pending = r.close(); if (pending && typeof pending.then === 'function') await pending; } } catch (e) { errors.push('close fixture: ' + String(e)); } for (let i = 0; i < 40; i++) { if (!readerOf(fixture.id)) break; await sleep(100); } try { const item = Zotero.Items.get(fixture.id); if (item) await item.eraseTx(); } catch (e) { errors.push('erase fixture: ' + String(e)); } }
    for (const suffix of names) if (suffix !== 'readAloud.memory') setPref(suffix, baseline.prefs[suffix]); setPref('reader.readAloudVoices', baseline.native); setPref('readAloud.memory', baseline.prefs['readAloud.memory']); if (baseline.debugStoring !== undefined && !!Zotero.Debug?.storing !== !!baseline.debugStoring) Zotero.Debug.setStore(!!baseline.debugStoring);
    const ownerAfter = []; const list = Zotero.Reader?._readers || []; for (let i = 0; i < list.length; i++) { const r = list[i]; if (!r) continue; const m = r._internalReader?._readAloudManager; ownerAfter.push({ itemID: r.itemID, active: !!m?.active, paused: !!m?.paused, voice: m?.selectedVoiceID || null }); }
    state.compactUI.cleanup = { errors, fixtureId: fixture.id, ownerAfter, prefs: { volume: readPref('readAloud.volume'), memory: readPref('readAloud.memory'), native: readPref('reader.readAloudVoices'), enabled: readPref('readAloud.usePluginPlayer'), layout: readPref('readAloud.playerLayout'), syncPositions: readPref('webdav.syncPositions'), autoUpload: readPref('webdav.autoUploadSettings'), syncSettings: readPref('webdav.syncSettings') } };
  }
  return JSON.stringify(state.compactUI, null, 1);
})()
