// Item 4, bullet 4 (PDF): with Keep following while the sentence is
// visible on, trusted wheel input that leaves the current sentence only
// under the Top bar disengages following (automatic:false, player shows
// M). At the SAME scroll position with the Floating panel, the sentence
// counts as visible (nothing covers it) and following stays on (A).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (test, ms = 7000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = test(); if (v) return v; await sleep(60); } return test(); };
  const state = Zotero.ZoteroTTSRun.state;
  const host = Zotero.getMainWindow();
  const layoutPref = 'extensions.zotero.zotero-tts.readAloud.playerLayout';
  const keepName = 'extensions.zotero.zotero-tts.readAloud.keepFollowingWhileVisible';

  const oldKeep = { value: Services.prefs.getBoolPref(keepName, true), user: Services.prefs.prefHasUserValue(keepName) };
  Services.prefs.setBoolPref(keepName, true);

  const itemID = state.fixtures.pdf.itemID;
  const reader = (Zotero.Reader._readers || []).find((r) => r.itemID === itemID);
  host.Zotero_Tabs.select(reader.tabID);
  await sleep(150);
  const doc = reader._iframeWindow.document;
  const ir = reader._internalReader;
  const m = ir._readAloudManager;
  const container = ir._primaryView._iframeWindow.document.getElementById('viewerContainer');
  const setLayout = async (layout) => { Zotero.ZoteroTTS.pluginPlayer.setLayout(layout); await wait(() => Services.prefs.getStringPref(layoutPref, '') === layout ? true : null, 5000); await sleep(150); };
  const modeText = () => doc.querySelector('#ztts-player-frame')?.contentDocument?.querySelector('.mode')?.textContent ?? null;
  const diagFor = async () => { const readers = Zotero.Reader._readers || []; const d = JSON.parse(await Zotero.ZoteroTTS.diagnostics.autoScroll()); return d[readers.findIndex((r) => r.itemID === itemID)]; };

  await setLayout('top');
  if (!m.paused) { try { m.pause(); } catch (e) {} await sleep(200); }
  try { m.repositionTo(0); } catch (e) {}
  await sleep(1500);
  const startModeText = modeText();
  const startScroll = container.scrollTop;
  const box0 = (await diagFor())?.sentence?.whole ?? null;

  // A real, trusted wheel scroll (main-window coordinates over the reader
  // tab's <browser>, top=37/left=0 measured on this window) until segment
  // 0 (~y137-161) lies wholly under the Top bar's 34px band. The manual
  // tracker's own debounce is 180ms (manual-follow.ts) and it retries
  // periodically once disengaged, which can re-engage the SAME still-active
  // segment again a little later (2026-09-24) -- poll right after the wheel
  // sequence, do not wait past it on a fixed delay.
  const wheel = (deltaY) => { try { host.windowUtils.sendWheelEvent(400, 337, 0, deltaY, 0, 0, 0, 0, 0, 0); return true; } catch (e) { return false; } };
  const wheelSteps = [];
  let wheelOk = true;
  for (const d of [-2000]) { wheelOk = wheel(d) && wheelOk; await sleep(150); } // first, well clear of the target, from any leftover position
  await sleep(300);
  wheelSteps.push({ afterReset: container.scrollTop });
  for (const d of [120, 120, 34]) { wheelOk = wheel(d) && wheelOk; await sleep(250); wheelSteps.push({ deltaY: d, scrollTop: container.scrollTop }); }

  const scrollAfterWheel = container.scrollTop;
  const relTop = box0[1] - scrollAfterWheel, relBottom = box0[3] - scrollAfterWheel;
  const wheelPlacedWhollyInBand = relTop >= -0.5 && relBottom <= 34.5;

  // Poll for the disengage transition (following false), not a fixed delay.
  let topBarModeText = null, topBarDiag = null;
  for (let i = 0; i < 8 && !(topBarDiag && topBarDiag.following === false); i++) {
    await sleep(80);
    topBarDiag = await diagFor();
    topBarModeText = modeText();
  }

  await setLayout('top'); // back to a known layout before the second trial
  try { m.pause(); } catch (e) {}
  await wait(() => m.paused, 2000);
  try { m.repositionTo(0); } catch (e) {}
  await sleep(1200);
  container.scrollTo(container.scrollLeft, 0);
  await sleep(300);

  // Second trial: the SAME wheel sequence, but with the Floating panel
  // already active throughout -- nothing covers the sentence, so it should
  // never disengage.
  await setLayout('B');
  await sleep(200);
  for (const d of [-2000]) wheel(d);
  await sleep(450);
  for (const d of [120, 120, 34]) { wheel(d); await sleep(250); }
  const scrollFloating = container.scrollTop;
  let floatingModeText = null, floatingDiag = null, everDisengagedUnderFloating = false;
  for (let i = 0; i < 8; i++) {
    await sleep(80);
    floatingDiag = await diagFor();
    floatingModeText = modeText();
    if (floatingDiag?.following === false) everDisengagedUnderFloating = true;
  }
  const scrollMatchesTopBarTrial = Math.abs(scrollFloating - scrollAfterWheel) < 1;

  await setLayout('top');
  try { m.pause(); } catch (e) {}
  await wait(() => m.paused, 2000);

  if (oldKeep.user) Services.prefs.setBoolPref(keepName, oldKeep.value); else Services.prefs.clearUserPref(keepName);
  await sleep(120);

  const checks = {
    startedAutomatic: startModeText === 'A',
    wheelWorked: wheelOk,
    wheelPlacedWhollyInBand,
    disengagedUnderTopBar: topBarDiag?.following === false && topBarModeText === 'M',
    neverDisengagedUnderFloating: !everDisengagedUnderFloating && floatingModeText === 'A',
    scrollMatchesTopBarTrial,
  };

  return JSON.stringify({
    startModeText, startScroll, box0,
    wheelSteps, scrollAfterWheel, relTop, relBottom, wheelPlacedWhollyInBand,
    topBarModeText, topBarDiag: { following: topBarDiag?.following, interacting: topBarDiag?.interacting, sentenceProtected: topBarDiag?.sentenceProtected, visible: topBarDiag?.visible, reason: topBarDiag?.reason },
    scrollFloating, floatingModeText, everDisengagedUnderFloating,
    floatingDiag: { following: floatingDiag?.following, interacting: floatingDiag?.interacting, sentenceProtected: floatingDiag?.sentenceProtected, visible: floatingDiag?.visible, reason: floatingDiag?.reason },
    scrollMatchesTopBarTrial,
    checks,
    keepFollowingRestored: Services.prefs.getBoolPref(keepName, true),
  }, null, 1);
})();
