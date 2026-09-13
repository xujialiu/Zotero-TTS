return (async()=>{
  const rr=(Zotero.Reader._readers??[]).find(r=>r&&r.itemID===25417);
  const v=rr._internalReader._primaryView;
  const m=rr._internalReader._readAloudManager;
  const c=v._iframeWindow.document.getElementById('viewerContainer');
  const name='extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const old=Services.prefs.getStringPref(name,'outside');
  Services.prefs.setStringPref(name,'sentence');
  await new Promise(r=>setTimeout(r,120));
  const before={mode:Services.prefs.getStringPref(name),pos:m?._controller?._position??null,paused:!!m?.paused,clock:m?._controller?._audioContext?.currentTime??null,scrollTop:c.scrollTop};
  let playError=null;
  try{m.play();}catch(e){playError=String(e);}
  const samples=[];
  for(let i=0;i<14;i++){
    const cc=m?._controller;
    const d=JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[0];
    samples.push({t:i*500,pos:cc?._position??null,curIndex:cc?._currentIndex??null,active:!!m?.active,paused:!!m?.paused,clock:cc?._audioContext?.currentTime??null,scrollTop:c.scrollTop,last:d?.last?{reason:d.last.reason,top:d.last.top,from:d.last.from,issued:d.last.issued}:null});
    if((cc?._position??-1)>=54){try{m.pause();}catch{}break;}
    await new Promise(r=>setTimeout(r,500));
  }
  if(m?.active&&!m.paused){try{m.pause();}catch{}}
  Services.prefs.setStringPref(name,old);
  await new Promise(r=>setTimeout(r,120));
  return JSON.stringify({before,playError,samples:{first:samples[0],last:samples.at(-1),count:samples.length,distinctPositions:[...new Set(samples.map(x=>x.pos))]},restored:Services.prefs.getStringPref(name)});
})()
