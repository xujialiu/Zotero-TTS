// Item 6: cleanup. Erases every annotation this run created, confirms the
// session is closed (item 5 already closed it -- defensive here), erases
// the fixture attachment, restores the volume pref, and reads the
// position-store row count back against 01's baseline. Bridge-only; the
// host is already minimized by 05-no-session.js. Webdav/debug-store/window
// restoration are handled outside this kit (environment-level, not
// case-specific -- see the README).
// state: reads fixture/helpers/annotationIDs/volumeSnapshot/positionRowsBefore.
return (async () => {
  const run = Zotero.ZoteroTTSRun, state = run.state;
  const h = state.helpers;
  const out = { step: '06-cleanup' };
  try {
    const item = Zotero.Items.get(state.fixture.itemID);
    const beforeIDs = item.getAnnotations().map(a => a.id);
    out.annotationsFoundBeforeErase = beforeIDs.length;
    out.annotationIDsThisRunCreated = state.annotationIDs.slice();
    for (const id of beforeIDs) {
      const ann = Zotero.Items.get(id);
      if (ann) await ann.eraseTx();
    }
    out.annotationsRemainingAfterErase = item.getAnnotations().length;

    const internal = h.internal();
    out.sessionActiveBeforeFinalClose = !!h.manager()?.active;
    if (h.manager()?.active) {
      internal.toggleReadAloudPopup(false);
      out.sessionClosedNow = true;
    }

    await item.eraseTx();
    out.fixtureErased = !Zotero.Items.get(state.fixture.itemID, true);

    const volPref = 'extensions.zotero.zotero-tts.readAloud.volume';
    if (state.volumeSnapshot.hadUserValue) Services.prefs.setIntPref(volPref, state.volumeSnapshot.value);
    else Services.prefs.clearUserPref(volPref);
    out.volumeRestored = { value: Services.prefs.getIntPref(volPref, -1), expected: state.volumeSnapshot.value, hadUserValue: state.volumeSnapshot.hadUserValue };

    const posAfter = JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
    out.positionRows = { before: state.positionRowsBefore, after: posAfter.database?.rows ?? null };
    out.ok = true;
  } catch (e) {
    out.error = String(e);
    out.stack = e?.stack ? String(e.stack).split('\n').slice(0, 6).join(' | ') : null;
  }
  if (out.error) throw new Error(out.error + (out.stack ? ' | ' + out.stack : ''));
  return JSON.stringify(out, null, 1);
})();
