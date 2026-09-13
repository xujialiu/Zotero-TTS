(async () => {
  Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', false);
  const report = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  const fixture = report.find(entry => entry.active && entry.effective === true) || report[report.length - 1];
  return JSON.stringify({ configured: fixture?.configured ?? null, effective: fixture?.effective ?? null,
    active: fixture?.active ?? null, checkbox: Zotero.Prefs.get('zotero-tts.readAloud.stripAngleBrackets') }, null, 1);
})()
