(async () => {
  const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal && internal._readAloudManager;
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  const calls = [];
  sandbox.fetch = function (input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    calls.push({
      path: String(input).replace(/^https?:\/\/[^/]+/, ''),
      method: init?.method || 'GET',
      model: init?.headers?.model ?? null,
      text: typeof body?.text === 'string' ? body.text : null,
      input: typeof body?.input === 'string' ? body.input : null,
    });
    return Reflect.apply(originalFetch, sandbox, [input, init]);
  };
  const trace = [];
  let error = null;
  try {
    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 80; i++) {
      const c = manager && manager._controller;
      const segCount = manager && manager.segments ? manager.segments.length : 0;
      trace.push({ ms: i * 100, active: !!(manager && manager.active), paused: manager ? !!manager.paused : null, voice: manager ? manager.selectedVoiceID : null, segCount });
      if (i >= 3 && manager && manager.active && segCount >= 11) {
        await new Promise(resolve => setTimeout(resolve, 300)); // let the first fetch actually go out
        if (!manager.paused) { try { manager.pause(); } catch (e) { trace.push({ pauseError: String(e) }); } }
        await new Promise(resolve => setTimeout(resolve, 150));
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  finally { sandbox.fetch = originalFetch; }

  // manager.segments lives in the reader compartment: walk it by index,
  // never .map()/.filter()/.find() it with a chrome callback (issue #110).
  const segs = (manager && manager.segments) || [];
  const shape = s => ({
    text: s.text,
    position: s.position ? { start: s.position.start, end: s.position.end } : null,
    sourcePosition: s.sourcePosition ? s.sourcePosition.value : null,
    paragraphSourcePosition: s.paragraphSourcePosition ? s.paragraphSourcePosition.value : null,
  });
  const actualFirst7 = [];
  for (let i = 0; i < Math.min(7, segs.length); i++) actualFirst7.push(shape(segs[i]));
  const expectedFirst7 = [
    { text: '<Hello world>.', position: { start: [0, 0, 0], end: [0, 0, 14] }, sourcePosition: 'epubcfi(/6/2!/4/2/1,:0,:14)', paragraphSourcePosition: 'epubcfi(/6/2!/4/2/1,:0,:14)' },
    { text: '“<The quick brown fox jumps over the lazy dog>!”', position: { start: [1, 0, 0], end: [1, 0, 48] }, sourcePosition: 'epubcfi(/6/2!/4/4/1,:0,:48)', paragraphSourcePosition: 'epubcfi(/6/2!/4/4/1,:0,:48)' },
    { text: '<The next sentence keeps its words and punctuation.>', position: { start: [2, 0, 0], end: [2, 0, 52] }, sourcePosition: 'epubcfi(/6/2!/4/6/1,:0,:52)', paragraphSourcePosition: 'epubcfi(/6/2!/4/6/1,:0,:52)' },
    { text: 'Ordinary text with a < comparison stays intact.', position: { start: [3, 0, 0], end: [3, 0, 47] }, sourcePosition: 'epubcfi(/6/2!/4/8/1,:0,:47)', paragraphSourcePosition: 'epubcfi(/6/2!/4/8/1,:0,:47)' },
    { text: '<Only the opening bracket stays intact.', position: { start: [4, 0, 0], end: [4, 0, 39] }, sourcePosition: 'epubcfi(/6/2!/4/10/1,:0,:39)', paragraphSourcePosition: 'epubcfi(/6/2!/4/10/1,:0,:39)' },
    { text: '<>', position: { start: [5, 0, 0], end: [5, 0, 2] }, sourcePosition: 'epubcfi(/6/2!/4/12/1,:0,:2)', paragraphSourcePosition: 'epubcfi(/6/2!/4/12/1,:0,:2)' },
    { text: '<The final sentence continues after the empty pair>.', position: { start: [6, 0, 0], end: [6, 0, 52] }, sourcePosition: 'epubcfi(/6/2!/4/14/1,:0,:52)', paragraphSourcePosition: 'epubcfi(/6/2!/4/14/1,:0,:52)' },
  ];
  const last4Actual = [];
  for (let i = 7; i < Math.min(11, segs.length); i++) last4Actual.push(shape(segs[i]));
  const expectedLast4Text = [
    'He cast [Fireball] at the wolf.',
    '[Level Up] You gained 100 exp.',
    'You gained < 100 exp> today.',
    'If x < 5 and y > 3, stop.',
  ];
  let last4Match = last4Actual.length === 4;
  for (let i = 0; i < last4Actual.length; i++) if (last4Actual[i].text !== expectedLast4Text[i]) last4Match = false;

  // Keep the real segment object references (not just their shapes) for later scripts.
  Zotero.ZoteroTTSRun.state.segments = {
    comparison: segs[3] || null,
    unmatched: segs[4] || null,
    fox: segs[1] || null,
    empty: segs[5] || null,
    fireball: segs[7] || null,
    levelUp: segs[8] || null,
    gained: segs[9] || null,
    ifx: segs[10] || null,
  };
  // Their shapes as read right now, for later scripts to diff against without re-reading this result.
  Zotero.ZoteroTTSRun.state.segmentShapesBefore = {
    comparison: actualFirst7[3] || null,
    unmatched: actualFirst7[4] || null,
    fox: actualFirst7[1] || null,
    empty: actualFirst7[5] || null,
    fireball: last4Actual[0] || null,
    levelUp: last4Actual[1] || null,
    gained: last4Actual[2] || null,
    ifx: last4Actual[3] || null,
  };
  Zotero.ZoteroTTSRun.state.voiceID = manager ? manager.selectedVoiceID : null;

  return JSON.stringify({
    error,
    trace: trace.length > 6 ? [trace[0], trace[1], trace[trace.length - 2], trace[trace.length - 1]] : trace,
    traceCount: trace.length,
    segmentTotal: segs.length,
    first7Unchanged: JSON.stringify(actualFirst7) === JSON.stringify(expectedFirst7),
    actualFirst7,
    last4Actual,
    last4Match,
    naturalCalls: calls,
    voiceID: manager ? manager.selectedVoiceID : null,
    voiceIsOurs: !!(manager && manager.selectedVoiceID && manager.selectedVoiceID.indexOf('::') !== -1),
    voiceIsFish: !!(manager && manager.selectedVoiceID && manager.selectedVoiceID.indexOf('fish::') === 0),
    final: { active: !!(manager && manager.active), paused: manager ? !!manager.paused : null },
  }, null, 1);
})()
