(async () => {
  const fullPrefetch='extensions.zotero.zotero-tts.prefetchEnabled';
  const prefetchBefore=!!Zotero.Prefs.get('zotero-tts.prefetchEnabled');
  const prefetchUserBefore=Services.prefs.prefHasUserValue(fullPrefetch);
  const list=Zotero.Reader._readers||[]; let reader=null; for(let i=0;i<list.length;i++)if(list[i].itemID===25431)reader=list[i];
  const manager=reader&&reader._internalReader&&reader._internalReader._readAloudManager; const iface=manager&&manager._options&&manager._options.remoteInterface; const voiceID=manager&&manager.selectedVoiceID;
  const source='<Hello world>.'; const calls=[]; const results=[]; let error=null;
  const sandbox=Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup); const originalFetch=sandbox.fetch;
  const wrappedFetch=function(input,init){let text=null;try{const body=init&&init.body;if(typeof body==='string'){const parsed=JSON.parse(body);text=typeof parsed.text==='string'?parsed.text:null;}}catch(e){}let path=String(input);const marker=path.indexOf('://');if(marker>=0){const slash=path.indexOf('/',marker+3);if(slash>=0)path=path.slice(slash);}calls.push({path,method:init&&init.method||'GET',text});return Reflect.apply(originalFetch,sandbox,[input,init]);};
  try{
    sandbox.fetch=wrappedFetch; Zotero.Prefs.set('zotero-tts.prefetchEnabled',false);
    if(!iface||!voiceID)throw new Error('fixture remote interface or voice missing');
    for(let i=0;i<2;i++){const result=await iface.getAudio({text:source},{id:voiceID});results.push({audioBytes:result.audio&&result.audio.size||null,error:result.error||null,timestamps:result.timestamps?result.timestamps.map(t=>({start:t.start,end:t.end,charStart:t.charStart,charEnd:t.charEnd,sourceSlice:source.slice(t.charStart,t.charEnd)})):null});}
  }catch(e){error={message:String(e),stack:e&&e.stack||null};}
  finally{sandbox.fetch=originalFetch;if(prefetchUserBefore)Zotero.Prefs.set('zotero-tts.prefetchEnabled',prefetchBefore);else Services.prefs.clearUserPref(fullPrefetch);}
  return JSON.stringify({configured:Zotero.Prefs.get('zotero-tts.readAloud.stripAngleBrackets'),textSettings:JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings()),source,calls,results,sameTimestamps:JSON.stringify(results[0]?.timestamps)===JSON.stringify(results[1]?.timestamps),error,prefetchRestored:!!Zotero.Prefs.get('zotero-tts.prefetchEnabled')===prefetchBefore&&Services.prefs.prefHasUserValue(fullPrefetch)===prefetchUserBefore},null,1);
})()
