// Item 3: the pause between sentences and before a paragraph (issues #44,
// #142), read at every boundary. REVISED 2026-09-25 for #142: the paragraph
// pause is now the WHOLE pause where a paragraph begins -- the paragraph
// setting alone, never added to the sentence setting -- and a switch that is
// off gives 0, with no fallback to the voice's catalog sentenceDelay or
// Zotero's flat 200 any more (src/core/engine/gap.ts computeGap). Defaults:
// gaps.last {ms:0, paragraph:false} sentence-to-sentence, {ms:round(200/speed),
// paragraph:true} before a paragraph. Custom (sentence 1000, paragraph 400)
// at 2x: ms 500 and 200 (the OLD formula summed 0+200 -> 700; #142 removed
// the sum). Both switches off: 0 everywhere, at every speed (checked at 1x,
// 2x and 3x; the OLD formula still gave a flat 200 before a paragraph even
// with the switch off -- #142 removed that fallback too). A pause inside the
// gap drops the rest of it: inGap false at once, gaps.count unchanged until
// the next boundary, Play starts the next sentence from 0.
// Reuses whichever script opened state.fixtures.A with an active plugin-voice
// session (133-02 in a full engine.md run; the sentence-pauses kit's own
// 142-02 when this script runs for issue #142's narrower verification -- both
// leave the same 17-segment fixture-a.pdf, paragraph starts 0/5/9/12/15, so
// 1->2 is a plain sentence boundary and 4->5 is a paragraph boundary).
// setSpeed() with one argument does not persist to readAloud.memory
// (reader.js setSpeed(speed, persist=false)), so no speed pref needs
// restoring; the sentence/paragraph delay prefs are changed here and
// restored at the end.
// params: none. state: reads fixtures.A; writes item3.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item3-gaps' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found -- run 133-02 (or the sentence-pauses kit\'s 142-02) first');
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

  // The pane's own arithmetic (core/engine/gap.ts computeGap), mirrored here
  // so every sample below self-reports expected vs observed rather than
  // leaving the arithmetic to the report.
  const expectedGap = (paragraph, speed) => {
    const sp = speed > 0 ? speed : 1;
    const enabled = paragraph ? get('readAloud.paragraphDelayEnabled') : get('readAloud.sentenceDelayEnabled');
    if (!enabled) return 0;
    const ms = paragraph ? get('readAloud.paragraphDelayMs') : get('readAloud.sentenceDelayMs');
    return Math.round(Math.max(0, ms) / sp);
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
  const observeGap = async (index, paragraph, speed, ceilingMs = 15000) => {
    m.repositionTo(index);
    const t0 = Date.now();
    let lastGap = null;
    let countAfter = null;
    let countBefore = null;
    while (Date.now() - t0 < ceilingMs) {
      const eng = await engineFor();
      if (countBefore === null) countBefore = eng.session.gaps.count;
      if (eng.session.gaps.count > countBefore) { lastGap = eng.session.gaps.last; countAfter = eng.session.gaps.count; break; }
      await sleep(40);
    }
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    const expected = expectedGap(paragraph, speed);
    return {
      index, ms: Date.now() - t0, gaps: { count: countAfter, last: lastGap },
      expectedMs: expected, expectedParagraph: paragraph,
      matches: !!lastGap && lastGap.ms === expected && lastGap.paragraph === paragraph,
    };
  };

  // A: defaults, speed exactly 2x for clean arithmetic
  m.setSpeed(2);
  out.defaultsSentence = await observeGap(1, false, 2); // 1 -> 2 (not a paragraph start)
  out.defaultsParagraph = await observeGap(4, true, 2); // 4 -> 5 (a paragraph start)

  // B: custom (1000 sentence, 400 paragraph) at 2x -> 500, 200 (issue #142:
  // the paragraph pause alone, not summed with the sentence pause)
  set('readAloud.sentenceDelayMs', 1000);
  set('readAloud.paragraphDelayMs', 400);
  out.customSentence = await observeGap(1, false, 2);
  out.customParagraph = await observeGap(4, true, 2);

  // C: both switches off -> 0 everywhere, at every speed (issue #142: no
  // fallback to the voice's own delay or a flat 200 any more)
  set('readAloud.sentenceDelayEnabled', false);
  set('readAloud.paragraphDelayEnabled', false);
  m.setSpeed(1);
  out.offSentenceAt1x = await observeGap(1, false, 1);
  out.offParagraphAt1x = await observeGap(4, true, 1);
  m.setSpeed(2);
  out.offSentenceAt2x = await observeGap(1, false, 2);
  out.offParagraphAt2x = await observeGap(4, true, 2);
  m.setSpeed(3);
  out.offParagraphAt3x = await observeGap(4, true, 3);

  // D: a pause inside the gap drops the rest of it (long, easy-to-catch gap)
  set('readAloud.sentenceDelayEnabled', true);
  set('readAloud.paragraphDelayMs', 400);
  set('readAloud.paragraphDelayEnabled', true);
  set('readAloud.sentenceDelayMs', 2000);
  m.setSpeed(1);
  const gapsCountBeforeD = (await engineFor()).session.gaps.count;
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
  // gaps.count increments the MOMENT a gap starts (session.ts segmentEnd:
  // `this.gaps++` runs before `scheduleSpeak`, not when the gap ends), so by
  // the time inGap is caught true it already reflects THIS gap -- one above
  // gapsCountBeforeD. What "unchanged until the next boundary" actually
  // means is checked below: it must not move again while paused, nor in the
  // moment right after resuming, until a real new boundary is reached.
  const gapsCountAtPause = beforePause ? beforePause.session.gaps.count : null;
  if (caughtInGap) m.pause();
  const afterPause = await engineFor();
  out.pauseInGap = {
    caughtInGap,
    catchMs: Date.now() - tGap0,
    posAtGapEntry,
    gapsCountBeforeD, gapsCountAtPause,
    gapsCountJumpedOnceForThisGap: gapsCountAtPause === gapsCountBeforeD + 1,
    inGapImmediatelyAfterPause: afterPause.session.inGap,
    pausedFlag: afterPause.session.paused,
    positionAfterPause: afterPause.session.position,
    gapsCountAfterPause: afterPause.session.gaps.count,
    gapsCountUnchangedWhilePaused: afterPause.session.gaps.count === gapsCountAtPause,
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
    out.pauseInGap.gapsCountAfterResume = afterPlay.session.gaps.count;
    out.pauseInGap.gapsCountUnchangedImmediatelyAfterResume = afterPlay.session.gaps.count === gapsCountAtPause;
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
