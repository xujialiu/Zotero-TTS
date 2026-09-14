return (async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const h = state.helpers;
  if (!h) return JSON.stringify({ error: 'helpers missing' });
  const out = [];
  for (const kind of ['pdf', 'epubScrolled', 'epubPaginated']) {
    const slot = state.fixtures?.[kind], manager = h.manager(slot), context = manager?._controller?._audioContext;
    if (!context) { out.push({ kind, available: false, moving: false, reason: 'AudioContext unavailable' }); continue; }
    const first = { state: String(context.state), currentTime: Number(context.currentTime) };
    await h.sleep(550);
    const second = { state: String(context.state), currentTime: Number(context.currentTime) };
    out.push({ kind, available: true, first, second, moving: second.currentTime > first.currentTime + 0.02 });
  }
  state.audio = { out, anyMoving: out.some(row => row.moving) };
  return JSON.stringify({ out, anyMoving: state.audio.anyMoving });
})()
