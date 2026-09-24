// Item 4 (needs this beta already installed): starts a fixture reading,
// muted and playing, then samples .read-aloud-popup's computed display
// every 50ms for up to 35s while the TESTER makes a SEPARATE, concurrent
// zotero_plugin_install call (same xpi) a few seconds in -- this script
// and that bridge call run on the same event loop, so the trace really
// spans before/during/after the install. Detects the reinstall by
// pluginPlayer().resource changing (a fresh instance token per install).
// Afterwards: Player closed, session paused at the same segment
// (engine() adopted), and the plugin's button resumes it. This same
// reinstall also restores item 3's broken resource substitution and
// proves item 1 live with usePluginPlayer still written false (11) --
// cleared at the very end here.
// params: none. state: reads fixtures.pdf, usePluginPlayerBaseline.
(async () => {
  const state = Zotero.ZoteroTTSRun.state;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { step: 'item4-reinstall-mid-reading' };
  const safeItemID = (r) => { try { return r.itemID; } catch (e) { return 'DEAD'; } };

  const win = Zotero.getMainWindow();
  const reader = (Zotero.Reader._readers || []).find((r) => safeItemID(r) === state.fixtures.pdf.id);
  if (!reader) throw new Error('PDF fixture reader (state.fixtures.pdf) not found');
  win.restore();
  win.Zotero_Tabs.select(reader.tabID);
  win.focus();
  await sleep(200);

  const m = () => reader._internalReader?._readAloudManager;
  if (m()?.active) { try { reader._internalReader.toggleReadAloudPopup(false); } catch (e) {} for (let i = 0; i < 40 && m()?.active; i++) await sleep(100); }
  reader._internalReader.startReadAloudAtPosition();
  for (let i = 0; i < 100 && !(m()?.active && !m()?.paused); i++) await sleep(100);
  out.playingBeforeInstall = { active: !!m()?.active, paused: !!m()?.paused };
  const segmentBefore = (() => { try { return String(m()?.activeSegment?.text ?? '').slice(0, 80); } catch (e) { return null; } })();
  out.segmentBefore = segmentBefore;

  let prefWin = Services.wm.getMostRecentWindow('zotero:pref');
  if (prefWin) { prefWin.close(); for (let i = 0; i < 50 && Services.wm.getMostRecentWindow('zotero:pref'); i++) await sleep(100); }

  const doc = reader._iframeWindow.document;
  const nativeDisplay = () => { try { const el = doc.querySelector('.read-aloud-popup'); return el ? doc.defaultView.getComputedStyle(el).display : 'ABSENT'; } catch (e) { return 'DOC-GONE:' + String(e).slice(0, 40); } };
  const resourceBefore = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer()).resource;
  out.resourceBefore = resourceBefore;
  state.item4ReadyAt = Date.now(); // the tester's cue: install any time after this is observed

  const trace = [];
  const t0 = Date.now();
  let newResourceAt = null, newResource = resourceBefore;
  // Sample for up to 35s, or until 2s after the resource changes (a fresh instance token).
  while (Date.now() - t0 < 35000) {
    trace.push({ t: Date.now() - t0, display: nativeDisplay() });
    if (newResourceAt === null && Date.now() - t0 > 2000 /* give the install a moment to even start */) {
      try {
        const pp = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
        if (pp.resource !== resourceBefore) { newResourceAt = Date.now() - t0; newResource = pp.resource; }
      } catch (e) { /* between instances */ }
    }
    if (newResourceAt !== null && Date.now() - t0 - newResourceAt > 2000) break;
    await sleep(50);
  }
  out.newResource = newResource;
  out.resourceChanged = newResource !== resourceBefore;
  out.newResourceAtMs = newResourceAt;
  out.sampleCount = trace.length;
  out.first = trace[0] ?? null;
  out.last = trace[trace.length - 1] ?? null;
  out.allNone = trace.every((s) => s.display === 'none' || s.display === 'ABSENT');
  out.anyNonNone = trace.filter((s) => s.display !== 'none' && s.display !== 'ABSENT');

  if (!out.resourceChanged) { out.note = 'resource never changed within 35s -- the reinstall may not have landed yet; rerun the post-checks separately'; return JSON.stringify(out, null, 1); }

  const handler = Services.io.getProtocolHandler('resource').QueryInterface(Components.interfaces.nsISubstitutingProtocolHandler);
  try { handler.resolveURI(Services.io.newURI(newResource)); out.newResourceResolves = true; } catch (e) { out.newResourceResolves = false; }

  const readerAgain = (Zotero.Reader._readers || []).find((r) => safeItemID(r) === state.fixtures.pdf.id);
  const myEntryOpen = (() => { try { const f = readerAgain._iframeWindow?.document?.getElementById('ztts-player-frame'); return f ? !f.hidden : null; } catch (e) { return null; } })();
  out.playerClosedAfterInstall = myEntryOpen === false;

  let engineAfter = null;
  try { engineAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.engine()); } catch (e) { engineAfter = { error: String(e) }; }
  const myEngine = (engineAfter.readers || []).find((r) => r.itemID === state.fixtures.pdf.id);
  out.engineAfter = myEngine ?? null;

  const m2 = () => readerAgain._internalReader?._readAloudManager;
  out.managerAfter = { active: !!m2()?.active, paused: !!m2()?.paused };
  const segmentAfter = (() => { try { return String(m2()?.activeSegment?.text ?? '').slice(0, 80); } catch (e) { return null; } })();
  out.segmentAfter = segmentAfter;
  out.sameSegment = segmentBefore !== null && segmentBefore === segmentAfter;

  const docAgain = readerAgain._iframeWindow.document;
  const btn = docAgain.getElementById('ztts-player-toggle');
  out.buttonFoundAfter = !!btn;
  btn?.click();
  for (let i = 0; i < 100 && !(m2()?.active && !m2()?.paused); i++) await sleep(100);
  out.resumedAfterButton = { active: !!m2()?.active, paused: !!m2()?.paused };
  const segmentResumed = (() => { try { return String(m2()?.activeSegment?.text ?? '').slice(0, 80); } catch (e) { return null; } })();
  out.segmentAfterResume = segmentResumed;
  out.resumedSameSegment = segmentBefore !== null && segmentBefore === segmentResumed;

  try { readerAgain._internalReader.toggleReadAloudPopup(false); } catch (e) {}
  for (let i = 0; i < 40 && m2()?.active; i++) await sleep(100);

  const pp3 = JSON.parse(await Zotero.ZoteroTTS.diagnostics.pluginPlayer());
  out.readersAfterReinstall = pp3.readers.length;
  out.usePluginPlayerStillFalseDuringReinstall = Zotero.Prefs.get('zotero-tts.readAloud.usePluginPlayer') === false;

  const baseline = state.usePluginPlayerBaseline;
  if (baseline && baseline.user === false) Services.prefs.clearUserPref('extensions.zotero.zotero-tts.readAloud.usePluginPlayer');
  else if (baseline) Zotero.Prefs.set('zotero-tts.readAloud.usePluginPlayer', baseline.value);
  out.usePluginPlayerRestored = { value: Zotero.Prefs.get('zotero-tts.readAloud.usePluginPlayer'), user: Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.readAloud.usePluginPlayer') };

  win.minimize();
  return JSON.stringify(out, null, 1);
})()
