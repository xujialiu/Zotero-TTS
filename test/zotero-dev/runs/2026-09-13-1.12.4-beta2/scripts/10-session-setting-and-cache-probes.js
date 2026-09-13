(async () => {
  Zotero.Prefs.set('zotero-tts.readAloud.stripAngleBrackets', false);
  const report = JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings());
  const win = Services.wm.getMostRecentWindow('zotero:pref');
  const cb = win && win.document.getElementById('ztts-strip-angle-brackets');
  return JSON.stringify({
    pref:{value:Zotero.Prefs.get('zotero-tts.readAloud.stripAngleBrackets'),user:Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.readAloud.stripAngleBrackets')},
    textSettings:report,
    fixture:{active:report.length>1?report[1].active:null,configured:report.length>1?report[1].configured:null,effective:report.length>1?report[1].effective:null},
    checkbox:{present:!!cb,checked:cb?!!cb.checked:null}
  },null,1);
})()
