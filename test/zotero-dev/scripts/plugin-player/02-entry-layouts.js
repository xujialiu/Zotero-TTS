(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const id = state.fixtures.pdf.id;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const readerOf = itemID => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i]?.itemID === itemID) return list[i];
    return null;
  };
  const waitFor = async (test, ms = 5000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = test(); if (v) return v; await sleep(100); }
    return test();
  };
  const reader = readerOf(id);
  if (!reader?._iframeWindow?.document) throw new Error('fixture PDF document is not ready');
  const doc = reader._iframeWindow.document;
  const button = doc.getElementById('ztts-player-toggle');
  if (!button) throw new Error('plugin player icon was not attached');
  const frame = doc.getElementById('ztts-player-frame');
  const style = doc.getElementById('ztts-player-style');
  const count = () => ({ frames: doc.querySelectorAll('#ztts-player-frame').length, styles: doc.querySelectorAll('#ztts-player-style').length, buttons: doc.querySelectorAll('#ztts-player-toggle').length, oldPrototype: doc.querySelectorAll('#ztts-player-prototype, #ztts-player-prototype-layout, #ztts-player-toolbar-slot').length });
  const managerState = () => {
    const m = reader._internalReader?._readAloudManager;
    const c = m?._controller;
    return { active: !!m?.active, paused: !!m?.paused, popupOpen: !!m?.popupOpen, voice: m?.selectedVoiceID || null, speed: Number(m?.speed) || null, volume: Zotero.Prefs.get('zotero-tts.readAloud.volume'), position: c?._position ?? null, hasController: !!c, audio: c?._audioContext ? { state: c._audioContext.state, currentTime: c._audioContext.currentTime } : null };
  };
  const controllerOf = () => reader._internalReader?._readAloudManager?._controller || null;
  const uiState = () => ({ hidden: !!frame?.hidden, layout: frame?.getAttribute('data-layout') || null, style: style?.textContent || '', player: !!frame?.contentDocument?.querySelector('.player'), frameStyle: frame ? { left: frame.style.left, top: frame.style.top, bottom: frame.style.bottom, width: frame.style.width, height: frame.style.height } : null });
  const initial = { count: count(), ui: uiState(), manager: managerState() };
  button.click();
  await waitFor(() => managerState().active && !frame.hidden && frame.contentDocument?.querySelector('.player'));
  await sleep(300);
  const opened = { count: count(), ui: uiState(), manager: managerState(), diag: JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()) };
  const controller = controllerOf();
  // Pause through the real player control before changing layout, so the state is stable.
  const play = frame.contentDocument?.querySelector('.play');
  if (play && opened.manager.active && !opened.manager.paused) { play.click(); await waitFor(() => managerState().paused); }
  const beforeLayouts = managerState();
  const layouts = [];
  const switchLayout = async layout => {
    const child = frame.contentWindow ? Components.utils.waiveXrays(frame.contentWindow) : null;
    const fn = child?.zttsSwitchLayout;
    if (typeof fn !== 'function') throw new Error('zttsSwitchLayout export missing');
    fn(layout);
    await waitFor(() => frame.getAttribute('data-layout') === layout);
    await sleep(150);
    const split = doc.querySelector('#split-view');
    const cs = split ? doc.defaultView.getComputedStyle(split) : null;
    const after = managerState();
    layouts.push({ layout, ui: uiState(), split: cs ? { top: cs.top, bottom: cs.bottom, height: cs.height } : null, state: { active: after.active, paused: after.paused, voice: after.voice, speed: after.speed, volume: after.volume, position: after.position, sameController: controllerOf() === controller } });
  };
  await switchLayout('top');
  await switchLayout('B');
  await switchLayout('A');
  const beforeClose = managerState();
  button.click();
  await waitFor(() => !managerState().active && frame.hidden);
  const closed = { count: count(), ui: uiState(), manager: managerState() };
  button.click();
  await waitFor(() => managerState().active && !frame.hidden);
  const reopened = managerState();
  state.entry = { initial, opened, beforeLayouts, layouts, beforeClose, closed, reopened };
  return JSON.stringify({ initial, opened, beforeLayouts, layouts, beforeClose, closed, reopened }, null, 1);
})()
