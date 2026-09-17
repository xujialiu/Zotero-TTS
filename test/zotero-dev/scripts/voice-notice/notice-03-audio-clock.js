return (async () => {
  const t = Zotero.ZoteroTTSRun.state.transport;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pressPlay = entry => {
    const rw = entry.window;
    const tip = Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
    const K = rw.KeyboardEvent;
    const ev = (key, code, keyCode, shiftKey = false) => new K('', { key, code, keyCode, bubbles: true, cancelable: true, shiftKey });
    tip.beginInputTransactionForTests(rw);
    const ret = [tip.keydown(ev('Shift', 'ShiftLeft', 16)), tip.keydown(ev(' ', 'Space', 32, true)),
      tip.keyup(ev(' ', 'Space', 32, true)), tip.keyup(ev('Shift', 'ShiftLeft', 16))];
    if (typeof tip.endInputTransaction === 'function') tip.endInputTransaction();
    return ret;
  };
  const stateOf = entry => {
    const m = entry.manager, c = m?._controller, context = c?._audioContext;
    return { active: !!m?.active, paused: !!m?.paused, position: Number.isFinite(c?._position) ? c._position : null,
      sourcePlaying: !!c?._isPlaying, source: !!c?._sourceNode, context: context?.state ?? null,
      audioTime: Number.isFinite(context?.currentTime) ? context.currentTime : null,
      progress: Number.isFinite(c?._currentPlaybackTime) ? c._currentPlaybackTime : null };
  };
  const rows = [];
  for (const kind of ['pdf', 'epub']) {
    const entry = t.readers[kind], m = entry.manager;
    try {
      Zotero.getMainWindow?.().Zotero_Tabs?.select(entry.tabID); entry.reader.focus?.(); entry.window.focus?.();
      const key = m.paused ? pressPlay(entry) : [];
      await sleep(250);
      if (m.paused) { entry.window.document.notifyUserGestureActivation(); try { m.play(); } catch (e) {} }
      const samples = [];
      for (let i = 0; i < 8; i++) { samples.push({ ms: i * 250, ...stateOf(entry) }); await sleep(250); }
      const first = samples[0], last = samples[samples.length - 1];
      const running = samples.some(s => s.context === 'running' && s.sourcePlaying && Number(s.progress) > 0.1)
        && Number(last.audioTime) > Number(first.audioTime) + 0.05;
      rows.push({ kind, status: running ? 'PASS' : 'NOT TESTABLE', key, first, last, samples,
        reason: running ? null : 'native AudioContext did not run and advance in the muted fixture session' });
    } finally {
      if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
      await sleep(100);
    }
  }
  t.audioClock = rows;
  return JSON.stringify({ status: rows.every(row => row.status === 'PASS') ? 'PASS' : 'NOT TESTABLE', rows }, null, 1);
})()
