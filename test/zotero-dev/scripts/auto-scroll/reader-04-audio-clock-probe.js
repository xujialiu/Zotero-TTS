return (async()=>{
  const rr=(Zotero.Reader._readers??[]).find(r=>r&&r.itemID===25417);
  const w=rr._iframeWindow;
  const m=rr._internalReader._readAloudManager;
  Zotero_Tabs.select(rr.tabID); rr.focus?.();
  const tip=Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const ev=(key,code,keyCode)=>new w.KeyboardEvent('',{key,code,keyCode,bubbles:true,cancelable:true,shiftKey:key==='Shift'});
  tip.beginInputTransactionForTests(w);
  const ret=[tip.keydown(ev('Shift','ShiftLeft',16)),tip.keydown(ev(' ','Space',32)),tip.keyup(ev(' ','Space',32)),tip.keyup(ev('Shift','ShiftLeft',16))];
  const samples=[];
  for(let i=0;i<8;i++){
    const c=m?._controller;
    samples.push({t:i*250,active:!!m?.active,paused:!!m?.paused,pos:c?._position??null,ctx:c?._audioContext?.state??null,time:c?._audioContext?.currentTime??null});
    await new Promise(r=>setTimeout(r,250));
  }
  if(m?.active&&!m.paused)try{m.pause();}catch{}
  return JSON.stringify({ret,samples:{first:samples[0],last:samples.at(-1),count:samples.length}});
})()
