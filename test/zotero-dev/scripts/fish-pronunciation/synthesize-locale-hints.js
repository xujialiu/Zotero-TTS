// User-authorized experiment: four Fish free-model requests, each bounded to 60 s.
// Prerequisites: the original paused Dax reader at en-US; .tmp/fish-locale-test exists.
// Does not change preferences, reader state or plugin code, and never plays audio.
// Poll Zotero.__zttsFishLocaleProbe.status, then preserve results.json and delete
// the temporary Zotero property after completion. Audio quality requires listening.
(()=>{
if(Zotero.__zttsFishLocaleProbe)return JSON.stringify({error:'Probe state already exists'});
const r=Zotero.Reader._readers[0],m=r._internalReader._readAloudManager;
const locale=m._voice.language,reference=m.selectedVoiceID.split('/').pop();
if(locale!=='en-US'||reference!=='9fa4b7a1b67446b48208f2f5d4bcd8da'||!m.paused)return JSON.stringify({error:'Fixture state changed'});
const language=new Intl.DisplayNames(['en'],{type:'language'}).of(locale);
const segmenter=new Intl.Segmenter(locale,{granularity:'word'});
const specs=[];
for(const [name,text] of [['100-exp',' 100 exp'],['2-50-hp',' 2/50 HP ']]){
const words=Array.from(segmenter.segment(text)).filter(s=>s.isWordLike).length;
specs.push({name:'baseline-'+name,text,words,hint:false});
specs.push({name:'english-hint-'+name,text:words<4?'[Speak in '+language+']'+text:text,words,hint:words<4});
}
const state={status:'running',locale,language,model:'s2.1-pro-free',reference,results:[],before:{paused:m.paused,position:m._controller._position,voice:m.selectedVoiceID}};
Zotero.__zttsFishLocaleProbe=state;
const sb=Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup);
const win=r._window;
(async()=>{
try{
for(const spec of specs){
const controller=new win.AbortController(),timer=win.setTimeout(()=>controller.abort(),60000),started=Date.now();
try{
const body={text:spec.text,format:'mp3',mp3_bitrate:128,latency:'normal',reference_id:reference};
const response=await sb.fetch('https://api.fish.audio/v1/tts/stream/with-timestamp',{method:'POST',headers:{'Content-Type':'application/json',model:state.model,Authorization:'Bearer '+Zotero.Prefs.get('zotero-tts.fish.apiKey').trim()},body:JSON.stringify(body),signal:controller.signal});
if(!response.ok){state.results.push({...spec,status:response.status,error:'HTTP refusal',elapsed:Date.now()-started});break;}
const raw=await response.text(),chunks=[],events=[];
for(const line of raw.split(/\r?\n/)){
if(!line.startsWith('data:'))continue;
let event;try{event=JSON.parse(line.slice(5).trim());}catch{continue;}
if(event.audio_base64){const binary=sb.atob(event.audio_base64);const bytes=new Uint8Array(binary.length);for(let j=0;j<binary.length;j++)bytes[j]=binary.charCodeAt(j);chunks.push(bytes);}
events.push({content:event.content,chunk_seq:event.chunk_seq,chunk_audio_offset_sec:event.chunk_audio_offset_sec,alignment:event.alignment});
}
const audio=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const chunk of chunks){audio.set(chunk,offset);offset+=chunk.length;}
if(!audio.length)throw new Error('No audio in response');
const path='/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-locale-test/'+spec.name+'.mp3';
await IOUtils.write(path,audio);
state.results.push({...spec,status:response.status,path,audioBytes:audio.length,elapsed:Date.now()-started,events});
}catch(e){state.results.push({...spec,error:e.name==='AbortError'?'Timed out after 60 seconds':'Request or audio extraction failed',elapsed:Date.now()-started});break;}
finally{win.clearTimeout(timer);}
}
state.status=state.results.length===4&&state.results.every(r=>r.status===200)?'complete':'failed';
state.after={paused:m.paused,position:m._controller._position,voice:m.selectedVoiceID};
await IOUtils.writeUTF8('/Users/xujialiu/Works/Zotero-TTS/.tmp/fish-locale-test/results.json',JSON.stringify(state,null,2));
}catch(e){state.status='failed';state.error='Probe setup or file write failed';}
})();
return JSON.stringify({status:state.status,locale,language,specs});
})()
