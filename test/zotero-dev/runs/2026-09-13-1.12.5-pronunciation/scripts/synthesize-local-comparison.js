// Prerequisites: list-local-references.js completed with bella present;
// .tmp/fish-local-test exists. Four sequential requests, 60 s each, no retries.
// User-authorized comparison using existing server settings and English bella.
// No playback, preference changes, or cloud requests. English locale is an
// experiment input, not metadata supplied by the local reference listing.
// Poll __zttsFishLocalProbe, retain results.json, and delete the temporary property.
(()=>{
const state=Zotero.__zttsFishLocalProbe;
if(state?.status!=='listed'||!state.references.includes('bella'))return JSON.stringify({error:'Expected local reference unavailable'});
const r=Zotero.Reader._readers[0],m=r._internalReader._readAloudManager,win=r._window,sb=Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
state.status='running';state.reference='bella';state.locale='en-US';state.localeSource='English test text/current cloud voice; local references have no locale metadata';state.before={paused:m.paused,position:m._controller._position,voice:m.selectedVoiceID,localEnabled:Zotero.Prefs.get('zotero-tts.fishspeech.enabled')};
const specs=[{name:'baseline-100-exp',text:' 100 exp'},{name:'english-hint-100-exp',text:'[Speak in American English] 100 exp'},{name:'baseline-2-50-hp',text:' 2/50 HP '},{name:'english-hint-2-50-hp',text:'[Speak in American English] 2/50 HP '}];
(async()=>{
try{
const headers={};
for(const pair of (Zotero.Prefs.get('zotero-tts.fishspeech.headers')||'').split(/[;\n]/)){const i=pair.indexOf(':');if(i<1)continue;const k=pair.slice(0,i).trim(),v=pair.slice(i+1).trim();if(k&&v&&!/\s/.test(k))headers[k]=v;}
const base=Zotero.Prefs.get('zotero-tts.fishspeech.baseURL').trim().replace(/\/+$/,'').replace(/\/v1$/i,'').replace(/\/+$/,'');
for(const spec of specs){
const controller=new win.AbortController(),timer=win.setTimeout(()=>controller.abort(),60000),started=Date.now();
try{
const body={text:spec.text,reference_id:'bella',format:'mp3',normalize:true,use_memory_cache:'on'};
const response=await sb.fetch(base+'/v1/tts',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
if(!response.ok){state.results.push({...spec,status:response.status,error:'HTTP refusal',elapsed:Date.now()-started});break;}
const bytes=new Uint8Array(await response.arrayBuffer());
if(!bytes.length)throw new Error('Empty audio');
const path='/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-local-test/'+spec.name+'.mp3';
await IOUtils.write(path,bytes);
state.results.push({...spec,status:response.status,path,audioBytes:bytes.length,contentType:response.headers.get('content-type'),elapsed:Date.now()-started});
}catch(e){state.results.push({...spec,error:e.name==='AbortError'?'60-second timeout':'Request or audio extraction failed',elapsed:Date.now()-started});break;}
finally{win.clearTimeout(timer);}
}
state.status=state.results.length===4&&state.results.every(r=>r.status===200)?'complete':'failed';
state.after={paused:m.paused,position:m._controller._position,voice:m.selectedVoiceID,localEnabled:Zotero.Prefs.get('zotero-tts.fishspeech.enabled')};
await IOUtils.writeUTF8('/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-local-test/results.json',JSON.stringify(state,null,2));
}catch(e){state.status='failed';state.error='Probe setup or file write failed';}
})();
return JSON.stringify({status:state.status,reference:state.reference,specs});
})()
