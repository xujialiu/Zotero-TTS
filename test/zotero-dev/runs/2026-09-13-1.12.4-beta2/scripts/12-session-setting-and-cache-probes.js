(async () => {
  const list=Zotero.Reader._readers||[]; let reader=null;
  for(let i=0;i<list.length;i++)if(list[i].itemID===25431)reader=list[i];
  const internal=reader&&reader._internalReader; const manager=internal&&internal._readAloudManager; const trace=[]; let error=null;
  try{
    internal.toggleReadAloudPopup(true);
    for(let i=0;i<70;i++){
      trace.push({ms:i*100,active:!!(manager&&manager.active),paused:manager?!!manager.paused:null,voice:manager?manager.selectedVoiceID:null});
      if(i>=3&&manager&&manager.active&&!manager.paused){manager.pause();await new Promise(resolve=>setTimeout(resolve,100));break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }catch(e){error=String(e)}
  return JSON.stringify({error,traceCount:trace.length,trace:trace.length>6?[trace[0],trace[1],trace[trace.length-2],trace[trace.length-1]]:trace,
    active:!!(manager&&manager.active),paused:manager?!!manager.paused:null,textSettings:JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings())},null,1);
})()
