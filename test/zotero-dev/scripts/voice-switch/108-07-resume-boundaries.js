return (async () => {
  const state = Zotero.ZoteroTTSRun.state, t = state.transport;
  const Cu = Components.utils, sleep = ms => new Promise(r => setTimeout(r, ms));
  const rows = [];
  const wait = async (fn, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return; await sleep(30); }
    throw new Error('bounded fixture condition was not reached');
  };
  const diag = e => JSON.parse(Zotero.ZoteroTTS.diagnostics.voiceSwitch()).readers[Zotero.Reader._readers.indexOf(e.reader)].handoff;
  const assert = (ok, why) => { if (!ok) throw new Error(why); };
  for (const kind of ['pdf', 'epub']) {
    const e = t.readers[kind], m = Cu.waiveXrays(e.manager), win = e.window;
    for (const scenario of ['not-ready', 'missing-timings', 'grouped-paused-word']) {
      const row = { kind, scenario, status: 'FAIL' }; rows.push(row);
      state.boundaryResults = rows;
      let restoreFactory, restoreOld;
      try {
        t.delayMs = 0; t.delayVoiceID = null; t.noTimestampsVoiceID = null;
        e.internal.toggleReadAloudPopup(false); await wait(() => !m.active);
        m.setLanguage('en', Cu.cloneInto({ region: 'US' }, win));
        m.selectTier('standard'); m.selectVoice('native108-a');
        Zotero.getMainWindow().Zotero_Tabs.select(e.tabID);
        win.document.notifyUserGestureActivation(); e.internal.toggleReadAloudPopup(true);
        await wait(() => m.active && m._segments?.length && m._controller);
        if (m.paused) m.play();
        await Promise.race([m._controller._audioContext.resume(), sleep(1500)]);
        await wait(() => m._controller._isPlaying && m._controller._currentPlaybackTime > 0.2);
        m.pause();
        const old = Cu.waiveXrays(m._controller), index = old._position;
        row.original = { id: m.selectedVoiceID, index, offset: old._currentPlaybackTime, text: String(m._segments[index].text) };
        assert(['native108-a', 'native108-b'].includes(m.selectedVoiceID), 'fixture did not restore a US standard voice');
        const originalID = m.selectedVoiceID, targetID = originalID === 'native108-a' ? 'native108-b' : 'native108-a';
        assert(old._audioContext.state === 'running', 'fixture output is not running');
        if (scenario === 'grouped-paused-word') {
          const times = Array.from(old._currentTimestamps);
          assert(times.length > 2, 'fixture needs at least three timestamped words');
          old._currentTimestamps = Cu.cloneInto([{ ...times[0], end: times[1].end, charEnd: times[1].charEnd }, ...times.slice(2)], win);
        }
        let target;
        for (let i = 0; i < m.allVoices.length; i++) if (m.allVoices[i].id === targetID) target = Cu.waiveXrays(m.allVoices[i]);
        assert(target, 'target US voice is missing');
        const factory = target.getController, descriptor = Object.getOwnPropertyDescriptor(target, 'getController');
        const targetPlays = [], oldPlays = [];
        target.getController = Cu.exportFunction(function (...args) {
          const c = Cu.waiveXrays(Reflect.apply(factory, target, args)), play = c._playAudioBuffer;
          c._playAudioBuffer = Cu.exportFunction(function (...audioArgs) {
            targetPlays.push({ index: c._position, offset: audioArgs[1] });
            return Reflect.apply(play, c, audioArgs);
          }, c);
          return c;
        }, target);
        restoreFactory = () => { if (descriptor) Object.defineProperty(target, 'getController', descriptor); else delete target.getController; };
        const oldPlay = old._playAudioBuffer, oldDescriptor = Object.getOwnPropertyDescriptor(old, '_playAudioBuffer');
        old._playAudioBuffer = Cu.exportFunction(function (...args) {
          oldPlays.push({ index: old._position, offset: args[1] }); return Reflect.apply(oldPlay, old, args);
        }, old);
        restoreOld = () => { if (oldDescriptor) Object.defineProperty(old, '_playAudioBuffer', oldDescriptor); else delete old._playAudioBuffer; };
        t.delayVoiceID = targetID; t.delayMs = scenario === 'not-ready' ? 850 : 0;
        t.noTimestampsVoiceID = scenario === 'missing-timings' ? targetID : null;
        win.document.notifyUserGestureActivation(); m.selectVoice(targetID);
        if (scenario === 'not-ready') await sleep(180);
        else await wait(() => diag(e).prepared.includes(index));
        row.beforePlay = { paused: m.paused, oldSame: m._controller === old, prepared: diag(e).prepared, plays: targetPlays.length };
        assert(m.paused && m._controller === old && targetPlays.length === 0, 'preparation disturbed paused playback');
        win.document.notifyUserGestureActivation(); m.play(); await sleep(60);
        row.afterPlay = { voice: m.selectedVoiceID, oldSame: m._controller === old, oldPlays: oldPlays.length };
        assert(m.selectedVoiceID === originalID && m._controller === old && oldPlays.length > 0, 'original voice did not resume first');
        await wait(() => diag(e).stage === 'committed', 6500);
        row.handoff = diag(e).last; row.targetPlays = targetPlays; row.oldPlays = oldPlays;
        assert(m.selectedVoiceID === targetID, 'target was not adopted');
        if (scenario === 'not-ready') assert(row.handoff.kind === 'word' && row.handoff.index === index, 'late audio did not hand off in the same sentence');
        else assert(row.handoff.kind === 'sentence' && row.handoff.index === index + 1 && targetPlays[0]?.offset === 0, 'unsafe paused cut did not finish the original sentence');
        row.sourcePositionRetained = m._activeSegment === m._segments[row.handoff.index];
        assert(row.sourcePositionRetained, 'active sentence/source position changed');
        row.status = 'PASS';
      } catch (error) { row.error = String(error); throw error; }
      finally {
        if (m.active && !m.paused) m.pause();
        restoreFactory?.(); restoreOld?.();
        t.delayMs = 0; t.delayVoiceID = null; t.noTimestampsVoiceID = null;
      }
    }
  }
  return JSON.stringify({ status: 'PASS', rows });
})()
