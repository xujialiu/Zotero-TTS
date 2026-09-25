// Issue #144, item 9: high-speed word boundaries on a foreground PDF and
// EPUB. The result keeps the complete bounded audio, ActiveWordChange, and
// iframe-rAF traces in the runner's scratch result. A 140 ms main-thread
// stall at 3x is marked with before/after observations. Omission denominators
// come from every real word boundary crossed between explicit heard-audio
// observations in the same segment; sparse samples are coverage evidence only.
// params: fixturesDir, runId. state: reads fixtures.A/baseline; writes item9
// and fixtures.E for teardown.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const P = Zotero.ZoteroTTSRun.params || {};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (test, ceiling = 20000, step = 30) => {
    const end = Date.now() + ceiling;
    while (Date.now() < end) {
      const value = await test();
      if (value) return value;
      await sleep(step);
    }
    return await test();
  };
  const out = { step: 'item9-high-speed-word-clock', speeds: [2, 2.5, 3], fixtures: [] };
  const fixtureDir = Zotero.isWin ? String(P.fixturesDir || '').replace(/\//g, '\\') : String(P.fixturesDir || '');
  if (!fixtureDir) throw new Error('fixturesDir is missing');
  if (!S.fixtures?.A?.itemID) throw new Error('baseline fixture A is missing');

  const readerOf = (itemID) => {
    const readers = Zotero.Reader?._readers || [];
    for (let i = 0; i < readers.length; i++) if (readers[i]?.itemID === itemID) return readers[i];
    return null;
  };
  const titleOf = (itemID) => {
    try {
      const item = Zotero.Items.get(itemID);
      return (item?.parentItem ?? item)?.getField('title') ?? null;
    } catch (e) {
      return null;
    }
  };
  const selectVisible = (reader) => {
    const host = Zotero.getMainWindow?.();
    try { host?.restore?.(); } catch (e) {}
    try { host?.focus?.(); } catch (e) {}
    try { Zotero_Tabs.select(reader.tabID); } catch (e) {}
    try { reader.focus?.(); } catch (e) {}
    try { reader._iframeWindow?.focus?.(); } catch (e) {}
  };
  const managerOf = (reader) => reader?._internalReader?._readAloudManager ?? null;
  const waitManager = (itemID) => wait(() => {
    const reader = readerOf(itemID);
    return reader?._internalReader?._readAloudManager ? reader : null;
  });
  const openReader = async (slot) => {
    let reader = readerOf(slot.itemID);
    if (!reader) {
      const pending = Zotero.Reader.open(slot.itemID, null, { openInBackground: false, allowDuplicate: false });
      if (pending?.then) await pending;
      reader = await waitManager(slot.itemID);
    }
    if (!reader) throw new Error(slot.kind + ' reader did not expose its Read Aloud manager');
    selectVisible(reader);
    const ready = await wait(() => {
      const doc = reader?._iframeWindow?.document;
      return managerOf(reader) && doc && doc.hidden === false ? true : null;
    }, 20000, 80);
    if (!ready) throw new Error(slot.kind + ' reader did not become visible');
    let manager = managerOf(reader);
    if (!manager.active) {
      try { reader._internalReader.toggleReadAloudPopup(true); } catch (e) { throw new Error(slot.kind + ' popup open failed: ' + String(e)); }
      manager = await wait(() => managerOf(reader)?.active ? managerOf(reader) : null, 20000, 50);
    }
    if (!manager?.active) throw new Error(slot.kind + ' manager did not activate');
    if (!String(manager.selectedVoiceID || '').includes('::')) throw new Error(slot.kind + ' selected a non-plugin voice');
    if (!manager.paused) {
      try { manager.pause(); } catch (e) {}
      await wait(() => managerOf(reader)?.paused === true, 5000, 30);
    }
    return reader;
  };

  const copyTiming = (timing) => timing ? {
    start: Number(timing.start), end: Number(timing.end),
    charStart: Number(timing.charStart), charEnd: Number(timing.charEnd),
  } : null;
  const timingEqual = (a, b) => !!a && !!b &&
    Number(a.start) === Number(b.start) && Number(a.end) === Number(b.end) &&
    Number(a.charStart) === Number(b.charStart) && Number(a.charEnd) === Number(b.charEnd);
  const copyTimings = (controller, segment) => {
    const raw = controller?.getTimestampsForSegment?.(segment);
    if (!raw) return [];
    const copied = [];
    for (let i = 0; i < Number(raw.length) || 0; i++) copied.push(copyTiming(raw[i]));
    return copied;
  };
  const latestDue = (timings, heard) => {
    if (!Number.isFinite(heard)) return null;
    let result = null;
    let due = -Infinity;
    for (let i = 0; i < timings.length; i++) {
      const timing = timings[i];
      if (!timing || !(timing.end > 0) || !(timing.start <= heard)) continue;
      if (timing.start >= due) { due = timing.start; result = i; }
    }
    return result;
  };
  const addKey = (set, segmentIndex, index) => {
    if (segmentIndex !== null && segmentIndex !== undefined && index !== null && index !== undefined) set.add(segmentIndex + ':' + index);
  };
  const keysForRows = (rows, segmentIndex) => {
    const keys = new Set();
    for (const row of rows) if (row.segmentIndex === segmentIndex) addKey(keys, row.segmentIndex, row.index);
    return keys;
  };
  const sortedKeys = (set) => [...set].sort((a, b) => {
    const [as, ai] = a.split(':').map(Number), [bs, bi] = b.split(':').map(Number);
    return as - bs || ai - bi;
  });
  const difference = (all, seen) => sortedKeys(new Set([...all].filter((key) => !seen.has(key))));
  const diagFor = async (itemID) => {
    const all = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < all.readers.length; i++) if (all.readers[i].itemID === itemID) return all.readers[i];
    return null;
  };
  const syncDiagFor = (itemID) => {
    try {
      const all = JSON.parse(Zotero.ZoteroTTS.diagnostics.engine());
      for (let i = 0; i < all.readers.length; i++) if (all.readers[i].itemID === itemID) return all.readers[i];
    } catch (e) {
      return { diagnosticError: String(e) };
    }
    return null;
  };
  const audioSnapshot = (diagnostic, at) => {
    if (!diagnostic || diagnostic.diagnosticError) return diagnostic ? { at, error: diagnostic.diagnosticError } : null;
    const speed = Number(diagnostic.session?.speed) || 1;
    const playbackTime = Number(diagnostic.session?.playbackTime);
    const latency = Number(diagnostic.audio?.latency) || 0;
    return {
      at,
      segmentIndex: diagnostic.session?.currentIndex ?? null,
      index: diagnostic.session?.activeTimestampIndex ?? null,
      playbackTime,
      latency,
      speed,
      heardPosition: Number.isFinite(playbackTime) ? playbackTime - latency * speed : null,
      state: diagnostic.audio?.state ?? null,
    };
  };
  const nearestSample = (samples, row) => {
    let best = null;
    let distance = Infinity;
    for (const sample of samples) {
      if (row.segmentIndex !== null && sample.segmentIndex !== row.segmentIndex) continue;
      const d = Math.abs(sample.at - row.at);
      if (d < distance) { distance = d; best = sample; }
    }
    return best ? { distanceMs: distance, expectedIndex: best.expectedIndex, heardPosition: best.heardPosition } : null;
  };

  let host = null;
  try {
    host = Zotero.getMainWindow?.();
    const epubPath = PathUtils.join(fixtureDir, 'return-key', 'return-key.epub');
    let epub = S.fixtures.E;
    if (!epub?.itemID || !Zotero.Items.get(epub.itemID)) {
      const imported = await Zotero.Attachments.importFromFile({
        file: epubPath,
        libraryID: Zotero.Libraries.userLibraryID,
        title: 'ztts-144 high-speed EPUB ' + String(P.runId || Date.now()),
      });
      const item = typeof imported === 'number' ? Zotero.Items.get(imported) : imported;
      if (!item?.id) throw new Error('EPUB import returned no item');
      epub = { itemID: item.id, key: item.key, title: item.getField('title') };
      S.fixtures.E = epub;
    }
    const slots = [
      { kind: 'pdf', itemID: S.fixtures.A.itemID },
      { kind: 'epub', itemID: epub.itemID },
    ];
    for (const slot of slots) {
      const reader = await openReader(slot);
      const ir = reader._internalReader;
      const manager = managerOf(reader);
      const rawSegments = ir?._readAloudSegments?.segments;
      const paragraphs = [];
      for (let i = 0; i < Number(rawSegments?.length) || 0; i++) {
        const segment = rawSegments[i];
        const text = String(segment?.text || '');
        const nextText = String(rawSegments[i + 1]?.text || '');
        if (segment?.anchor === 'paragraphStart' && nextText.length >= 80) {
          paragraphs.push({ paragraphIndex: i, targetIndex: i + 1, paragraphText: text.slice(0, 180), targetText: nextText.slice(0, 240) });
        }
      }
      if (!paragraphs.length) throw new Error(slot.kind + ' has no paragraph followed by a long timed sentence');
      const targetInfo = paragraphs[0];
      const target = targetInfo.targetIndex;
      const fixtureOut = { kind: slot.kind, itemID: slot.itemID, title: titleOf(slot.itemID), tabID: reader.tabID, target, paragraphs: paragraphs.slice(0, 8), runs: [] };
      out.fixtures.push(fixtureOut);
      const segmentIndexOf = (controller, value) => {
        const position = Number(controller?.position);
        if (Number.isInteger(position)) return position;
        const list = manager?._segments;
        for (let i = 0; i < Number(list?.length) || 0; i++) if (list[i] === value) return i;
        return null;
      };
      const notify = () => { try { reader._iframeWindow.document.notifyUserGestureActivation(); } catch (e) {} };

      for (const speed of [2, 2.5, 3]) {
        selectVisible(reader);
        const m = managerOf(reader);
        if (!m?.active) throw new Error(slot.kind + ' manager closed before speed ' + speed);
        if (!m.paused) { try { m.pause(); } catch (e) {} await wait(() => managerOf(reader)?.paused === true, 4000, 20); }
        m.setSpeed(speed);
        m.repositionTo(target);
        await sleep(40);
        const controller = Components.utils.waiveXrays(m._controller);
        if (!controller || typeof controller.addEventListener !== 'function' || typeof controller.getTimestampsForSegment !== 'function') {
          throw new Error(slot.kind + ' controller not usable at speed ' + speed);
        }
        const child = reader._iframeWindow;
        const runStarted = Date.now();
        const counterBeforeDiagnostic = await diagFor(slot.itemID);
        const counterBefore = counterBeforeDiagnostic?.session?.wordClock ? { ...counterBeforeDiagnostic.session.wordClock } : null;
        const eventRows = [];
        const frameRows = [];
        const samples = [];
        const eventErrors = [];
        const frameErrors = [];
        const timingsCache = new Map();
        const timingsFor = (segmentIndex) => {
          if (timingsCache.has(segmentIndex)) return timingsCache.get(segmentIndex);
          const segment = manager?._segments?.[segmentIndex];
          const timings = copyTimings(controller, segment);
          timingsCache.set(segmentIndex, timings);
          return timings;
        };
        const eventFn = Components.utils.exportFunction(function () {
          try {
            const at = Date.now() - runStarted;
            const beforeDiagnostic = syncDiagFor(slot.itemID);
            const index = Number.isInteger(controller.activeTimestampIndex) ? controller.activeTimestampIndex : null;
            const segmentIndex = segmentIndexOf(controller, manager?._activeSegment ?? null);
            const timings = segmentIndex === null ? [] : timingsFor(segmentIndex);
            const timing = index === null ? null : (timings[index] || null);
            const afterDiagnostic = syncDiagFor(slot.itemID);
            eventRows.push({
              at,
              segmentIndex,
              index,
              timing: copyTiming(timing),
              audioBefore: audioSnapshot(beforeDiagnostic, at),
              audioAfter: audioSnapshot(afterDiagnostic, at),
            });
          } catch (e) {
            eventErrors.push(String(e));
          }
        }, child, { allowCrossOriginArguments: true });
        controller.addEventListener('ActiveWordChange', eventFn);

        let resolveFrames;
        const framePromise = new Promise((resolve) => { resolveFrames = resolve; });
        let rafHandle = null;
        let rafTimer = null;
        const finishFrames = () => {
          if (rafTimer !== null) { clearTimeout(rafTimer); rafTimer = null; }
          if (rafHandle !== null) { try { child.cancelAnimationFrame?.(rafHandle); } catch (e) {} rafHandle = null; }
          resolveFrames();
        };
        const frameFn = (timestamp) => {
          try {
            const at = Date.now() - runStarted;
            const index = Number.isInteger(controller.activeTimestampIndex) ? controller.activeTimestampIndex : null;
            const segmentIndex = segmentIndexOf(controller, manager?._activeSegment ?? null);
            const timings = segmentIndex === null ? [] : timingsFor(segmentIndex);
            frameRows.push({
              at,
              raf: Number(timestamp),
              segmentIndex,
              index,
              timingForIndex: index === null ? null : copyTiming(timings[index]),
              managerTiming: copyTiming(m.activeTimestamp),
              sample: null,
            });
          } catch (e) {
            frameErrors.push(String(e));
          }
          if (traceEnd !== null && Date.now() < traceEnd && !sampleStop) rafHandle = child.requestAnimationFrame(frameFn);
          else finishFrames();
        };
        let sampleStop = false;
        let traceEnd = null;
        let speakingAt = null;
        let stall = null;
        let firstPlaying = null;
        const startPlaying = async () => {
          notify();
          try { m.play(); } catch (e) { out.playError = (out.playError || []).concat(slot.kind + '@' + speed + ': ' + String(e)); }
          return await wait(async () => {
            const diagnostic = await diagFor(slot.itemID);
            return diagnostic?.session?.currentIndex === target && diagnostic.session.playing ? diagnostic : null;
          }, 20000, 20);
        };
        let sampleLoop = null;
        try {
          firstPlaying = await startPlaying();
          if (!firstPlaying) throw new Error(slot.kind + ' did not start target ' + target + ' at ' + speed + 'x');
          speakingAt = Date.now();
          traceEnd = speakingAt + 1400;
          rafHandle = child.requestAnimationFrame(frameFn);
          rafTimer = setTimeout(finishFrames, 2000);
          sampleLoop = (async () => {
            while (!sampleStop && Date.now() < traceEnd) {
              const diagnostic = await diagFor(slot.itemID);
              if (diagnostic) {
                const current = diagnostic.session?.currentIndex ?? null;
                const audio = audioSnapshot(diagnostic, Date.now() - runStarted);
                const timings = current === null ? [] : timingsFor(current);
                samples.push({
                  at: audio?.at ?? Date.now() - runStarted,
                  segmentIndex: current,
                  index: diagnostic.session?.activeTimestampIndex ?? null,
                  expectedIndex: latestDue(timings, audio?.heardPosition),
                  audioTime: audio?.playbackTime ?? null,
                  latency: audio?.latency ?? null,
                  heardPosition: audio?.heardPosition ?? null,
                  speed: audio?.speed ?? speed,
                  state: audio?.state ?? null,
                });
              }
              await sleep(12);
            }
          })();
          const deliberateDelay = speed === 3 ? 140 : 0;
          if (deliberateDelay) {
            await sleep(260);
            const preStall = await diagFor(slot.itemID);
            const stallStartAt = Date.now() - speakingAt;
            stall = { requestedMs: deliberateDelay, startAtMs: stallStartAt, start: audioSnapshot(preStall, Date.now() - runStarted), startedWhileTargetPlaying: preStall?.session?.currentIndex === target && preStall?.session?.playing === true };
            const blockStart = Date.now();
            while (Date.now() - blockStart < deliberateDelay) {}
            const blockEnd = Date.now();
            const postStall = await diagFor(slot.itemID);
            stall.endAtMs = blockEnd - speakingAt;
            stall.actualMs = blockEnd - blockStart;
            stall.end = audioSnapshot(postStall, blockEnd - runStarted);
            stall.endedWhileTargetPlaying = postStall?.session?.currentIndex === target && postStall?.session?.playing === true;
          }
          while (Date.now() < traceEnd) await sleep(20);
          sampleStop = true;
          await Promise.race([sampleLoop, sleep(1000)]);
          await Promise.race([framePromise, sleep(1000)]);
        } finally {
          sampleStop = true;
          finishFrames();
          try { controller.removeEventListener('ActiveWordChange', eventFn); } catch (e) {}
          try { if (m.active && !m.paused) m.pause(); } catch (e) {}
        }

        const after = await diagFor(slot.itemID);
        const counterAfter = after?.session?.wordClock ? { ...after.session.wordClock } : null;
        const delta = counterBefore && counterAfter ? { ticks: Number(counterAfter.ticks) - Number(counterBefore.ticks), shortWaits: Number(counterAfter.shortWaits) - Number(counterBefore.shortWaits), backoffs: Number(counterAfter.backoffs) - Number(counterBefore.backoffs) } : null;
        for (const row of frameRows) row.sample = nearestSample(samples, row);
        const targetSamples = samples.filter((row) => row.segmentIndex === target && Number.isFinite(row.heardPosition));
        const startAudio = audioSnapshot(firstPlaying, speakingAt - runStarted);
        const endRow = targetSamples[targetSamples.length - 1] || null;
        const endAudio = endRow ? { at:endRow.at, segmentIndex:target, heardPosition:endRow.heardPosition, playbackTime:endRow.audioTime, latency:endRow.latency, speed:endRow.speed, state:endRow.state } : null;
        const targetTimings = timingsFor(target);
        const heardStart = Number(startAudio?.heardPosition), heardEnd = Number(endAudio?.heardPosition);
        const expectedKeys = new Set();
        const initialDue = latestDue(targetTimings, heardStart);
        if (initialDue !== null) addKey(expectedKeys, target, initialDue);
        if (Number.isFinite(heardEnd)) for (let i = 0; i < targetTimings.length; i++) if (targetTimings[i] && targetTimings[i].start > heardStart && targetTimings[i].start <= heardEnd) addKey(expectedKeys, target, i);
        const eventKeys = keysForRows(eventRows, target);
        const frameKeys = keysForRows(frameRows, target);
        const eventWithSamples = eventRows.map((row) => ({ ...row, nearestSample: nearestSample(samples, row) }));
        const frameWithSamples = frameRows.map((row) => ({ ...row }));
        const compareEventClock = (row) => {
          const before = row.audioBefore, afterAudio = row.audioAfter, timing = row.timing;
          if (!timing || !before || !afterAudio || !Number.isFinite(before.heardPosition) || !Number.isFinite(afterAudio.heardPosition)) return { classification:'unavailable' };
          const quantum = 128 / 48000 * Math.max(1, Number(afterAudio.speed) || speed);
          const expectedBefore = latestDue(targetTimings, before.heardPosition), expectedAfter = latestDue(targetTimings, afterAudio.heardPosition);
          const inClockRange = timing.start >= before.heardPosition - quantum && timing.start <= afterAudio.heardPosition + quantum;
          return { classification: row.index === expectedBefore || row.index === expectedAfter ? 'due' : inClockRange ? 'observation-skew' : 'outside-clock-range', expectedBefore, expectedAfter, quantumSeconds:quantum, heardBefore:before.heardPosition, heardAfter:afterAudio.heardPosition, readRangeMs:Math.max(0, (afterAudio.at ?? 0) - (before.at ?? 0)) };
        };
        for (const row of eventWithSamples) row.clock = compareEventClock(row);
        const frameTimingChecks = frameRows.map((row) => ({ at:row.at, segmentIndex:row.segmentIndex, index:row.index, managerTiming:row.managerTiming, timingForIndex:row.timingForIndex, matchesIndex:row.index === null ? null : timingEqual(row.managerTiming, row.timingForIndex) }));
        const eventAfterStall = stall ? eventWithSamples.find((row) => row.at - (speakingAt - runStarted) >= stall.endAtMs && row.segmentIndex === target) || null : null;
        const frameAfterStall = stall ? frameWithSamples.find((row) => row.at - (speakingAt - runStarted) >= stall.endAtMs && row.segmentIndex === target) || null : null;
        const postExpected = stall?.end?.segmentIndex === target ? latestDue(targetTimings, stall.end.heardPosition) : null;
        const eventIndicesAfterStall = eventWithSamples.filter((row) => stall && row.at - (speakingAt - runStarted) >= stall.endAtMs && row.segmentIndex === target && row.index !== null).map((row) => row.index);
        const replayedAfterStall = [];
        let maximum = -1;
        for (const index of eventIndicesAfterStall) { if (index < maximum) replayedAfterStall.push(index); maximum = Math.max(maximum, index); }
        fixtureOut.runs.push({
          fixture:slot.kind, speed, paragraphStart:targetInfo.paragraphIndex, target, targetText:targetInfo.targetText, timings:targetTimings,
          counterBefore, counterAfter, counterDelta:delta,
          audioStartObservation:startAudio, audioEndObservation:endAudio, sameSegmentAudioWindow:!!endAudio && endAudio.segmentIndex === target,
          stall:stall ? { ...stall, speakingOffsetMs:speakingAt - runStarted, firstEventAfter:eventAfterStall, firstFrameAfter:frameAfterStall, postExpectedIndex:postExpected, eventIndicesAfterStall, replayedAfterStall, latestDueSelectedAfterStall:eventAfterStall ? eventAfterStall.index >= (postExpected ?? eventAfterStall.index) : null } : { requestedMs:0 },
          samples,
          events:{ count:eventWithSamples.length, rows:eventWithSamples, errors:eventErrors, expectedKeys:sortedKeys(expectedKeys), observedKeys:sortedKeys(eventKeys), omissionsAmongTimestampBoundaries:difference(expectedKeys,eventKeys), clockOutsideRange:eventWithSamples.filter((row) => row.clock.classification === 'outside-clock-range').length, observationSkew:eventWithSamples.filter((row) => row.clock.classification === 'observation-skew').length },
          frames:{ count:frameWithSamples.length, rows:frameWithSamples, errors:frameErrors, expectedKeys:sortedKeys(expectedKeys), observedKeys:sortedKeys(frameKeys), omissionsAmongTimestampBoundaries:difference(expectedKeys,frameKeys), managerTimingMatchesIndex:frameTimingChecks.filter((row) => row.matchesIndex === true).length, managerTimingMismatches:frameTimingChecks.filter((row) => row.matchesIndex === false).length, timingChecks:frameTimingChecks },
          traceWindowMs:Number(endAudio?.at) - Number(startAudio?.at),
        });
      }
    }
    const allRuns = [];
    for (const fixture of out.fixtures) for (const run of fixture.runs) allRuns.push(run);
    out.summary = {
      runCount:allRuns.length,
      everyTraceStartedWhilePlaying:allRuns.every((run) => run.audioStartObservation?.state === 'running'),
      counterDeltas:allRuns.map((run) => ({ fixture:run.fixture, speed:run.speed, delta:run.counterDelta })),
      timestampBoundaryOmissions:allRuns.map((run) => ({ fixture:run.fixture, speed:run.speed, events:run.events.omissionsAmongTimestampBoundaries, frames:run.frames.omissionsAmongTimestampBoundaries })),
      stallChecks:allRuns.filter((run) => run.speed === 3).map((run) => ({ fixture:run.fixture, startedWhileTargetPlaying:run.stall.startedWhileTargetPlaying, actualMs:run.stall.actualMs, firstEventAfter:run.stall.firstEventAfter?.index ?? null, postExpected:run.stall.postExpectedIndex, replayed:run.stall.replayedAfterStall })),
    };
    S.item9 = out;
    return JSON.stringify(out, null, 1);
  } finally {
    try {
      for (const id of [S.fixtures?.A?.itemID, S.fixtures?.E?.itemID]) {
        const reader = id ? readerOf(id) : null;
        const manager = reader ? managerOf(reader) : null;
        if (manager?.active && !manager.paused) manager.pause();
      }
    } catch (e) {}
    try { host?.minimize?.(); } catch (e) {}
  }
})();
