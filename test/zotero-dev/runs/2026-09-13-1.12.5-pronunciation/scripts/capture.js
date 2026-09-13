(async()=>{
const keys=['webdav.syncSettings','webdav.autoUploadSettings','cacheAudio','prefetchEnabled'];
const full=k=>'extensions.zotero.zotero-tts.'+k;
const snap=keys.map(k=>({k,value:Zotero.Prefs.get('zotero-tts.'+k),user:Services.prefs.prefHasUserValue(full(k))}));
const m=Zotero.Reader._readers[0]._internalReader._readAloudManager,c=m._controller;
if(!m.paused) return JSON.stringify({aborted:'User reader is playing'});
const state=()=>({active:m.active,paused:m.paused,position:c._position,voice:m.selectedVoiceID,error:m._error});
const before=state(),sb=Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup),originalFetch=sb.fetch;
const calls=[],results=[];
try {
for(const k of keys) Zotero.Prefs.set('zotero-tts.'+k,false);
sb.fetch=function(input,init){const b=JSON.parse(init.body);calls.push({path:new URL(String(input)).pathname,text:b.text,reference_id:b.reference_id,model:init.headers.model});throw new Error('PRONUNCIATION_PROBE_BLOCKED_BEFORE_NETWORK');};
for(const i of [6653,6654,6656]){const s=c._segments[i];const result=await m._options.remoteInterface.getAudio(s,{id:m.selectedVoiceID});results.push({i,original:s.text,error:result.error,audioBytes:result.audio?.size??0});}
}finally {
sb.fetch=originalFetch;
for(const k of ['cacheAudio','prefetchEnabled','webdav.autoUploadSettings','webdav.syncSettings']){const s=snap.find(s=>s.k===k);if(s.user)Zotero.Prefs.set('zotero-tts.'+k,s.value);else Services.prefs.clearUserPref(full(k));}
}
return JSON.stringify({before,calls,results,after:state(),fetchRestored:sb.fetch===originalFetch,prefsRestored:snap.every(s=>Zotero.Prefs.get('zotero-tts.'+s.k)===s.value&&Services.prefs.prefHasUserValue(full(s.k))===s.user)});
})()
