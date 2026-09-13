return (async () => {
 const names={
  positions:'extensions.zotero.zotero-tts.webdav.syncPositions',
  autoUpload:'extensions.zotero.zotero-tts.webdav.autoUploadSettings',
  settings:'extensions.zotero.zotero-tts.webdav.syncSettings',
 };
 const prefSummary=(name)=>({effective:Services.prefs.getBoolPref(name),hasUserValue:Services.prefs.prefHasUserValue(name)});
 const before={positions:prefSummary(names.positions),autoUpload:prefSummary(names.autoUpload),settings:prefSummary(names.settings)};
 Services.prefs.setBoolPref(names.autoUpload,true);
 Services.prefs.setBoolPref(names.positions,true);
 await new Promise(resolve=>setTimeout(resolve,1500));
 const after={positions:prefSummary(names.positions),autoUpload:prefSummary(names.autoUpload),settings:prefSummary(names.settings)};
 let up=null,pos=null;
 try {
  const u=JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsUpload());
  const a=u.autoUpload;
  up={enabled:u.enabled,configured:u.configured,pending:a?.pending??null,uploads:a?.uploads??null,lastError:!!a?.lastError};
 } catch(e){up={error:String(e)};}
 try {
  const p=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const t=p.transport??{};
  pos={rows:p.database?.rows??null,localEntries:p.localEntries??null,transport:{pulls:t.pulls??null,pushes:t.pushes??null,adopted:t.adopted??null,uploaded:t.uploaded??null,lastError:!!t.lastError}};
 } catch(e){pos={error:String(e)};}
 return JSON.stringify({before,after,settingsUpload:up,position:pos});
})()
