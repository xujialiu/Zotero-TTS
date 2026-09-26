(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const prefix = 'extensions.zotero.zotero-tts.';
  const fixture = state.fixtures?.B;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (test, ms = 15000, step = 100) => {
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
  const rawDefault = () => {
    try { return JSON.parse(Services.prefs.getStringPref(prefix + 'readAloud.defaultVoice')); } catch (_) { return null; }
  };
  const rawRecord = () => {
    try { return JSON.parse(Services.prefs.getStringPref(prefix + 'documentVoices.user/' + fixture.key)); } catch (_) { return null; }
  };
  const playerDoc = () => reader()?._iframeWindow?.document?.querySelector('#ztts-player-frame')?.contentDocument || null;
  const noticeText = () => {
    const r = reader();
    return r?._iframeWindow?.document?.getElementById('ztts-speed-toast')?.textContent
      || r?._window?.document?.getElementById('ztts-speed-toast')?.textContent || null;
  };
  const fishLines = async () => String(await Zotero.Debug.get()).split('\n').filter(line => /\[zotero-tts\] (?:prefetch: )?fish: \d+ word timestamps/i.test(line)).length;
  const closePrefs = async () => {
    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (win?.close) win.close();
    await waitFor(() => !Services.wm.getMostRecentWindow('zotero:pref'), 7000);
  };
  const openPane = async () => {
    await closePrefs();
    Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
    const win = await waitFor(() => {
      const candidate = Services.wm.getMostRecentWindow('zotero:pref');
      return candidate?.Zotero_Preferences?.navigation ? candidate : null;
    }, 10000);
    if (!win) throw new Error('settings window did not open');
    await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
    const doc = await waitFor(() => win.document.getElementById('ztts-provider-openai-official') ? win.document : null, 10000);
    if (!doc) throw new Error('Zotero-TTS settings pane did not load');
    await waitFor(() => {
      const status = doc.getElementById('ztts-voices-status')?.textContent || '';
      return !/listing voices/i.test(status) && doc.getElementById('ztts-voices-list')?.children?.length ? true : null;
    }, 30000);
    return { win, doc };
  };
  const setDefaultThroughUI = async label => {
    const { doc } = await openPane();
    const row = await waitFor(() => [...(doc.getElementById('ztts-voices-list')?.children || [])].map(element => {
      const buttons = [...element.querySelectorAll('button')];
      return { element, label: buttons[2]?.textContent?.trim() || '', button: buttons[2], title: buttons[2]?.getAttribute('title') || '' };
    }).find(entry => entry.label === label), 5000);
    if (!row) throw new Error(`settings row missing: ${label}`);
    row.button.click();
    const picked = await waitFor(() => {
      try { const value = JSON.parse(Services.prefs.getStringPref(prefix + 'readAloud.defaultVoice')); return value?.id ? value : null; } catch (_) { return null; }
    }, 5000);
    await closePrefs();
    return picked;
  };
  if (!fixture || !state.voices?.B || !state.voices?.A) throw new Error('no-default state missing');
  const r = reader();
  if (!r) throw new Error('fixture B reader missing');
  if (manager()?.active) r._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);
  const defaultBefore = rawDefault();
  const recordBefore = rawRecord();
  Services.prefs.clearUserPref(prefix + 'documentVoices.user/' + fixture.key);
  const pulse = prefix + 'documentVoiceChanged';
  Services.prefs.setStringPref(pulse, String(Number(Services.prefs.getStringPref(pulse, '0')) + 1));
  Services.prefs.setStringPref(prefix + 'readAloud.defaultVoice', '');
  const fishBefore = await fishLines();
  const main = Zotero.getMainWindow?.();
  if (main?.Zotero_Tabs?.select && r.tabID) main.Zotero_Tabs.select(r.tabID);
  r.focus?.(); r._iframeWindow?.focus?.();
  try { r._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  r._internalReader.toggleReadAloudPopup(true);
  await waitFor(() => playerDoc(), 10000);
  await sleep(500);
  if (!manager()?.active) playerDoc()?.querySelector('.play')?.click();
  await sleep(700);
  const noDefault = await report();
  const noDefaultEntry = noDefault.readers.find(entry => entry.key?.endsWith('/' + fixture.key));
  const noDefaultNotice = await waitFor(() => noticeText(), 2000) || null;
  const fishAfter = await fishLines();
  const noDefaultEngine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
  const noDefaultController = noDefaultEngine.readers.find(entry => entry.itemID === fixture.itemID)?.controller || null;
  const blocked = !noDefaultEntry?.saved && !noDefaultEntry?.active && !noDefaultEntry?.selected && !manager()?.active && !noDefaultController && fishAfter === fishBefore;
  if (!blocked || !/default voice/i.test(String(noDefaultNotice || ''))) throw new Error(`no-default fallback started: ${JSON.stringify({recordBefore,noDefaultEntry,noDefaultNotice,fishBefore,fishAfter,noDefaultController})}`);
  r._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);

  const picked = await setDefaultThroughUI(state.voices.B.label);
  if (!picked || picked.id !== state.voices.B.id) throw new Error(`settings did not restore default B: ${JSON.stringify(picked)}`);
  if (main?.Zotero_Tabs?.select && r.tabID) main.Zotero_Tabs.select(r.tabID);
  r.focus?.(); r._iframeWindow?.focus?.();
  try { r._iframeWindow?.document?.notifyUserGestureActivation?.(); } catch (_) {}
  r._internalReader.toggleReadAloudPopup(true);
  await waitFor(() => playerDoc(), 10000);
  const started = await waitFor(() => manager()?.active ? { active: true, paused: !!manager().paused, selected: manager().selectedVoiceID } : null, 10000);
  if (!started) {
    playerDoc()?.querySelector('.play')?.click();
  }
  const working = started || await waitFor(() => manager()?.active ? { active: true, paused: !!manager().paused, selected: manager().selectedVoiceID } : null, 10000);
  const afterDefault = await report();
  const initialized = afterDefault.readers.find(entry => entry.key?.endsWith('/' + fixture.key));
  if (!working || working.selected !== state.voices.B.id || initialized?.saved?.voice?.id !== state.voices.B.id || initialized.saved.manual !== false) throw new Error(`default B did not initialize document: ${JSON.stringify({working,initialized})}`);
  if (!manager().paused) r._internalReader.toggleReadAloudPaused();
  await waitFor(() => manager()?.paused === true, 5000);
  r._internalReader.toggleReadAloudPopup(false);
  await waitFor(() => !manager()?.active, 7000);
  state.noDefault = { key: `user/${fixture.key}`, defaultBefore, recordBefore, noDefault: { entry: noDefaultEntry, notice: noDefaultNotice, fishBefore, fishAfter, blocked }, picked, initialized, restoredDefault: rawDefault() };
  return JSON.stringify({ status: 'PASS', key: `user/${fixture.key}`, defaultBefore, recordBefore, noDefaultEntry, noDefaultNotice, fishBefore, fishAfter, blocked, picked, initialized, restoredDefault: rawDefault() }, null, 1);
})();
