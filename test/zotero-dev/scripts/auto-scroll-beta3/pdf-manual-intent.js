return (async()=>{
 const rr=(Zotero.Reader._readers??[]).find(r=>r&&r.itemID===25417);const v=rr._internalReader._primaryView,m=rr._internalReader._readAloudManager,c=v._iframeWindow.document.getElementById('viewerContainer'),w=rr._window;
 const diag=()=>JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll())[0];
 const before=diag();let wheelError=null;try{w.windowUtils.sendWheelEvent(800,600,0,120,0,0,0,0,0,0)}catch(e){wheelError=String(e)}
 await new Promise(r=>setTimeout(r,400));const disengaged=diag();let playError=null;try{m.play()}catch(e){playError=String(e)}
 await new Promise(r=>setTimeout(r,450));const resumed=diag();if(m?.active&&!m.paused)try{m.pause()}catch{}
 return JSON.stringify({wheelError,playError,before:{following:before.following,reason:before.reason,scrollTop:before.viewport?.scrollTop},disengaged:{following:disengaged.following,reason:disengaged.reason,scrollTop:c.scrollTop},resumed:{following:resumed.following,reason:resumed.reason,position:m?._controller?._position??null,clock:m?._controller?._audioContext?.currentTime??null,scrollTop:c.scrollTop}});
})()
