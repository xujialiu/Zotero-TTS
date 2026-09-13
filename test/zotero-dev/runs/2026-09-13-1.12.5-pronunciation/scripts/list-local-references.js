// Uses the user's saved Fish Speech URL and headers; lists references only.
// Leaves preferences and reader state unchanged. Poll __zttsFishLocalProbe;
// remove that temporary Zotero property after the synthesis/cleanup step.
(()=>{
if(Zotero.__zttsFishLocalProbe)return JSON.stringify({error:'Probe already exists'});
const state={status:'listing',results:[]};Zotero.__zttsFishLocalProbe=state;
const win=Zotero.Reader._readers[0]._window,sb=Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
(async()=>{
const controller=new win.AbortController(),timer=win.setTimeout(()=>controller.abort(),30000);
try{
const headers={Accept:'application/json'};
for(const pair of (Zotero.Prefs.get('zotero-tts.fishspeech.headers')||'').split(/[;\n]/)){const i=pair.indexOf(':');if(i<1)continue;const k=pair.slice(0,i).trim(),v=pair.slice(i+1).trim();if(k&&v&&!/\s/.test(k))headers[k]=v;}
const base=Zotero.Prefs.get('zotero-tts.fishspeech.baseURL').trim().replace(/\/+$/,'').replace(/\/v1$/i,'').replace(/\/+$/,'');
const response=await sb.fetch(base+'/v1/references/list',{headers,signal:controller.signal});state.http=response.status;
if(response.ok){const data=await response.json();state.references=data.reference_ids;state.status=Array.isArray(data.reference_ids)?'listed':'invalid-response';}else state.status='refused';
}catch(e){state.status='failed';state.error=e.name==='AbortError'?'30-second timeout':'Connection or JSON response failed';}
finally{win.clearTimeout(timer);}
})();
return JSON.stringify({status:state.status});
})()
