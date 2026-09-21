(async () => {
  // Case item 2: "Internal comparisons and an unmatched bracket remain
  // unchanged" -- paragraph 4 (a math-sign comparison) and paragraph 5
  // (an opening bracket with no partner). Text only: a blocked fetch is
  // enough, since neither is expected to remove anything.
  const manager = (() => {
    const fixtureID = Zotero.ZoteroTTSRun.state.fixtureItemID;
    const list = Zotero.Reader._readers || [];
    for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) return list[i]._internalReader?._readAloudManager;
    return null;
  })();
  const iface = manager?._options?.remoteInterface;
  const voiceID = Zotero.ZoteroTTSRun.state.voiceID;
  const sandbox = Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
  const originalFetch = sandbox.fetch;
  let currentCalls = [];
  sandbox.fetch = function (input, init) {
    let body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) {}
    currentCalls.push({ text: typeof body?.text === 'string' ? body.text : null });
    return Promise.reject(new Error('zotero-tester: request blocked before the network (issue #127 item-2 comparison/unmatched probe)'));
  };
  const expected = {
    comparison: 'Ordinary text with a < comparison stays intact.',
    unmatched: '<Only the opening bracket stays intact.',
  };
  const results = {};
  let fatal = null;
  try {
    if (!iface || !voiceID) throw new Error('fixture remote interface or voice missing');
    for (const key of ['comparison', 'unmatched']) {
      currentCalls = [];
      const segment = Zotero.ZoteroTTSRun.state.segments?.[key];
      if (!segment) { results[key] = { error: 'segment missing' }; continue; }
      try { await iface.getAudio(segment, { id: voiceID }); } catch (e) {}
      const requestText = currentCalls[0]?.text ?? null;
      results[key] = { requestText, matchesExpected: requestText === expected[key] };
    }
  } catch (e) { fatal = { message: String(e), stack: e?.stack || null }; }
  finally { sandbox.fetch = originalFetch; }
  return JSON.stringify({
    voiceID, results, fatal,
    allUnchanged: !!(results.comparison?.matchesExpected && results.unmatched?.matchesExpected),
  }, null, 1);
})()
