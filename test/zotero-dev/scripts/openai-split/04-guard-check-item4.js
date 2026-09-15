// Item 4 (issue #113), blocked precondition check: the case requires "no
// player open" before enabling two sections. This profile's own reader tab
// "paper" (itemID from params.ownerTabItemID) is active (paused counts) for
// the whole run, so the reading guard (ui/reading-guard.ts, refuseWhileReading)
// is expected to refuse. This script makes ONE Enable click on Xiaomi MiMo to
// CONFIRM that refusal by mechanism, reads the #ztts-notice dialog's text
// (must name the owner's tab), then presses Cancel (the focused button --
// never "Stop and continue", which would stop the owner's session) so
// nothing of the owner's reading is touched and the switch stays off. Does
// NOT enable anything; the rest of item 4 (labels, voice browser, playback,
// headers) is NOT TESTABLE while this tab keeps reading.
// params: ownerTabItemID (optional, for the report only). state: writes
// item4Guard.
(async () => {
  const out = { step: 'guard-check-item4' };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = Zotero.ZoteroTTSRun.params;
  try {
    const readers = Zotero.Reader._readers || [];
    out.openReaders = readers.map((r) => {
      const ir = r._internalReader;
      const m = ir && ir._readAloudManager;
      let title = null;
      try {
        const item = Zotero.Items.get(r.itemID);
        title = (item && item.parentItem ? item.parentItem : item)?.getField('title') ?? null;
      } catch (e) { title = 'ERR:' + e; }
      return { itemID: r.itemID, title, active: !!(m && m.active), paused: m ? !!m.paused : null };
    });

    const win = Services.wm.getMostRecentWindow('zotero:pref');
    if (!win) throw new Error('settings window is not open -- run 02-pane-structure-item2.js first');
    const doc = win.document;
    const button = doc.getElementById('ztts-enable-mimo');
    if (!button) throw new Error('no #ztts-enable-mimo in the pane');
    out.mimoEnabledBefore = Zotero.Prefs.get('extensions.zotero.zotero-tts.mimo.enabled', true);

    button.click();
    // Poll for the notice dialog OR a settled switch (would mean the guard
    // did not fire, e.g. if the owner's tab were not actually seen as reading).
    let dialog = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      dialog = doc.getElementById('ztts-notice');
      if (dialog) break;
      await sleep(100);
    }
    out.dialogAppeared = !!dialog;
    if (dialog) {
      const bodyText = Array.from(dialog.querySelectorAll('div')).map((d) => d.textContent).join('\n');
      out.dialogText = bodyText;
      out.dialogNamesOwnerTab = out.openReaders.some((r) => r.title && bodyText.includes(r.title));
      const buttons = Array.from(dialog.querySelectorAll('button'));
      out.dialogButtonLabels = buttons.map((b) => b.textContent || b.getAttribute('label'));
      // dialog.close() with no argument behaves like Escape -- resolves as
      // Cancel/false (reading-guard.ts: "false when the dialog closed any
      // other way") -- never click a button here: clicking the wrong one
      // could press "Stop and continue" and stop the owner's session.
      dialog.close();
      const t1 = Date.now();
      while (doc.getElementById('ztts-notice') && Date.now() - t1 < 5000) await sleep(100);
      out.dialogClosed = !doc.getElementById('ztts-notice');
    } else {
      // No dialog: read whatever the button/pref settled to instead.
      await sleep(500);
      out.buttonLabelAfter = button.getAttribute('label');
    }
    await sleep(300);
    out.mimoEnabledAfter = Zotero.Prefs.get('extensions.zotero.zotero-tts.mimo.enabled', true);
    out.switchUnchanged = out.mimoEnabledBefore === out.mimoEnabledAfter;

    // The owner's session itself: untouched.
    const ownerReaderAfter = (Zotero.Reader._readers || []).find((r) => P.ownerTabItemID ? r.itemID === P.ownerTabItemID : true);
    if (ownerReaderAfter) {
      const m = ownerReaderAfter._internalReader?._readAloudManager;
      out.ownerSessionAfter = { active: !!(m && m.active), paused: m ? !!m.paused : null };
    }
  } catch (e) {
    out.error = String(e);
    out.stack = e && e.stack ? String(e.stack).split('\n').slice(0, 4).join(' | ') : null;
  }
  Zotero.ZoteroTTSRun.state.item4Guard = out;
  if (out.error) throw new Error(out.error);
  return JSON.stringify(out, null, 1);
})();
