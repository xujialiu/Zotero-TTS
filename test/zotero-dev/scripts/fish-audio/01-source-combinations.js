(async () => {
  const prefix = 'extensions.zotero.zotero-tts.';
  const prefs = Services.prefs;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const sourceNames = ['official', 'own', 'manual'];
  const setSources = sources => {
    for (const name of sourceNames) prefs.setBoolPref(prefix + `fish.include${name[0].toUpperCase()}${name.slice(1)}`, !!sources[name]);
  };
  const compact = report => {
    const ids = Array.isArray(report.ids) ? report.ids : [];
    const defaultIDs = ids.filter(id => id === 'mul/default');
    return {
      sources: report.sources,
      count: report.count,
      defaultIDs,
      defaultCount: defaultIDs.length,
      ids: { first: ids.slice(0, 2), last: ids.slice(-2) },
      notices: report.notices || [],
      cacheHits: report.cacheHits,
      loads: report.loads,
      cachedAccounts: report.cachedAccounts,
    };
  };
  const checks = [];
  for (let mask = 0; mask < 8; mask++) {
    const sources = {
      official: !!(mask & 1),
      own: !!(mask & 2),
      manual: !!(mask & 4),
    };
    setSources(sources);
    await sleep(100);
    const report = JSON.parse(await Zotero.ZoteroTTS.diagnostics.fishVoices(true));
    const compactReport = compact(report);
    const sourceMatch = sourceNames.every(name => !!compactReport.sources?.[name] === sources[name]);
    const defaultMatch = compactReport.defaultCount === (sources.own ? 1 : 0);
    const emptyMatch = mask === 0 && compactReport.count === 0 && compactReport.ids.first.length === 0 && compactReport.ids.last.length === 0;
    checks.push({ sources, report: compactReport, sourceMatch, defaultMatch, emptyMatch });
  }
  const cacheSequence = [];
  for (const own of [true, false, true]) {
    const sources = { official: true, own, manual: false };
    setSources(sources);
    await sleep(100);
    const report = compact(JSON.parse(await Zotero.ZoteroTTS.diagnostics.fishVoices(true)));
    cacheSequence.push({ sources, report, defaultPresent: report.defaultCount === (own ? 1 : 0) });
  }
  const allPass = checks.every(check => check.sourceMatch && check.defaultMatch && (check.sources.official || check.sources.own || check.sources.manual || check.emptyMatch))
    && cacheSequence.every(check => check.defaultPresent);
  if (!allPass) throw new Error(`Fish source/default mismatch: ${JSON.stringify({ checks, cacheSequence })}`);
  return JSON.stringify({ status: 'PASS', checks, cacheSequence }, null, 1);
})();
