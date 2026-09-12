(async () => {
  const win=Services.wm.getMostRecentWindow('zotero:pref');
  if(!win)return JSON.stringify({open:false});
  let error=null;try{await win.Zotero_Preferences.navigateToPane('general')}catch(e){error=String(e)}
  await new Promise(resolve=>win.setTimeout(resolve,200));
  const selected=win.document.querySelector('richlistitem[selected="true"]');
  return JSON.stringify({open:true,error,selected:selected?selected.getAttribute('value'):null,ttsPane:!!win.document.getElementById('ztts-strip-angle-brackets')});
})()
