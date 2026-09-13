(async () => {
  const fixtureID = 24434;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal && internal._readAloudManager;
  const trace = [];
  try {
    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 60; i++) {
      const controller = manager && manager._controller;
      const ctx = controller && controller._audioContext;
      trace.push({
        ms: i * 100,
        active: !!(manager && manager.active),
        paused: manager ? !!manager.paused : null,
        selectedVoiceID: manager ? manager.selectedVoiceID : null,
        selectedTier: manager ? manager._selectedTier : null,
        audioState: ctx ? ctx.state : null,
        audioTime: ctx ? ctx.currentTime : null,
        position: controller ? controller._position : null,
        segmentIndex: controller ? controller._segmentIndex : null,
      });
      if (i >= 5 && manager && manager.active && !manager.paused) {
        try { manager.pause(); } catch (e) { trace.push({ pauseError: String(e) }); }
        await new Promise(resolve => setTimeout(resolve, 100));
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (e) {
    return JSON.stringify({ error: String(e), stack: e?.stack || null, trace }, null, 1);
  }
  return JSON.stringify({
    trace: trace.length > 6 ? [trace[0], trace[1], trace[trace.length - 2], trace[trace.length - 1]] : trace,
    traceCount: trace.length,
    final: trace[trace.length - 1] || null,
  }, null, 1);
})()
