/**
 * Opens an already-imported EPUB's tab (items 15 and 8, issue #138) and
 * watches deriveSharedFromNative's own line — "native row at <ts>
 * derived|not derived for <lib>/<key>; held: ..." — against the reader-open
 * shared sync's "shared position sync (reader-open): ... adopted". A
 * marker line is logged right before Reader.open, and every debug line's
 * own "(+NNN)" delta (debug.js's stored format, summed from the marker) times
 * both lines on Zotero's own clock rather than a poll's granularity — the
 * poll only decides when to stop looking. Waits up to params.waitMs
 * (default 90000) for BOTH lines: the derive can be the slow one (a never-
 * analyzed EPUB) or the sync can be (the network).
 * params: stateKey (state[stateKey] = { itemID, lib, key, tabID }, tabID
 * may be null for a first open), expectedRowTs, waitMs.
 * Leaves state[stateKey].tabID; state.raceResults[stateKey] = this result.
 */
(async () => {
  const p = Zotero.ZoteroTTSRun.params;
  const s = Zotero.ZoteroTTSRun.state;
  const rec = s[p.stateKey];
  const out = { stateKey: p.stateKey, itemID: rec.itemID, lib: rec.lib, key: rec.key };

  const marker = '[zotero-tts-run] race marker ' + p.stateKey + ' ' + Date.now();
  Zotero.debug(marker);

  out.before = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).shared;

  const reader = await Zotero.Reader.open(rec.itemID);
  const openStarted = Date.now();
  let internal = null;
  let manager = null;
  const readySteps = [];
  while (Date.now() - openStarted < 24000) {
    internal = reader?._internalReader ?? null;
    manager = internal?._readAloudManager ?? null;
    readySteps.push(`${Date.now() - openStarted} ms internal=${!!internal} manager=${!!manager}`);
    if (internal && manager) break;
    await new Promise((r) => setTimeout(r, 700));
  }
  out.ready = !!(internal && manager);
  out.readyMs = Date.now() - openStarted;
  rec.tabID = reader?.tabID ?? null;
  s[p.stateKey] = rec;

  const rowNeedle = `native row at ${p.expectedRowTs} `;
  const attachmentNeedle = `for ${rec.lib}/${rec.key};`;
  const syncNeedle = 'shared position sync (reader-open)';

  const waitMs = p.waitMs || 90000;
  const waitStart = Date.now();
  let rowLine = null;
  let syncLines = [];
  while (Date.now() - waitStart < waitMs) {
    const debugText = String(await Zotero.Debug.get());
    const lines = debugText.split('\n');
    let markerIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].indexOf(marker) !== -1) {
        markerIdx = i;
        break;
      }
    }
    if (markerIdx !== -1) {
      let cum = 0;
      rowLine = null;
      syncLines = [];
      for (let i = markerIdx + 1; i < lines.length; i++) {
        const m = lines[i].match(/^\(\d+\)\(\+(\d+)\):\s?(.*)$/);
        const delta = m ? parseInt(m[1], 10) : 0;
        cum += delta;
        const msg = m ? m[2] : lines[i];
        if (msg.indexOf('[zotero-tts]') === -1) continue;
        if (msg.indexOf(rowNeedle) !== -1 && msg.indexOf(attachmentNeedle) !== -1 && !rowLine) {
          rowLine = { text: msg.slice(msg.indexOf('[zotero-tts]')), atMs: cum };
        }
        if (msg.indexOf(syncNeedle) !== -1) {
          syncLines.push({ text: msg.slice(msg.indexOf('[zotero-tts]')), atMs: cum });
        }
      }
    }
    if (rowLine && syncLines.length) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  out.waitedMs = Date.now() - waitStart;
  out.marker = marker;
  out.rowLine = rowLine;
  out.syncLines = syncLines;
  out.readyStepsHead = readySteps.slice(0, 3);
  out.readyStepsTail = readySteps.slice(-2);
  out.order = rowLine && syncLines.length ? (syncLines[0].atMs < rowLine.atMs ? 'sync-before-row' : 'row-before-sync') : 'incomplete';

  out.after = JSON.parse(await Zotero.ZoteroTTS.diagnostics.positionSync()).shared;
  out.adoptedDelta = out.after.documents.adopted - out.before.documents.adopted;
  out.itemsDelta = out.after.documents.items - out.before.documents.items;

  const errArr = Services.console.getMessageArray();
  const newErrors = [];
  const since = openStarted - 2000;
  for (let i = Math.max(0, errArr.length - 60); i < errArr.length; i++) {
    try {
      const se = errArr[i].QueryInterface(Ci.nsIScriptError);
      if (String(se.sourceName || '').indexOf('zotero-tts') !== -1 && se.timeStamp >= since) {
        newErrors.push({ message: se.errorMessage, line: se.lineNumber, column: se.columnNumber, timeStamp: se.timeStamp });
      }
    } catch (e) {
      // not an nsIScriptError
    }
  }
  out.newConsoleErrors = newErrors;

  s.raceResults = s.raceResults || {};
  s.raceResults[p.stateKey] = out;
  return JSON.stringify(out, null, 1);
})();
