(async () => {
  const list=Zotero.Reader._readers||[]; let reader=null;
  for(let i=0;i<list.length;i++) if(list[i].itemID===25431) reader=list[i];
  if(!reader) return JSON.stringify({error:'fixture reader missing'});
  const internal=reader._internalReader; const manager=internal&&internal._readAloudManager; const trace=[];
  try {
    internal.toggleReadAloudPopup(true);
    for(let i=0;i<60;i++) {
      const c=manager&&manager._controller; const ctx=c&&c._audioContext;
      trace.push({ms:i*100,active:!!(manager&&manager.active),paused:manager?!!manager.paused:null,
        selectedVoiceID:manager?manager.selectedVoiceID:null,selectedTier:manager?manager._selectedTier:null,
        lang:manager?manager.lang:null,audioState:ctx?ctx.state:null,audioTime:ctx?ctx.currentTime:null,
        position:c?c._position:null,segmentIndex:c?c._segmentIndex:null});
      if(i>=5&&manager&&manager.active&&!manager.paused) {
        try{manager.pause()}catch(e){trace.push({pauseError:String(e)});}
        await new Promise(resolve=>setTimeout(resolve,100)); break;
      }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  } catch(e) { return JSON.stringify({error:String(e),stack:e&&e.stack,trace},null,1); }
  return JSON.stringify({trace:trace.length>6?[trace[0],trace[1],trace[trace.length-2],trace[trace.length-1]]:trace,
    traceCount:trace.length,final:trace[trace.length-1]||null},null,1);
})()
