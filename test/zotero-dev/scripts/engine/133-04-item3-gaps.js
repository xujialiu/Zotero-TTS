// Item 3: the pause between sentences (issue #44), read at every boundary.
// Defaults: gaps.last {ms:0, paragraph:false} sentence-to-sentence,
// {ms:round(200/speed), paragraph:true} before a paragraph. Custom
// (sentence 1000, paragraph 400) at 2x: ms 500 and 700. Both switches off:
// the voice's own delay (0, a plugin voice) sentence-to-sentence, plus a flat
// 200 before a paragraph at every speed (checked at 2x and 3x). A pause
// inside the gap drops the rest of it: inGap false at once, Play starts the
// next sentence from 0.
// Reuses the session 133-02 opened (paragraph starts 0/5/9/12/15, so 1->2 is
// a plain sentence boundary and 4->5 is a paragraph boundary). setSpeed()
// with one argument does not persist to readAloud.memory (reader.js
// setSpeed(speed, persist=false)), so no speed pref needs restoring; the
// sentence/paragraph delay prefs are changed here and restored at the end.
// params: none. state: reads fixtures.A; writes item3.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item3-gaps' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found -- run 133-02 first');
  const ir = r._internalReader;
  let m = ir._readAloudManager;
  if (!m.active) throw new Error('manager not active -- reopen the popup before this script');

  const PREFIX = 'zotero-tts.';
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const set = (k, v) => Zotero.Prefs.set(PREFIX + k, v);
  const before = {
    sentenceDelayEnabled: get('readAloud.sentenceDelayEnabled'), sentenceDelayMs: get('readAloud.sentenceDelayMs'),
    paragraphDelayEnabled: get('readAloud.paragraphDelayEnabled'), paragraphDelayMs: get('readAloud.paragraphDelayMs'),
  };

  const engineFor = async () => {
    const eng = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine());
    for (let i = 0; i < eng.readers.length; i++) if (eng.readers[i].itemID === itemID) return eng.readers[i];
    return null;
  };
  // Reposition to `index` (this un-pauses and starts it playing -- reader.js
  // repositionTo), wait for a new gap to be recorded (gaps.count above the
  // value it had for the LAST transition observed, i.e. index+1's boundary),
  // then pause at once so nothing plays further than needed.
  const observeGap = async (index, ceilingMs = 15000) => {
    m.repositionTo(index);
    const t0 = Date.now();
    let last = null;
    let countBefore = null;
    while (Date.now() - t0 < ceilingMs) {
      const eng = await engineFor();
      if (countBefore === null) countBefore = eng.session.gaps.count;
      if (eng.session.gaps.count > countBefore) { last = eng.session.gaps; break; }
      await sleep(40);
    }
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    return { index, ms: Date.now() - t0, gaps: last };
  };

  // A: defaults, speed exactly 2x for clean arithmetic
  m.setSpeed(2);
  out.defaultsSentence = await observeGap(1); // 1 -> 2 (not a paragraph start)
  out.defaultsParagraph = await observeGap(4); // 4 -> 5 (a paragraph start)

  // B: custom (1000 sentence, 400 paragraph) at 2x -> 500, 700
  set('readAloud.sentenceDelayMs', 1000);
  set('readAloud.paragraphDelayMs', 400);
  out.customSentence = await observeGap(1);
  out.customParagraph = await observeGap(4);

  // C: both switches off -> the voice's own delay (0, a plugin voice)
  // sentence-to-sentence; a flat 200 before a paragraph, at every speed
  set('readAloud.sentenceDelayEnabled', false);
  set('readAloud.paragraphDelayEnabled', false);
  out.offSentenceAt2x = await observeGap(1);
  out.offParagraphAt2x = await observeGap(4);
  m.setSpeed(3);
  out.offParagraphAt3x = await observeGap(4);

  // D: a pause inside the gap drops the rest of it (long, easy-to-catch gap)
  set('readAloud.sentenceDelayEnabled', true);
  set('readAloud.paragraphDelayMs', 400);
  set('readAloud.paragraphDelayEnabled', true);
  set('readAloud.sentenceDelayMs', 2000);
  m.setSpeed(1);
  m.repositionTo(1); // 1 -> 2, a 2000 ms sentence gap at 1x
  let caughtInGap = false;
  const tGap0 = Date.now();
  while (Date.now() - tGap0 < 8000) {
    const eng = await engineFor();
    if (eng.session.inGap) { caughtInGap = true; break; }
    await sleep(15);
  }
  const beforePause = caughtInGap ? await engineFor() : null;
  const posAtGapEntry = beforePause ? beforePause.session.position : null;
  if (caughtInGap) m.pause();
  const afterPause = await engineFor();
  out.pauseInGap = {
    caughtInGap,
    catchMs: Date.now() - tGap0,
    posAtGapEntry,
    inGapImmediatelyAfterPause: afterPause.session.inGap,
    pausedFlag: afterPause.session.paused,
    positionAfterPause: afterPause.session.position,
  };
  if (caughtInGap) {
    m.play();
    await sleep(150); // let the resumed sentence actually start
    const afterPlay = await engineFor();
    out.pauseInGap.positionAfterPlay = afterPlay.session.position;
    out.pauseInGap.currentIndexAfterPlay = afterPlay.session.currentIndex;
    out.pauseInGap.playbackTimeAfterPlay = afterPlay.session.playbackTime;
    out.pauseInGap.startsFromZero = afterPlay.session.playbackTime < 0.25; // a hard cut at 1x, generous slack
    out.pauseInGap.startsAtNextSentence = afterPlay.session.currentIndex === posAtGapEntry;
  }
  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  // Restore the pause prefs to their baseline
  for (const k of Object.keys(before)) set('readAloud.' + k, before[k]);
  out.restored = {
    sentenceDelayEnabled: get('readAloud.sentenceDelayEnabled'), sentenceDelayMs: get('readAloud.sentenceDelayMs'),
    paragraphDelayEnabled: get('readAloud.paragraphDelayEnabled'), paragraphDelayMs: get('readAloud.paragraphDelayMs'),
  };
  out.restoredMatchesBaseline = JSON.stringify(out.restored) === JSON.stringify(before);

  S.item3 = out;
  return JSON.stringify(out, null, 1);
})();
