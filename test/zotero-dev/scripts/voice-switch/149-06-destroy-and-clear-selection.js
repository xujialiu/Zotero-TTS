(async () => {
  const session = Zotero.__ztts149;
  const fixture = session?.fixtures?.find(row => row.kind === 'pdf');
  if (!fixture) throw new Error('149 PDF fixture is missing');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const findReader = itemID => {
    const list = Zotero.Reader?._readers || [];
    for (let i = 0; i < list.length; i++) {
      try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === itemID) return list[i]; } catch (_) {}
    }
    return null;
  };
  const reader = findReader(fixture.itemID);
  const internal = reader?._internalReader;
  const manager = internal?._readAloudManager;
  if (!reader || !internal || !manager) throw new Error('PDF manager is missing');
  if (!manager.active || !manager.paused || !manager.selectedVoiceID) throw new Error('PDF is not an active paused Fish session');
  if (!(manager._segments?.length > 0)) throw new Error('PDF segments are missing');
  let beforeEngine = null;
  try { beforeEngine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()); } catch (e) { beforeEngine = { error: String(e) }; }
  const beforeRow = beforeEngine?.readers?.find(row => Number(row.itemID) === Number(fixture.itemID));
  const beforePosition = beforeRow?.session?.position ?? null;
  let repositionError = null;
  try {
    const result = manager.repositionTo(2);
    if (result && typeof result.then === 'function') await result;
  } catch (e) { repositionError = String(e); }
  await sleep(500);
  if (manager.active && !manager.paused) { try { manager.pause(); } catch (_) {} }
  await sleep(250);
  let positionedEngine = null;
  try { positionedEngine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()); } catch (_) {}
  const positionedRow = positionedEngine?.readers?.find(row => Number(row.itemID) === Number(fixture.itemID));
  const position = positionedRow?.session?.position ?? null;
  if (position !== 2) throw new Error(`fixture did not retain requested nonzero position: ${repositionError || position}`);
  const oldVoice = manager.selectedVoiceID;
  let destroyError = null;
  try {
    const m = Components.utils.waiveXrays(manager);
    const result = m._destroyController?.call(m);
    if (result && typeof result.then === 'function') await result;
  } catch (e) { destroyError = String(e); }
  await sleep(500);
  const afterDestroyBeforeClear = (() => {
    try { return { active: !!manager.active, paused: !!manager.paused, selectedVoice: manager.selectedVoiceID ?? null, controller: !!manager._controller, segments: manager._segments?.length ?? null }; } catch (e) { return { error: String(e) }; }
  })();
  // The original reproduction clears only the fixture manager's selected id;
  // the same-voice control later leaves it intact on a fresh cycle.
  try {
    const m = Components.utils.waiveXrays(manager);
    m._voiceID = null;
    m._voice = null;
  } catch (e) { throw new Error('could not clear fixture selection: ' + String(e)); }
  await sleep(250);
  let afterEngine = null;
  try { afterEngine = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()); } catch (e) { afterEngine = { error: String(e) }; }
  let switchDiag = null;
  try { switchDiag = JSON.parse(await Zotero.ZoteroTTS.diagnostics.voiceSwitch()); } catch (e) { switchDiag = { error: String(e) }; }
  const row = afterEngine?.readers?.find(item => Number(item.itemID) === Number(fixture.itemID));
  const switchRow = switchDiag?.readers?.find(item => Number(item.itemID) === Number(fixture.itemID));
  return JSON.stringify({
    status: 'PASS', oldVoice, beforePosition, position, repositionError,
    afterDestroyBeforeClear, destroyError,
    precondition: { managerActive: !!manager.active, managerPaused: !!manager.paused, selectedVoice: manager.selectedVoiceID ?? null, segments: manager._segments?.length ?? null, controller: !!manager._controller, sessionEnded: row?.session?.ended ?? null, engineController: row?.controller ?? null },
    switch: switchRow ? { mechanism: switchRow.mechanism, handoff: switchRow.handoff } : null,
  }, null, 1);
})();
