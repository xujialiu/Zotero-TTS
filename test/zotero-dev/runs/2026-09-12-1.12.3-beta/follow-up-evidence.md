# Issue #81 live checks (2026-09-12)

This record preserves the successful bridge scripts and their
sanitized outputs for the main session. The run used
build/zotero-tts.xpi, version 1.12.3-beta, SHA-256
8b5f2eb5cb9b2a3ba53f4866d9f296e247aeaae954ce27cf92d531ad5ff430c8.
Zotero was 10.0.2-beta.9+c77df79af, Firefox 140, Windows.

The owned attachment was item 25430, title Issue81 Window Sampling
20260912. It was opened twice deliberately: ReaderTab instance
7mAE7agJ, tab tab-Ye1qMCqO, and ReaderWindow instance oxkx7jxW.
Every result below includes the instance and constructor; no result was
matched by item ID alone.

## Independent-window first-visible sampling

The preference was read as false with no user value and then set to true
for this disposable fixture. The following script was run against the
ReaderWindow instance oxkx7jxW:

~~~js
return (async () => {
  const wantedInstance = 'oxkx7jxW';
  const reader = (Zotero.Reader._readers ?? []).find(r => r?._instanceID === wantedInstance);
  if (!reader) return JSON.stringify({error:'target-reader-missing'});
  const win = reader._window;
  try { win?.focus?.(); } catch {}
  const doc = reader._iframeWindow?.document;
  if (!doc) return JSON.stringify({error:'iframe-missing'});
  const t0 = performance.now();
  const samples = [];
  let firstVisible = null;
  let firstExpanded = null;
  let opened = false;
  try {
    reader._internalReader.toggleReadAloudPopup(true);
    opened = true;
    const until = performance.now() + 5000;
    while (performance.now() < until) {
      const popup = doc.querySelector('.read-aloud-popup');
      const cs = popup ? doc.defaultView.getComputedStyle(popup) : null;
      const rect = popup?.getBoundingClientRect?.();
      const sample = {
        ms: Math.round((performance.now() - t0) * 10) / 10,
        exists: !!popup,
        visibility: cs?.visibility ?? null,
        display: cs?.display ?? null,
        expanded: !!popup?.classList.contains('expanded'),
        ready: !!popup?.hasAttribute('data-ztts-expanded-ready'),
        width: rect ? Math.round(rect.width) : null,
        height: rect ? Math.round(rect.height) : null,
      };
      samples.push(sample);
      const visible = !!popup && sample.visibility !== 'hidden' && sample.display !== 'none' && sample.width > 0 && sample.height > 0;
      if (visible && !firstVisible) firstVisible = sample;
      if (visible && sample.expanded && sample.ready && !firstExpanded) {
        firstExpanded = sample;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const manager = reader._internalReader?._readAloudManager;
    return JSON.stringify({
      target: { instanceID: reader._instanceID, constructor: reader.constructor?.name ?? null, itemID: reader.itemID, tabID: reader.tabID ?? null, windowType: win?.document?.documentElement?.getAttribute?.('windowtype') ?? null },
      firstVisible,
      firstExpanded,
      sampleCount: samples.length,
      firstSamples: samples.slice(0, 8),
      lastSamples: samples.slice(-3),
      managerBeforeClose: { active: !!manager?.active, paused: !!manager?.paused, popupOpen: !!reader._internalReader?.popupOpen },
    });
  } finally {
    if (opened) {
      try { reader._internalReader.toggleReadAloudPopup(false); } catch {}
    }
  }
})()
~~~

Output:

~~~json
{"target":{"instanceID":"oxkx7jxW","constructor":"ReaderWindow","itemID":25430,"tabID":null,"windowType":"zotero:reader"},"firstVisible":{"ms":41.9,"exists":true,"visibility":"visible","display":"flex","expanded":true,"ready":true,"width":300,"height":138},"firstExpanded":{"ms":41.9,"exists":true,"visibility":"visible","display":"flex","expanded":true,"ready":true,"width":300,"height":138},"sampleCount":2,"firstSamples":[{"ms":11.2,"exists":false,"visibility":null,"display":null,"expanded":false,"ready":false,"width":null,"height":null},{"ms":41.9,"exists":true,"visibility":"visible","display":"flex","expanded":true,"ready":true,"width":300,"height":138}],"managerBeforeClose":{"active":false,"paused":true,"popupOpen":false}}
~~~

The same script was run against ReaderTab instance 7mAE7agJ, with
the following two lines added before reading its document:

~~~js
try { win?.focus?.(); } catch {}
try { win?.Zotero_Tabs?.select?.(reader.tabID, true); } catch {}
~~~

Output:

~~~json
{"target":{"instanceID":"7mAE7agJ","constructor":"ReaderTab","itemID":25430,"tabID":"tab-Ye1qMCqO","windowType":"navigator:browser"},"firstVisible":{"ms":342.7,"exists":true,"visibility":"visible","display":"flex","expanded":true,"ready":true,"width":300,"height":138},"firstExpanded":{"ms":342.7,"exists":true,"visibility":"visible","display":"flex","expanded":true,"ready":true,"width":300,"height":138},"sampleCount":2,"firstSamples":[{"ms":10.1,"exists":false,"visibility":null,"display":null,"expanded":false,"ready":false},{"ms":342.7,"exists":true,"visibility":"visible","display":"flex","expanded":true,"ready":true,"width":300,"height":138}],"managerBeforeClose":{"active":false,"paused":true,"popupOpen":false}}
~~~

## Disposable fault checks

All fault checks used ReaderWindow instance oxkx7jxW. The fake nodes
were added to that fixture document only. The final cleanup pass used a
waived reader-realm parentNode.removeChild call before each subsequent
scenario and at reader teardown.

### Missing Options button

~~~js
return (async () => {
  const reader = (Zotero.Reader._readers ?? []).find(r => r?._instanceID === 'oxkx7jxW');
  const doc = reader?._iframeWindow?.document;
  const readers = Zotero.Reader._readers ?? [];
  const index = readers.indexOf(reader);
  if (!reader || !doc || index < 0) return JSON.stringify({error:'target-reader-missing'});
  doc.getElementById('ztts81-missing')?.remove();
  const popup = doc.createElement('div');
  popup.id = 'ztts81-missing';
  popup.className = 'read-aloud-popup';
  popup.style.cssText = 'display:block;width:80px;height:20px;';
  const label = doc.createElement('span');
  label.textContent = 'disposable missing button';
  popup.appendChild(label);
  (doc.body ?? doc.documentElement).appendChild(popup);
  const beforeStyle = doc.defaultView.getComputedStyle(popup).visibility;
  await new Promise(resolve => setTimeout(resolve, 150));
  const diagnostic = JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index] ?? null;
  const afterStyle = doc.defaultView.getComputedStyle(popup).visibility;
  const result = {
    scenario:'missing-options-button',
    target:{index, instanceID:reader._instanceID, constructor:reader.constructor?.name??null, itemID:reader.itemID, windowType:reader._window?.document?.documentElement?.getAttribute?.('windowtype')??null},
    beforeStyle,
    afterStyle,
    diagnostic,
    popupVisibleAfter: afterStyle !== 'hidden',
  };
  popup.remove();
  await new Promise(resolve => setTimeout(resolve, 50));
  return JSON.stringify(result);
})()
~~~

Output:

~~~json
{"scenario":"missing-options-button","target":{"index":2,"instanceID":"oxkx7jxW","constructor":"ReaderWindow","itemID":25430,"windowType":"zotero:reader"},"beforeStyle":"hidden","afterStyle":"visible","diagnostic":{"itemID":25430,"attached":true,"enabled":true,"popup":true,"ready":true,"expanded":false,"clicked":false,"pending":false,"outcome":"failed"},"popupVisibleAfter":true}
~~~

### Throwing Options access

The content DOM's Xray wrapper hides reader-realm expandos, so the working
injection used a reader-realm getter on the button click property. The
plugin error path clears the gate stylesheet. The stylesheet was detached
only after the initial hidden sample, to prevent its own child-list
mutation from causing a second diagnostic scan before the result was read;
it was reattached and the preference was refreshed before returning.

~~~js
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
~~~

Output:

~~~json
{"scenario":"throwing-options-click","target":{"index":2,"instanceID":"oxkx7jxW","constructor":"ReaderWindow","itemID":25430,"windowType":"zotero:reader"},"getterCalls":1,"before":{"visibility":"hidden","gateMatches":true,"styleInDocument":true,"styleTextLength":84},"diagnostic":{"itemID":25430,"attached":true,"enabled":false,"popup":true,"ready":false,"expanded":false,"clicked":false,"pending":false,"outcome":"failed"},"after":{"visibility":"visible","gateMatches":true,"readyAttr":false,"styleInDocument":false,"styleTextLength":0}}
~~~

The error buffer contained Issue81 disposable throwing click detached.

### Noncommitting click timeout

The fake button has the native no-op click, so the expansion class never
commits and the production timer is the only delay.

~~~js
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
~~~

Output (relevant fields):

~~~json
{"scenario":"noncommitting-options-click-timeout","target":{"index":2,"instanceID":"oxkx7jxW","constructor":"ReaderWindow","itemID":25430,"windowType":"zotero:reader"},"elapsedMs":1180,"before":{"visibility":"hidden","gateMatches":true,"ready":false,"diagnostic":{"enabled":true,"popup":false,"ready":false,"clicked":false,"pending":false,"outcome":"setting-changed"}},"pending":{"visibility":"hidden","gateMatches":true,"ready":false,"diagnostic":{"enabled":true,"popup":true,"ready":false,"clicked":true,"pending":true,"outcome":"pending"}},"after":{"visibility":"visible","gateMatches":false,"ready":true,"diagnostic":{"enabled":true,"popup":true,"ready":true,"clicked":true,"pending":false,"outcome":"failed"}}}
~~~

## Existing popup across plugin reload

The real fixture popup was opened on oxkx7jxW and paused immediately. Before
reload: a 104 ms sample showed visibility=visible, expanded=true,
ready=true, clicked=true, pending=false, outcome=expanded; the manager
was active=true, paused=true, selected voice fish::en/...,
local tier, speed 1.8.

Bridge call:

~~~json
{"pluginId":"zotero-tts@xujialiu.top"}
~~~

zotero_plugin_reload returned version 1.12.3-beta.
Zotero.ZoteroTTS.diagnostics.startup() after reload reported all 21 steps
ok and failed: [].

Post-reload script:

~~~js
return (async () => {
  const reader=(Zotero.Reader._readers??[]).find(r=>r?._instanceID==='oxkx7jxW');
  if(!reader)return JSON.stringify({error:'target-reader-missing'});
  await new Promise(resolve=>setTimeout(resolve,250));
  const doc=reader._iframeWindow?.document;const index=Zotero.Reader._readers.indexOf(reader);
  const popup=doc?.querySelector('.read-aloud-popup');const m=reader._internalReader?._readAloudManager;
  const d=JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())[index]??null;
  return JSON.stringify({target:{index,instanceID:reader._instanceID,constructor:reader.constructor?.name??null,itemID:reader.itemID,windowType:reader._window?.document?.documentElement?.getAttribute?.('windowtype')??null},popup:{exists:!!popup,expanded:!!popup?.classList.contains('expanded'),ready:!!popup?.hasAttribute('data-ztts-expanded-ready'),visibility:popup?doc.defaultView.getComputedStyle(popup).visibility:null},diagnostic:d,manager:{active:!!m?.active,paused:!!m?.paused,selectedVoiceID:m?.selectedVoiceID??null,selectedTier:m?._selectedTier??null,speed:m?.speed??null},styleTextLength:doc?.getElementById('ztts-player-expanded')?.textContent?.length??null});
})()
~~~

Output:

~~~json
{"target":{"index":2,"instanceID":"oxkx7jxW","constructor":"ReaderWindow","itemID":25430,"windowType":"zotero:reader"},"popup":{"exists":true,"expanded":true,"ready":true,"visibility":"visible"},"diagnostic":{"itemID":25430,"attached":true,"enabled":true,"popup":true,"ready":true,"expanded":true,"clicked":false,"pending":false,"outcome":"existing"},"manager":{"active":true,"paused":true,"selectedVoiceID":"fish::en/1f97ab64476c4e468a0888ae22954dab","selectedTier":"local","speed":1.8},"styleTextLength":84}
~~~

## Cleanup

The exact cleanup script used explicit reader instance IDs and item ID
guards. It closed only the two disposable readers, erased item 25430, and
cleared the test preference back to its default with no user value.

~~~js
return (async () => {
  const itemID=25430;
  const targetIDs=['7mAE7agJ','oxkx7jxW'];
  const rs=Zotero.Reader._readers??[];
  const targets=rs.filter(r=>r&&targetIDs.includes(r._instanceID)&&r.itemID===itemID);
  const before=targets.map(r=>({instanceID:r._instanceID,constructor:r.constructor?.name??null,tabID:r.tabID??null,popupOpen:!!r._internalReader?.popupOpen,active:!!r._internalReader?._readAloudManager?.active,paused:!!r._internalReader?._readAloudManager?.paused,style:!!r._iframeWindow?.document?.getElementById('ztts-player-expanded'),popup:!!r._iframeWindow?.document?.querySelector('.read-aloud-popup')}));
  for(const r of targets){
    try{if(r._internalReader?.popupOpen||r._iframeWindow?.document?.querySelector('.read-aloud-popup'))r._internalReader.toggleReadAloudPopup(false);}catch{}
  }
  await new Promise(resolve=>setTimeout(resolve,100));
  for(const r of [...targets]){
    try{await Promise.resolve(r.close());}catch{}
  }
  const deadline=Date.now()+6000;
  while(Date.now()<deadline){
    const left=(Zotero.Reader._readers??[]).filter(r=>r&&targetIDs.includes(r._instanceID));
    if(!left.length)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const remainingReaders=(Zotero.Reader._readers??[]).filter(r=>r&&targetIDs.includes(r._instanceID)).map(r=>({instanceID:r._instanceID,itemID:r.itemID}));
  let erased=false;let eraseError=null;
  const item=Zotero.Items.get(itemID);
  if(item){try{await item.eraseTx();erased=true;}catch(e){eraseError=String(e);}}
  await new Promise(resolve=>setTimeout(resolve,250));
  const pos=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const pref='extensions.zotero.zotero-tts.readAloud.openExpanded';
  const prefBefore={effective:Services.prefs.getBoolPref(pref),hasUserValue:Services.prefs.prefHasUserValue(pref)};
  Services.prefs.clearUserPref(pref);
  const prefAfter={effective:Services.prefs.getBoolPref(pref),hasUserValue:Services.prefs.prefHasUserValue(pref)};
  const leftovers=(Zotero.Reader._readers??[]).filter(r=>r&&r.itemID===itemID).map(r=>({instanceID:r._instanceID,constructor:r.constructor?.name??null}));
  return JSON.stringify({before,targetIDs,remainingReaders,erased,eraseError,positionRows:pos.database?.rows??null,fixtureReaderLeftovers:leftovers,prefBefore,prefAfter});
})()
~~~

Output:

~~~json
{"before":[{"instanceID":"7mAE7agJ","constructor":"ReaderTab","tabID":"tab-Ye1qMCqO","popupOpen":false,"active":false,"paused":true,"style":true,"popup":false},{"instanceID":"oxkx7jxW","constructor":"ReaderWindow","tabID":null,"popupOpen":false,"active":true,"paused":true,"style":true,"popup":true}],"targetIDs":["7mAE7agJ","oxkx7jxW"],"remainingReaders":[],"erased":true,"eraseError":null,"positionRows":65,"fixtureReaderLeftovers":[],"prefBefore":{"effective":true,"hasUserValue":true},"prefAfter":{"effective":false,"hasUserValue":false}}
~~~

## Original transport restoration

After fixture cleanup and a no-fixture state check, the verified original
snapshot was restored. The current state before restoration was false/no-user
for both switches; this was the earlier tester's cleanup error, not the
original state. syncSettings was already false/no-user and was never
changed.

~~~js
return (async () => {
 const names={
  positions:'extensions.zotero.zotero-tts.webdav.syncPositions',
  autoUpload:'extensions.zotero.zotero-tts.webdav.autoUploadSettings',
  settings:'extensions.zotero.zotero-tts.webdav.syncSettings',
 };
 const prefSummary=(name)=>({effective:Services.prefs.getBoolPref(name),hasUserValue:Services.prefs.prefHasUserValue(name)});
 const before={positions:prefSummary(names.positions),autoUpload:prefSummary(names.autoUpload),settings:prefSummary(names.settings)};
 Services.prefs.setBoolPref(names.autoUpload,true);
 Services.prefs.setBoolPref(names.positions,true);
 await new Promise(resolve=>setTimeout(resolve,1500));
 const after={positions:prefSummary(names.positions),autoUpload:prefSummary(names.autoUpload),settings:prefSummary(names.settings)};
 let up=null,pos=null;
 try {
  const u=JSON.parse(Zotero.ZoteroTTS.diagnostics.settingsUpload());
  const a=u.autoUpload;
  up={enabled:u.enabled,configured:u.configured,pending:a?.pending??null,uploads:a?.uploads??null,lastError:!!a?.lastError};
 } catch(e){up={error:String(e)};}
 try {
  const p=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position());
  const t=p.transport??{};
  pos={rows:p.database?.rows??null,localEntries:p.localEntries??null,transport:{pulls:t.pulls??null,pushes:t.pushes??null,adopted:t.adopted??null,uploaded:t.uploaded??null,lastError:!!t.lastError}};
 } catch(e){pos={error:String(e)};}
 return JSON.stringify({before,after,settingsUpload:up,position:pos});
})()
~~~

Output immediately after 1.5 s:

~~~json
{"before":{"positions":{"effective":false,"hasUserValue":false},"autoUpload":{"effective":false,"hasUserValue":false},"settings":{"effective":false,"hasUserValue":false}},"after":{"positions":{"effective":true,"hasUserValue":true},"autoUpload":{"effective":true,"hasUserValue":true},"settings":{"effective":false,"hasUserValue":false}},"settingsUpload":{"enabled":true,"configured":true,"pending":true,"uploads":0,"lastError":false},"position":{"rows":65,"localEntries":null,"transport":{"lastError":false}}}
~~~

After a further three seconds, the normal restoration upload settled at
pending=false, uploads=1, lastError=false.

## End state and errors

Final state read: no readers, no fault nodes, 65 position rows,
openExpanded=false with no user value, syncPositions=true and
autoUploadSettings=true with user values, syncSettings=false with no user
value, and debug storage on. The user-facing main window had changed outside
the test; no user tab was restored from a stale snapshot.
The pre-existing Plugins Manager window disappeared during plugin reload and
was not reopened.

The final error buffer contained the expected test evidence:

- Zotero-TTS: player Options button not found; showing the ordinary player.
- Issue81 disposable throwing click detached
- Zotero-TTS: player expansion timed out; showing the ordinary player.

It also contained expected environment noise from the remote/no-audio
session (autoplay NotAllowedError / suspended AudioContext) and Zotero's
missing locale resources / uncaught undefined entries. No plugin stack
failure or dead-object burst was found. The settings restoration debug log
recorded one normal settings auto-upload: 73 settings operation.
