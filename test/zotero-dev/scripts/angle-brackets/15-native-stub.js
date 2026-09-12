(async () => {
  const nativeCalls=[], voiceCalls=[]; let targetReader=null, proto=null, original=null, patchRestored=false, error=null, voicesSummary=null, results=null;
  const snapshotSegment=segment=>{
    if(segment==='sample')return {kind:'sample'};
    const out={kind:'segment',keys:segment?Object.keys(segment):null,text:segment?segment.text:null,lang:segment?segment.lang:null,paragraphStart:segment?segment.paragraphStart:null};
    try{out.position=segment&&segment.position?JSON.parse(JSON.stringify(segment.position)):null}catch(e){out.position=String(segment&&segment.position)}
    try{out.sourcePosition=segment&&segment.sourcePosition?JSON.parse(JSON.stringify(segment.sourcePosition)):null}catch(e){out.sourcePosition=String(segment&&segment.sourcePosition)}
    return out;
  };
  const resultView=(source,result)=>({audioBytes:result&&result.audio?result.audio.size:null,error:result&&result.error||null,noStore:result&&result.noStore===true,marker:result&&result.marker||null,timestamps:result&&result.timestamps?result.timestamps.map(t=>({start:t.start,end:t.end,charStart:t.charStart,charEnd:t.charEnd,sourceSlice:source?source.slice(t.charStart,t.charEnd):null})):null});
  const list0=Zotero.Reader._readers||[]; let existing=null; for(let i=0;i<list0.length;i++)if(list0[i].itemID!==25431){existing=list0[i];break;}
  try{
    if(!existing)throw new Error('user reader missing; refusing native stub');
    proto=Object.getPrototypeOf(existing); original=proto&&proto._getReadAloudRemoteInterface; if(typeof original!=='function')throw new Error('native prototype method missing');
    const nativeStub={
      getVoices:async()=>{voiceCalls.push({method:'getVoices'});return {voices:{standard:[{id:'stub-standard',name:'Stub Standard'}],premium:[{id:'stub-premium',name:'Stub Premium'}]},standardCreditsRemaining:17,premiumCreditsRemaining:23};},
      getAudio:async(segment,voice)=>{nativeCalls.push({method:'getAudio',voiceID:voice&&voice.id||null,segment:snapshotSegment(segment)});if(segment!=='sample'&&segment&&segment.text==='Error')return {audio:null,error:'native-network',noStore:true};const audio=new Blob(['native-stub'],{type:'audio/mpeg'});if(segment==='sample')return {audio,marker:'sample-unchanged'};const charStart=segment.text&&segment.text[0]==='“'?1:0;return {audio,marker:'native-unchanged',timestamps:[{start:0.1,end:0.9,charStart,charEnd:charStart+5}]}},
      getCreditsRemaining:async()=>({standardCreditsRemaining:17,premiumCreditsRemaining:23}),
      resetCredits:async()=>({standardCreditsRemaining:17,premiumCreditsRemaining:23})
    };
    proto._getReadAloudRemoteInterface=function(){return nativeStub}; Zotero.Reader.open(25431);
    for(let i=0;i<80;i++){const list=Zotero.Reader._readers||[];for(let j=0;j<list.length;j++)if(list[j].itemID===25431&&list[j]._internalReader&&list[j]._internalReader._readAloudManager){targetReader=list[j];break;}if(targetReader&&targetReader._internalReader._readAloudManager._options&&targetReader._internalReader._readAloudManager._options.remoteInterface)break;await new Promise(resolve=>setTimeout(resolve,100));}
    if(!targetReader)throw new Error('fixture reader did not initialize');
    const iface=targetReader._internalReader._readAloudManager._options.remoteInterface; const voices=await iface.getVoices(); const tiers=voices&&voices.voices?Object.keys(voices.voices):[]; voicesSummary={tiers:tiers.map(t=>({tier:t,count:voices.voices[t]&&voices.voices[t].length||0})),standardCredits:voices.standardCreditsRemaining,premiumCredits:voices.premiumCreditsRemaining};
    const standardSegment=Object.freeze({text:'<Hello>.',lang:'en',paragraphStart:true,position:{start:[0,0,0],end:[0,0,8]},sourcePosition:{type:'FragmentSelector',value:'stub-standard-position'}});
    const premiumSegment=Object.freeze({text:'“<World>!”',lang:'en',paragraphStart:false,position:{start:[1,0,0],end:[1,0,10]},sourcePosition:{type:'FragmentSelector',value:'stub-premium-position'}});
    results={standard:resultView(standardSegment.text,await iface.getAudio(standardSegment,{id:'stub-standard'})),premium:resultView(premiumSegment.text,await iface.getAudio(premiumSegment,{id:'stub-premium'})),sample:resultView(null,await iface.getAudio('sample',{id:'stub-standard'})),error:resultView('<Error>',await iface.getAudio({text:'<Error>',lang:'en'},{id:'stub-premium'}))};
  }catch(e){error={message:String(e),stack:e&&e.stack||null};}
  finally{if(proto&&original){try{proto._getReadAloudRemoteInterface=original;patchRestored=proto._getReadAloudRemoteInterface===original}catch(e){patchRestored=false;error=error||{message:String(e)}}}}
  return JSON.stringify({patchRestored,voiceCalls,nativeCalls,voicesSummary,results,error},null,1);
})()
