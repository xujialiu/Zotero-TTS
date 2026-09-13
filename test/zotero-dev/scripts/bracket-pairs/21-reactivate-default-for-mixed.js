(async () => {
  const fixtureID = 24434;
  const list = Zotero.Reader._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) if (list[i].itemID === fixtureID) reader = list[i];
  if (!reader) return JSON.stringify({ error: 'fixture reader missing' });
  const internal = reader._internalReader;
  const manager = internal?._readAloudManager;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const trace = [];
  let error = null;
  try {
    Zotero.Prefs.set('zotero-tts.readAloud.bracketPairs', '<> []');
    Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', true);
    trace.push({ label: 'configured-before-stop', active: !!manager?.active, paused: !!manager?.paused, pairs: Zotero.Prefs.get('zotero-tts.readAloud.bracketPairs') });
    internal.toggleReadAloudPopup(false);
    for (let i = 0; i < 30 && manager?.active; i++) await wait(100);
    trace.push({ label: 'after-stop', active: !!manager?.active, paused: !!manager?.paused });
    internal.toggleReadAloudPopup(true);
    for (let i = 0; i < 50; i++) {
      if (manager?.active && manager._controller) break;
      await wait(100);
    }
    trace.push({ label: 'after-reopen', active: !!manager?.active, paused: !!manager?.paused });
    if (manager?.active && !manager.paused) manager.pause();
    await wait(80);
    trace.push({ label: 'paused', active: !!manager?.active, paused: !!manager?.paused });
  } catch (e) { error = { message: String(e), stack: e?.stack || null }; }
  return JSON.stringify({ configuredPairs: Zotero.Prefs.get('zotero-tts.readAloud.bracketPairs'), configured: Zotero.Prefs.get('zotero-tts.readAloud.stripAngleBrackets'), trace, settings: JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings()), error }, null, 1);
})()
