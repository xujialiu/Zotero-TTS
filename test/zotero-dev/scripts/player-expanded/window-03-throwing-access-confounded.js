return (async () => {
  const pref='extensions.zotero.zotero-tts.readAloud.openExpanded';
  const reader=(Zotero.Reader._readers??[]).find(r=>r?._instanceID==='oxkx7jxW');
  const doc=reader?._iframeWindow?.document; const rs=Zotero.Reader._readers??[]; const index=rs.indexOf(reader);
  if(!reader||!doc||index<0)return JSON.stringify({error:'target-reader-missing'});
  for(const old of Array.from(doc.querySelectorAll('.ztts81-fault-popup'))){const wo=Components.utils.waiveXrays(old);wo.parentNode?.removeChild(wo);}
  Services.prefs.setBoolPref(pref,false); Services.prefs.setBoolPref(pref,true);
  await new Promise(resolve=>setTimeout(resolve,20));
  const style=doc.getElementById('ztts-player-expanded');
  const styleParent=style?.parentNode??null;
  const popup=doc.createElement('div');popup.id='ztts81-throwing-detached';popup.className='read-aloud-popup ztts81-fault-popup';popup.style.cssText='display:block;width:80px;height:20px;';
  const row=doc.createElement('div');row.className='row buttons';const group=doc.createElement('div');group.className='group';const button=doc.createElement('button');button.className='toolbar-button';group.appendChild(button);row.appendChild(group);popup.appendChild(row);
  let getterCalls=0;Object.defineProperty(button,'click',{configurable:true,enumerable:true,get(){getterCalls++;throw new Error('Issue81 disposable throwing click detached');}});
  Components.utils.waiveXrays(doc.body??doc.documentElement).appendChild(Components.utils.waiveXrays(popup));
  const before={visibility:doc.defaultView.getComputedStyle(popup).visibility,gateMatches:popup.matches('.read-aloud-popup:not([data-ztts-expanded-ready])'),styleInDocument:!!style,styleTextLength:style?.textContent?.length??null};
  const detachedStyle=style?Components.utils.waiveXrays(style):null;detachedStyle?.parentNode?.removeChild(detachedStyle);
  await new Promise(resolve=>setTimeout(resolve,250));
  const actual=doc.querySelector('#ztts81-throwing-detached');
  const diagnostic=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index]??null;
  const after={visibility:actual?doc.defaultView.getComputedStyle(actual).visibility:null,gateMatches:actual?.matches('.read-aloud-popup:not([data-ztts-expanded-ready])')??null,readyAttr:actual?.hasAttribute('data-ztts-expanded-ready')??null,styleInDocument:!!doc.getElementById('ztts-player-expanded'),styleTextLength:style?.textContent?.length??null};
  const result={scenario:'throwing-options-click',target:{index,instanceID:reader._instanceID,constructor:reader.constructor?.name??null,itemID:reader.itemID,windowType:reader._window?.document?.documentElement?.getAttribute?.('windowtype')??null},getterCalls,before,diagnostic,after};
  const wa=actual?Components.utils.waiveXrays(actual):null;wa?.parentNode?.removeChild(wa);
  if(style&&styleParent) Components.utils.waiveXrays(styleParent).appendChild(Components.utils.waiveXrays(style));
  Services.prefs.setBoolPref(pref,false); Services.prefs.setBoolPref(pref,true);
  await new Promise(resolve=>setTimeout(resolve,50));
  return JSON.stringify(result);
})()
