// Item 4: the switch. readAloud.joinSplitSentences is read when a document's
// structure loads, so a flip only shows on a tab opened after it — run 03 again
// after this one, never re-read an open reader.
// params: joinSplitSentences (boolean).
(async () => {
  const out = { step: 'set-join-pref' };
  const P = Zotero.ZoteroTTSRun.params;
  try {
    const v = P.joinSplitSentences;
    if (typeof v !== 'boolean') throw new Error('params.joinSplitSentences must be true or false');
    const full = 'extensions.zotero.zotero-tts.readAloud.joinSplitSentences';
    out.before = { value: Zotero.Prefs.get('zotero-tts.readAloud.joinSplitSentences'), userValue: Services.prefs.prefHasUserValue(full) };
    Zotero.Prefs.set('zotero-tts.readAloud.joinSplitSentences', v);
    out.after = { value: Zotero.Prefs.get('zotero-tts.readAloud.joinSplitSentences'), userValue: Services.prefs.prefHasUserValue(full) };
    out.restoreSkippedLines = Zotero.Prefs.get('zotero-tts.readAloud.restoreSkippedLines');
  } catch (e) { out.error = String(e); throw e; }
  return JSON.stringify(out);
})()
