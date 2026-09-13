return (async () => {
  const pref='extensions.zotero.zotero-tts.readAloud.openExpanded';
  const reader=(Zotero.Reader._readers??[]).find(r=>r?._instanceID==='oxkx7jxW');
  const doc=reader?._iframeWindow?.document; const rs=Zotero.Reader._readers??[]; const index=rs.indexOf(reader);
  if(!reader||!doc||index<0)return JSON.stringify({error:'target-reader-missing'});
  for(const old of Array.from(doc.querySelectorAll('.ztts81-fault-popup'))){const wo=Components.utils.waiveXrays(old);wo.parentNode?.removeChild(wo);}
  Services.prefs.setBoolPref(pref,false); Services.prefs.setBoolPref(pref,true);
  await new Promise(resolve=>setTimeout(resolve,20));
  const popup=doc.createElement('div');popup.id='ztts81-noncommit';popup.className='read-aloud-popup ztts81-fault-popup';popup.style.cssText='display:block;width:80px;height:20px;';
  const row=doc.createElement('div');row.className='row buttons';const group=doc.createElement('div');group.className='group';const button=doc.createElement('button');button.className='toolbar-button';group.appendChild(button);row.appendChild(group);popup.appendChild(row);
  Components.utils.waiveXrays(doc.body??doc.documentElement).appendChild(Components.utils.waiveXrays(popup));
  const sample=()=>{const p=doc.querySelector('#ztts81-noncommit');const d=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index]??null;return {ms:Math.round(performance.now()*10)/10,visibility:p?doc.defaultView.getComputedStyle(p).visibility:null,gateMatches:p?.matches('.read-aloud-popup:not([data-ztts-expanded-ready])')??null,ready:p?.hasAttribute('data-ztts-expanded-ready')??null,diagnostic:d};};
  const t0=performance.now();const before=sample();await new Promise(resolve=>setTimeout(resolve,100));const pending=sample();await new Promise(resolve=>setTimeout(resolve,1050));const after=sample();
  const result={scenario:'noncommitting-options-click-timeout',target:{index,instanceID:reader._instanceID,constructor:reader.constructor?.name??null,itemID:reader.itemID,windowType:reader._window?.document?.documentElement?.getAttribute?.('windowtype')??null},elapsedMs:Math.round((performance.now()-t0)),before,pending,after};
  const actual=doc.querySelector('#ztts81-noncommit');const wa=actual?Components.utils.waiveXrays(actual):null;wa?.parentNode?.removeChild(wa);await new Promise(resolve=>setTimeout(resolve,50));return JSON.stringify(result);
})()
