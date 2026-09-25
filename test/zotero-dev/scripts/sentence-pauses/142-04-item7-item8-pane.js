// Item 7 (a settings change applies from the next boundary without
// rebuilding the voice list) and item 8 (the pane: the second row under
// *Use one speed everywhere* reads "Pause between paragraphs" -- or the UI
// language's version -- and both ? tooltips open). Workflow sections 1
// (settings pane) and 4 (hover/tooltips): open+navigate+interact+read in one
// script, since the pane can scroll and a stray window keeps the old pane
// after a reinstall.
// params: none. state: reads fixtures.A; writes item142_pane.
(async () => {
  const out = { step: 'item7-item8-pane' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = Zotero.ZoteroTTSRun.state;
  const itemID = S.fixtures.A.itemID;
  let r = null;
  for (const x of Zotero.Reader._readers || []) if (x.itemID === itemID) r = x;
  if (!r) throw new Error('fixture A reader not found');
  const m = r._internalReader._readAloudManager;

  const PREFIX = 'zotero-tts.';
  const get = (k) => Zotero.Prefs.get(PREFIX + k);

  out.zoteroLocale = Zotero.locale;
  out.allVoicesBeforeAnything = m._allVoices ? m._allVoices.length : null;
  out.activeBeforeAnything = m.active;

  // A stray settings window keeps the OLD pane after a reinstall (workflow section 1)
  let win = Services.wm.getMostRecentWindow('zotero:pref');
  if (win) {
    win.close();
    const t0 = Date.now();
    while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - t0 < 5000) await sleep(100);
  }
  Zotero.Utilities.Internal.openPreferences('zotero-tts@xujialiu.top');
  const tW0 = Date.now();
  win = null;
  while (!win && Date.now() - tW0 < 10000) {
    win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) await sleep(100);
  }
  if (!win) throw new Error('settings window never opened');
  out.windowOpenedMs = Date.now() - tW0;

  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  const tN0 = Date.now();
  while (!win.document.getElementById('ztts-provider-openai-official') && Date.now() - tN0 < 10000) await sleep(100);
  out.navigatedMs = Date.now() - tN0;
  win.focus();

  const doc = win.document;
  const sentenceCheckbox = doc.querySelector('[preference="extensions.zotero.zotero-tts.readAloud.sentenceDelayEnabled"]');
  const paragraphCheckbox = doc.querySelector('[preference="extensions.zotero.zotero-tts.readAloud.paragraphDelayEnabled"]');
  const sentenceInput = doc.querySelector('[preference="extensions.zotero.zotero-tts.readAloud.sentenceDelayMs"]');
  const paragraphInput = doc.querySelector('[preference="extensions.zotero.zotero-tts.readAloud.paragraphDelayMs"]');
  const sentenceHelp = doc.querySelector('[data-l10n-id="ztts-help-sentence-pause"]');
  const paragraphHelp = doc.querySelector('[data-l10n-id="ztts-help-paragraph-pause"]');

  out.elementsFound = {
    sentenceCheckbox: !!sentenceCheckbox, paragraphCheckbox: !!paragraphCheckbox,
    sentenceInput: !!sentenceInput, paragraphInput: !!paragraphInput,
    sentenceHelp: !!sentenceHelp, paragraphHelp: !!paragraphHelp,
  };
  if (!sentenceCheckbox || !paragraphCheckbox || !sentenceInput || !paragraphInput || !sentenceHelp || !paragraphHelp) {
    win.close();
    throw new Error('one or more pause-row elements not found: ' + JSON.stringify(out.elementsFound));
  }

  out.rowLabels = { sentence: sentenceCheckbox.getAttribute('label'), paragraph: paragraphCheckbox.getAttribute('label') };

  // Hover each ? icon: coordinates and mouse events in ONE step (workflow
  // section 4 -- the pane can scroll between bridge calls).
  const hoverTooltip = async (el) => {
    el.scrollIntoView({ block: 'center' });
    await sleep(50);
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    win.windowUtils.sendMouseEvent('mousemove', cx - 30, cy - 30, 0, 0, 0, false, 0, 0, false, false);
    await sleep(30);
    win.windowUtils.sendMouseEvent('mousemove', cx, cy, 0, 0, 0, false, 0, 0, false, false);
    await sleep(30);
    win.windowUtils.sendMouseEvent('mousemove', cx + 1, cy, 0, 0, 0, false, 0, 0, false, false);
    let tip = doc.getElementById('ztts-help-tip');
    const t0 = Date.now();
    while ((!tip || tip.state !== 'open') && Date.now() - t0 < 3000) {
      await sleep(50);
      tip = doc.getElementById('ztts-help-tip');
    }
    const result = { found: !!tip, state: tip ? tip.state : null, label: tip ? tip.getAttribute('label') : null, waitedMs: Date.now() - t0 };
    // Leave: park on a blank spot of the pane, never (5,5) (the nav list)
    win.windowUtils.sendMouseEvent('mousemove', cx, cy + 200, 0, 0, 0, false, 0, 0, false, false);
    await sleep(30);
    return result;
  };

  out.sentenceTooltip = await hoverTooltip(sentenceHelp);
  out.paragraphTooltip = await hoverTooltip(paragraphHelp);

  // Item 7: a live pref write through the pane's own controls, while the
  // session stays active (paused counts) -- voice list untouched, no
  // reading-guard notice (ui/reading-guard.ts is wired only to the voice-list
  // switches/browser, never to these two rows -- preferences.xhtml says so).
  const beforeWriteVoices = m._allVoices ? m._allVoices.length : null;
  const beforeWriteActive = m.active;

  const sentPrefBefore = get('readAloud.sentenceDelayEnabled');
  sentenceCheckbox.click();
  await sleep(200);
  const sentPrefAfterClick = get('readAloud.sentenceDelayEnabled');
  sentenceCheckbox.click(); // back to its original state
  await sleep(200);
  const sentPrefRestoredByClick = get('readAloud.sentenceDelayEnabled');
  out.checkboxWritesThrough = {
    before: sentPrefBefore, afterFirstClick: sentPrefAfterClick, afterSecondClick: sentPrefRestoredByClick,
    toggled: sentPrefAfterClick !== sentPrefBefore, restored: sentPrefRestoredByClick === sentPrefBefore,
  };

  const paraMsBefore = get('readAloud.paragraphDelayMs');
  const probeValue = paraMsBefore === 250 ? 300 : 250;
  paragraphInput.focus();
  paragraphInput.value = String(probeValue);
  paragraphInput.dispatchEvent(new win.Event('input', { bubbles: true }));
  paragraphInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(200);
  const paraMsAfter = get('readAloud.paragraphDelayMs');
  paragraphInput.value = String(paraMsBefore);
  paragraphInput.dispatchEvent(new win.Event('input', { bubbles: true }));
  paragraphInput.dispatchEvent(new win.Event('change', { bubbles: true }));
  await sleep(200);
  const paraMsRestored = get('readAloud.paragraphDelayMs');
  out.numberInputWritesThrough = {
    before: paraMsBefore, probeValue, after: paraMsAfter, restored: paraMsRestored,
    wroteThrough: paraMsAfter === probeValue, restoredOk: paraMsRestored === paraMsBefore,
  };

  const noticeEl = doc.getElementById('ztts-notice');
  out.item7 = {
    allVoicesBefore: beforeWriteVoices,
    allVoicesAfter: m._allVoices ? m._allVoices.length : null,
    allVoicesUnchanged: (m._allVoices ? m._allVoices.length : null) === beforeWriteVoices,
    activeBefore: beforeWriteActive,
    activeAfter: m.active,
    stillActive: m.active === true,
    noticePresent: !!noticeEl,
  };

  win.close();
  const tC0 = Date.now();
  while (Services.wm.getMostRecentWindow('zotero:pref') && Date.now() - tC0 < 5000) await sleep(100);
  out.windowClosed = !Services.wm.getMostRecentWindow('zotero:pref');

  S.item142_pane = out;
  return JSON.stringify(out, null, 1);
})();
