return (async()=>{
 const win=Services.wm.getMostRecentWindow('zotero:pref'); if(!win)return JSON.stringify({error:'no settings'});
 await win.Zotero_Preferences.navigateToPane('zotero-tts-pane'); await new Promise(r=>setTimeout(r,300));
 const d=win.document,btn=d.getElementById('ztts-key-toggleAutoScroll'),clr=d.getElementById('ztts-key-clear-toggleAutoScroll');
 const name='extensions.zotero.zotero-tts.shortcuts.toggleAutoScroll';
 const old={value:Services.prefs.getStringPref(name,'Shift+A'),user:Services.prefs.prefHasUserValue(name)};
 const snap=()=>({pref:Services.prefs.getStringPref(name,'<none>'),user:Services.prefs.prefHasUserValue(name),label:btn?.getAttribute('label')??null,message:d.getElementById('ztts-key-message')?.textContent??null});
 let error=null,recording=null,custom=null,cleared=null;
 try{
  btn?.click(); await new Promise(r=>setTimeout(r,120)); recording=snap();
  const tip=Components.classes['@mozilla.org/text-input-processor;1'].createInstance(Components.interfaces.nsITextInputProcessor);
  const K=win.KeyboardEvent, ev=(key,code,keyCode,mods={})=>new K('',{key,code,keyCode,bubbles:true,cancelable:true,...mods});
  tip.beginInputTransactionForTests(win);
  const ret=[tip.keydown(ev('Control','ControlLeft',17,{ctrlKey:true})),tip.keydown(ev('Shift','ShiftLeft',16,{ctrlKey:true,shiftKey:true})),tip.keydown(ev('F9','F9',120,{ctrlKey:true,shiftKey:true})),tip.keyup(ev('F9','F9',120,{ctrlKey:true,shiftKey:true})),tip.keyup(ev('Shift','ShiftLeft',16,{ctrlKey:true})),tip.keyup(ev('Control','ControlLeft',17,{}))];
  await new Promise(r=>setTimeout(r,180)); custom={...snap(),ret};
  clr?.click(); await new Promise(r=>setTimeout(r,180)); cleared=snap();
 }catch(e){error=String(e)}
 finally{if(old.user)Services.prefs.setStringPref(name,old.value);else Services.prefs.clearUserPref(name);await new Promise(r=>setTimeout(r,100));}
 return JSON.stringify({old,recording,custom,cleared,error,restored:snap()});
})()
