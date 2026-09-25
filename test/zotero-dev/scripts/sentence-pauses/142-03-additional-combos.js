// Item 3.10, the combos the engine kit's own item-3 script (133-04) does not
// cover: (a) defaults at 1x sampled across every paragraph marker (5/9/12/15)
// and several plain sentence boundaries, for "true exactly into 5/9/12/15,
// false elsewhere"; (b) sentence 500/paragraph 200 at 1x -> 500 and 200;
// (c) sentence off/paragraph 400 at 1x -> 0 and 400; (d) paragraph
// off/sentence 1000 at 2x -> 500 and 0. gaps.count is asserted to go up by
// exactly 1 per sample throughout. Run 133-04 (revised for #142) first for
// the custom-1000/400@2x and both-off cases; this script does not repeat them.
// params: none. state: reads fixtures.A (from the sentence-pauses kit's own
// 142-01/142-02, or an engine-kit run's 133-01/133-02); writes item3_10.
(async () => {
  const S = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item3_10-additional-combos' };
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found -- run the baseline/open scripts first');
  const ir = r._internalReader;
  const m = ir._readAloudManager;
  if (!m.active) throw new Error('manager not active -- reopen the popup before this script');

  const PREFIX = 'zotero-tts.';
  const get = (k) => Zotero.Prefs.get(PREFIX + k);
  const set = (k, v) => Zotero.Prefs.set(PREFIX + k, v);
  const before = {
    sentenceDelayEnabled: get('readAloud.sentenceDelayEnabled'), sentenceDelayMs: get('readAloud.sentenceDelayMs'),
    paragraphDelayEnabled: get('readAloud.paragraphDelayEnabled'), paragraphDelayMs: get('readAloud.paragraphDelayMs'),
  };

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
  const observeGap = async (index, paragraph, speed, ceilingMs = 15000) => {
    const countBefore0 = (await engineFor()).session.gaps.count;
    m.repositionTo(index);
    const t0 = Date.now();
    let last = null;
    let countAfter = countBefore0;
    while (Date.now() - t0 < ceilingMs) {
      const eng = await engineFor();
      if (eng.session.gaps.count > countBefore0) { last = eng.session.gaps.last; countAfter = eng.session.gaps.count; break; }
      await sleep(40);
    }
    if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }
    const expected = expectedGap(paragraph, speed);
    return {
      index, ms: Date.now() - t0, gaps: last,
      countBefore: countBefore0, countAfter, countUpByOne: countAfter === countBefore0 + 1,
      expectedMs: expected, expectedParagraph: paragraph,
      matches: !!last && last.ms === expected && last.paragraph === paragraph && last.speed === speed,
    };
  };

  // (a) Defaults (sentence on/0, paragraph on/200) at 1x, sampled across
  // every paragraph marker and several plain sentence boundaries.
  set('readAloud.sentenceDelayEnabled', true);
  set('readAloud.sentenceDelayMs', 0);
  set('readAloud.paragraphDelayEnabled', true);
  set('readAloud.paragraphDelayMs', 200);
  m.setSpeed(1);
  const defaults = {};
  defaults.para_4to5 = await observeGap(4, true, 1);
  defaults.para_8to9 = await observeGap(8, true, 1);
  defaults.para_11to12 = await observeGap(11, true, 1);
  defaults.para_14to15 = await observeGap(14, true, 1);
  defaults.sentence_1to2 = await observeGap(1, false, 1);
  defaults.sentence_2to3 = await observeGap(2, false, 1);
  defaults.sentence_6to7 = await observeGap(6, false, 1);
  defaults.sentence_9to10 = await observeGap(9, false, 1);
  out.defaultsAt1x = defaults;
  out.defaultsAllMatch = Object.values(defaults).every((d) => d.matches && d.countUpByOne);

  // (b) Sentence 500, paragraph 200 at 1x -> 500 and 200
  set('readAloud.sentenceDelayMs', 500);
  set('readAloud.paragraphDelayMs', 200);
  out.sentence500paragraph200at1x = {
    sentence: await observeGap(1, false, 1),
    paragraph: await observeGap(4, true, 1),
  };

  // (c) Sentence off, paragraph 400 at 1x -> 0 and 400
  set('readAloud.sentenceDelayEnabled', false);
  set('readAloud.paragraphDelayMs', 400);
  out.sentenceOffParagraph400at1x = {
    sentence: await observeGap(1, false, 1),
    paragraph: await observeGap(4, true, 1),
  };

  // (d) Paragraph off, sentence 1000 at 2x -> 500 and 0
  set('readAloud.sentenceDelayEnabled', true);
  set('readAloud.sentenceDelayMs', 1000);
  set('readAloud.paragraphDelayEnabled', false);
  m.setSpeed(2);
  out.paragraphOffSentence1000at2x = {
    sentence: await observeGap(1, false, 2),
    paragraph: await observeGap(4, true, 2),
  };

  if (m.active && !m.paused) { try { m.pause(); } catch (e) {} }

  // Restore the pause prefs to their baseline
  for (const k of Object.keys(before)) set('readAloud.' + k, before[k]);
  out.restored = {
    sentenceDelayEnabled: get('readAloud.sentenceDelayEnabled'), sentenceDelayMs: get('readAloud.sentenceDelayMs'),
    paragraphDelayEnabled: get('readAloud.paragraphDelayEnabled'), paragraphDelayMs: get('readAloud.paragraphDelayMs'),
  };
  out.restoredMatchesBaseline = JSON.stringify(out.restored) === JSON.stringify(before);

  S.item3_10 = out;
  return JSON.stringify(out, null, 1);
})();
