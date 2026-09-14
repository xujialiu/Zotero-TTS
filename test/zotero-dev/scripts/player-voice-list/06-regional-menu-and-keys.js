return (async () => {
  const state = Zotero.ZoteroTTSRun.state, transport = state.transport, main = Zotero.getMainWindow?.();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pointer = (el, win) => el.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
  const readerFor = kind => transport.readers[kind];
  const popupFor = entry => entry.reader._iframeWindow.document.querySelector('.read-aloud-popup');
  const findOption = (popup, suffix, voice) => {
    const all = popup.querySelectorAll('[role="option"]');
    for (let i = 0; i < all.length; i++) {
      const id = all[i].id || '';
      if (voice ? id.endsWith('-option-' + suffix) && id.includes('p106-') : id.endsWith('-option-' + suffix) && !id.includes('p106-')) return all[i];
    }
    return null;
  };
  const open = async (entry, label) => {
    const popup = popupFor(entry), trigger = popup.querySelector(`button[aria-label="${label}"]`);
    if (!trigger) throw new Error(`${label} trigger missing`);
    const marker = label === 'Language' ? '[id$="-option-en"]' : '[id*="-option-p106-"]';
    if (!popup.querySelector(marker)) { trigger.click(); await sleep(100); }
    if (!popup.querySelector(marker)) { trigger.click(); await sleep(100); }
    return popup;
  };
  const selectLanguage = async (entry, code) => {
    const popup = await open(entry, 'Language'), option = findOption(popup, code, false);
    if (!option) throw new Error(`language option ${code} missing`);
    pointer(option, entry.reader._iframeWindow); await sleep(350);
    const m = entry.manager; if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    await sleep(120);
  };
  const menu = async entry => {
    const popup = await open(entry, 'Voice');
    const rows = [], all = popup.querySelectorAll('[role="option"]');
    for (let i = 0; i < all.length; i++) {
      const id = all[i].id || ''; if (!id.includes('p106-')) continue;
      const voiceID = id.replace(/^.*-option-/, '');
      rows.push({ id: voiceID, text: String(all[i].textContent || '').trim().replace(/\s+/g, ' '),
        selected: all[i].getAttribute('aria-selected') === 'true', class: all[i].className || null });
    }
    return rows;
  };
  const managerRows = entry => { const a = entry.manager.voicesForLanguage || [], rows = []; for (let i = 0; i < a.length; i++) rows.push({ id: a[i]?.id ?? null, label: a[i]?.label ?? null, language: a[i]?.language ?? null }); return rows; };
  const selectVoice = async (entry, id) => {
    const popup = await open(entry, 'Voice'), option = findOption(popup, id, true);
    if (!option) throw new Error(`voice option ${id} missing`);
    const before = transport.calls.length; pointer(option, entry.reader._iframeWindow); await sleep(300);
    if (entry.manager.active && !entry.manager.paused) { try { entry.manager.pause(); } catch (e) {} }
    await sleep(120);
    return { selected: entry.manager.selectedVoiceID ?? null, paused: !!entry.manager.paused, calls: transport.calls.slice(before), menu: await menu(entry) };
  };
  const snapshot = entry => ({ selected: entry.manager.selectedVoiceID ?? null, lang: entry.manager.lang ?? null, region: entry.manager.region ?? null,
    active: !!entry.manager.active, paused: !!entry.manager.paused, offered: entry.manager.voicesForLanguage?.length ?? null,
    controller: !!entry.manager._controller, voice: !!entry.manager._voice });
  const press = (entry, key, code, keyCode) => {
    const win = entry.reader._iframeWindow, tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = win.KeyboardEvent, ev = (value, valueCode, valueKeyCode) => new K('', { key: value, code: valueCode, keyCode: valueKeyCode, bubbles: true, cancelable: true });
    entry.reader.focus?.(); win.focus?.(); tip.beginInputTransactionForTests(win);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(key, code, keyCode)), tip.keyup(ev(key, code, keyCode)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction(); return ret;
  };
  const keys = async entry => {
    const actions = [['next', '.', 'Period', 190], ['next-wrap', '.', 'Period', 190], ['previous', ',', 'Comma', 188], ['previous-wrap', ',', 'Comma', 188]], result = [];
    for (const [name, key, code, keyCode] of actions) { const before = entry.manager.selectedVoiceID ?? null, ret = press(entry, key, code, keyCode); await sleep(220); result.push({ name, before, key: ret, after: entry.manager.selectedVoiceID ?? null, paused: !!entry.manager.paused }); }
    return result;
  };
  const result = {};
  for (const kind of ['pdf', 'epub']) {
    const entry = readerFor(kind);
    await selectLanguage(entry, 'en-US');
    await selectVoice(entry, 'p106-us-a');
    const beforeCatalogPrefs = Zotero.Prefs.get('reader.readAloudVoices');
    const usMenu = await menu(entry), usManagerRows = managerRows(entry), usDiag = JSON.parse(Zotero.ZoteroTTS.diagnostics.playerVoiceList())[Zotero.Reader._readers.indexOf(entry.reader)];
    const afterCatalogPrefs = Zotero.Prefs.get('reader.readAloudVoices');
    const menuLanguages = usManagerRows.map(row => row.language);
    const adrianAbsent = !usMenu.some(row => row.id === 'p106-adrian');
    const selectedStable = entry.manager.selectedVoiceID === 'p106-us-a';
    const usKeys = await keys(entry);
    const manual = await selectVoice(entry, 'p106-us-b');
    const afterManualLanguage = popupFor(entry).querySelector('button[aria-label="Language"]')?.textContent?.trim() || null;
    await selectLanguage(entry, 'en-GB');
    await selectVoice(entry, 'p106-gb-a');
    const gbMenu = await menu(entry), gbRows = managerRows(entry), gbKeys = await keys(entry);
    await selectLanguage(entry, 'en');
    const genericMenu = await menu(entry);
    const generic = await selectVoice(entry, 'p106-adrian');
    const genericLanguage = popupFor(entry).querySelector('button[aria-label="Language"]')?.textContent?.trim() || null;
    const mw = Components.utils.waiveXrays(entry.manager), savedRegion = mw._region;
    mw._region = 'US';
    const staleMenu = managerRows(entry), staleSelected = entry.manager.selectedVoiceID ?? null;
    mw._region = savedRegion;
    const afterPrefs = Zotero.Prefs.get('reader.readAloudVoices');
    result[kind] = { us: { diagnostic: usDiag, menu: usMenu, managerRows: usManagerRows, menuLanguages, adrianAbsent,
        selectedStable, keys: usKeys, manual, languageAfterManual: afterManualLanguage,
        compatibleGreaterThanOffered: usDiag?.compatible > usDiag?.offered },
      gb: { menu: gbMenu, managerRows: gbRows, keys: gbKeys, singleton: gbMenu.length === 1 && gbKeys.every(x => x.after === 'p106-gb-a') },
      generic: { menu: genericMenu, selected: entry.manager.selectedVoiceID ?? null, selection: generic, language: genericLanguage,
        staleRegion: { requestedRegion: 'US', selected: staleSelected, menu: staleMenu, usable: staleMenu.length > 0 && staleSelected === 'p106-adrian' } },
      filteringReadOnly: beforeCatalogPrefs === afterCatalogPrefs, providerPrefsChangedBySelections: beforeCatalogPrefs !== afterPrefs,
      calls: transport.calls.slice() };
  }
  state.liveResult = result;
  return JSON.stringify(result, null, 1);
})()
