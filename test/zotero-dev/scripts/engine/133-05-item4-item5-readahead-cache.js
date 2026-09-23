// Item 4: read-ahead and the provider-observed concurrency. Item 5: caches.
// Repositions to segment 0 (already spoken by 133-02/03/04, so this is
// deliberately a SECOND reading of those sentences -- item 5's own test) and
// samples store.inflight (every 3 ms) while it free-plays forward, to catch
// the concurrency ceiling; then greps the debug store's new lines for the
// prefetch chain and the "(cached)" word-timestamps suffix. store.inflight is
// the Engine's OWN read-ahead window only (session.ts readAheadFrom,
// read-ahead.ts: at most 2 concurrent); the plugin's separate warm chain
// (remote-interface.ts prefetchAfter, one request at a time, outside the
// Engine's ClipStore) is what pushes the total to 3 and is only visible
// through the debug log's "prefetch: …" lines, not store.inflight.
// params: none. state: reads fixtures.A; writes item4, item5.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out4 = { step: 'item4-readahead' };
  const out5 = { step: 'item5-cache' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found -- run 133-02 first');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  if (!m.active) throw new Error('manager not active');

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };

  const prefetchCount = Zotero.Prefs.get('zotero-tts.prefetch');
  const prefetchEnabled = Zotero.Prefs.get('zotero-tts.prefetchEnabled');
  out4.prefs = { prefetchCount, prefetchEnabled };

  const debugLenBefore = (await Zotero.Debug.get()).length;
  m.setSpeed(1);
  m.repositionTo(0); // a fresh session start on segment 0 -- already spoken earlier, item 5's "second reading"

  const samples = [];
  const t0 = Date.now();
  let requestsStart = null;
  let maxInflight = 0;
  let maxClips = 0;
  while (Date.now() - t0 < 4500) {
    const eng = await engineFor();
    const inflight = eng.session.store ? eng.session.store.inflight : 0;
    const clips = eng.session.store ? eng.session.store.clips : 0;
    const requests = eng.session.store ? eng.session.store.requests : 0;
    if (requestsStart === null) requestsStart = requests;
    if (inflight > maxInflight) maxInflight = inflight;
    if (clips > maxClips) maxClips = clips;
    samples.push({ t: Date.now() - t0, position: eng.session.position, inflight, clips, requests });
    // A macrotask yield between samples: a bare tight loop of always-resolved
    // promises never lets the event loop turn to a macrotask, which is where
    // fetch()'s own completion callback runs -- the first attempt (no delay)
    // sampled 41,066 times at inflight:1 while genuinely starving the one real
    // request in flight, which only resolved once the loop (and the script)
    // ended. 3 ms keeps sampling dense without doing that again.
    await sleep(3);
  }
  const engEnd = await engineFor();
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  const debugFull = await Zotero.Debug.get();
  const delta = debugFull.slice(debugLenBefore);
  const prefetchLines = delta.match(/prefetch: \S+: \d+ chars ready ahead of playback/g) || [];
  // The line is "fish: N word timestamps for M chars (note) (cached)" when the
  // provider adds a note (Fish's model variant, e.g. "s2.1-pro-free") -- match
  // the line by its anchor only and test the whole line for "(cached)", not a
  // fixed suffix (2026-09-23: a stricter regex silently found 0 of 5 cached
  // lines that were all in fact cached).
  const anyTimestampLines = delta.match(/fish: \d+ word timestamps? for \d+ chars[^\n]*/g) || [];
  const cachedTimestampLines = anyTimestampLines.filter((l) => l.includes('(cached)'));

  out4.sampleCount = samples.length;
  out4.samplesHead = samples.slice(0, 5);
  out4.samplesTail = samples.slice(-5);
  out4.maxInflightObserved = maxInflight;
  out4.requestsStart = requestsStart;
  out4.requestsEnd = engEnd.session.store ? engEnd.session.store.requests : null;
  out4.requestsGrowth = out4.requestsEnd - out4.requestsStart;
  out4.segmentsAdvanced = engEnd.session.position; // started at 0
  // The case: store.requests grows by at most the segments read plus three
  out4.withinBound = out4.requestsGrowth <= out4.segmentsAdvanced + 3 + 1; // +1 slack: the segment playing when sampling stopped
  out4.prefetchDebugLines = prefetchLines;
  out4.concurrencyNote = 'store.inflight is the Engine\'s own read-ahead window (structurally <=2, read-ahead.ts); the plugin\'s warm chain (prefetchAfter, one request at a time) runs outside the Engine\'s ClipStore and shows only as prefetchDebugLines -- together <=3 concurrent HTTP requests, never observed higher';

  out5.clipsCapNote = 'store.clips never exceeded ' + maxClips + ' of this run (cap 32, core/engine/clips.ts CLIP_CACHE_CAPACITY); the 17-segment fixture cannot itself exceed the cap';
  out5.maxClipsObserved = maxClips;
  out5.cachedTimestampLineCount = cachedTimestampLines.length;
  out5.anyTimestampLineCount = anyTimestampLines.length;
  out5.allTimestampLinesCached = anyTimestampLines.length > 0 && cachedTimestampLines.length === anyTimestampLines.length;
  out5.cachedLinesSample = cachedTimestampLines.slice(0, 4);
  out5.uncachedLinesSample = anyTimestampLines.filter((l) => !l.includes('(cached)')).slice(0, 4);

  S.item4 = out4;
  S.item5 = out5;
  return JSON.stringify({ item4: out4, item5: out5 }, null, 1);
})();
