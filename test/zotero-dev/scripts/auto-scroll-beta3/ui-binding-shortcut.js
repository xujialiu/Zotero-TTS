return (async()=>{
  const win=Services.wm.getMostRecentWindow('zotero:pref');
  if(!win)return JSON.stringify({error:'no settings window'});
  await win.Zotero_Preferences.navigateToPane('zotero-tts-pane');
  const end=Date.now()+6000;
  while(Date.now()<end&&!win.document.getElementById('ztts-openai-server')) await new Promise(r=>setTimeout(r,100));
  const d=win.document;
  const g=d.getElementById('ztts-auto-scroll-mode');
  const rows=Array.from(g?.querySelectorAll('radio')??[]).map(x=>({label:x.getAttribute('label'),value:x.getAttribute('value'),selected:!!x.selected}));
  const name='extensions.zotero.zotero-tts.readAloud.autoScrollMode';
  const before={pref:Services.prefs.getStringPref(name,'<none>'),value:g?.value??null};
  const elements=Array.from(g?.querySelectorAll('radio')??[]);
  elements.find(x=>x.getAttribute('value')==='sentence')?.click();
  await new Promise(r=>setTimeout(r,300));
  const afterSentence=Services.prefs.getStringPref(name,'<none>');
  elements.find(x=>x.getAttribute('value')==='outside')?.click();
  await new Promise(r=>setTimeout(r,300));
  const afterOutside=Services.prefs.getStringPref(name,'<none>');
  const shortcut=d.getElementById('ztts-key-toggleAutoScroll');
  const clear=d.getElementById('ztts-key-clear-toggleAutoScroll');
  return JSON.stringify({loaded:!!d.getElementById('ztts-openai-server'),before,rows,afterSentence,afterOutside,uiValue:g?.value??null,shortcut:{exists:!!shortcut,text:shortcut?.label??shortcut?.textContent??null,disabled:!!shortcut?.disabled},clear:{exists:!!clear,disabled:!!clear?.disabled}});
})()
