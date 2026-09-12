(async () => {
  const win=Services.wm.getMostRecentWindow('zotero:pref'); const started=Date.now(); let selected=null; let tts=false;
  for(let i=0;i<30;i++){const n=win&&win.document.querySelector('richlistitem[selected="true"]');selected=n?n.getAttribute('value'):null;tts=!!(win&&win.document.getElementById('ztts-strip-angle-brackets'));if(selected==='zotero-prefpane-general')break;await new Promise(resolve=>setTimeout(resolve,100));}
  return JSON.stringify({open:!!win,selected,ttsPane:tts,ms:Date.now()-started});
})()
