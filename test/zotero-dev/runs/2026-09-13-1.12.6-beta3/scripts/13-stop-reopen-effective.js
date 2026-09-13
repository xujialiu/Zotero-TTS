(async () => {
  const fixtureID = 24434;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = label => ({
    label,
    active: !!manager?.active,
    paused: manager ? !!manager.paused : null,
    popupOpen: !!internal?._readAloudPopupOpen,
    selectedVoiceID: manager?.selectedVoiceID || null,
  });
  const trace = [state('before-stop')];
  let error = null;
  try {
    internal.toggleReadAloudPopup(false);
    for (let i = 0; i < 30; i++) {
      if (!manager?.active) break;
      await wait(100);
    }
    trace.push(state('after-stop'));
    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 50; i++) {
      if (manager?.active && manager._controller) break;
      await wait(100);
    }
    trace.push(state('after-reopen'));
    if (manager?.active && !manager.paused) manager.pause();
    await wait(80);
    trace.push(state('paused-after-reopen'));
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  const settings = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  return JSON.stringify({ trace, settings, error }, null, 1);
})()
