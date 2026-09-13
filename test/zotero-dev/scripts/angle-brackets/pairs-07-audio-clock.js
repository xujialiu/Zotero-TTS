(async () => {
  const fixtureID = 24434;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal && internal._readAloudManager;
  const read = label => {
    const controller = manager && manager._controller;
    const context = controller && controller._audioContext;
    return {
      label,
      active: !!manager?.active,
      paused: manager ? !!manager.paused : null,
      selectedVoiceID: manager?.selectedVoiceID || null,
      selectedTier: manager?._selectedTier || null,
      audioState: context?.state || null,
      audioTime: context?.currentTime ?? null,
      position: controller?._position ?? null,
      segmentIndex: controller?._segmentIndex ?? null,
    };
  };
  const samples = [];
  try {
    if (!internal._readAloudPopupOpen) internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 30; i++) {
      if (manager?.active && manager._controller) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    samples.push(read('before-500ms'));
    await new Promise(resolve => setTimeout(resolve, 500));
    samples.push(read('after-500ms'));
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: e?.stack || null, samples }, null, 1);
  } finally {
    try {
      if (manager?.active && !manager.paused) manager.pause();
    } catch (e) {}
  }
  return JSON.stringify({ samples, clockMoved: samples.length === 2 && samples[1].audioTime > samples[0].audioTime, stopped: !!manager?.paused }, null, 1);
})()
