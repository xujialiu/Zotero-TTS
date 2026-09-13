return (async()=>{
 const rr=(Zotero.Reader._readers??[]).find(r=>r&&r.itemID===25387);const ir=rr._internalReader,m=ir._readAloudManager,v=ir._primaryView,w=v.iframeWindow,h=v._readAloud,name='extensions.zotero.zotero-tts.readAloud.autoScrollMode';
 const diag=()=>JSON.parse(Zotero.ZoteroTTS.diagnostics.autoScroll()).find(x=>x.kind==='epub')??null;
 const old={value:Services.prefs.getStringPref(name,'outside'),user:Services.prefs.prefHasUserValue(name)};
 const measure=()=>{let rects=[];try{const s=Components.utils.waiveXrays(h?.state),sel=h?._resolveSegmentSelector(s),range=sel?v.toDisplayedRange(sel):null,list=range?.getClientRects?.()??[];for(let i=0;i<list.length;i++){const b=list[i];rects.push([b.left,b.top,b.right,b.bottom])}}catch{}const sx=w.scrollX,sy=w.scrollY;const whole=rects.length?[Math.min(...rects.map(b=>b[0]+sx)),Math.min(...rects.map(b=>b[1]+sy)),Math.max(...rects.map(b=>b[2]+sx)),Math.max(...rects.map(b=>b[3]+sy))]:null;return {rects,whole,expected:whole?((whole[1]+whole[3])/2-w.innerHeight/2):null,fits:whole?whole[3]-whole[1]<=w.innerHeight:null,scrollY:sy,scrollX:sx}};
 const samples=[],targetEvents=[],seenPositions=[];let lastAt=null,prevPos=null,sincePos=0,playError=null,restoreError=null;
 try{
  Services.prefs.setStringPref(name,'sentence');await new Promise(r=>setTimeout(r,120));let d=diag();
  if(d?.last?.top!==null&&d?.last?.top!==undefined)w.scrollTo(0,d.last.top);await new Promise(r=>setTimeout(r,180));
  if(m?.active&&m.paused){try{m.play()}catch(e){playError=String(e)}}
  for(let i=0;i<28;i++){
   const c=m?._controller;d=diag();const pos=c?._position??null;const g=measure();
   if(pos!==prevPos){sincePos=0;prevPos=pos;if(pos!==null&&!seenPositions.includes(pos))seenPositions.push(pos)}else sincePos++;
   const rec={t:i*250,pos,index:c?._currentIndex??null,clock:c?._audioContext?.currentTime??null,active:!!m?.active,paused:!!m?.paused,following:d?.following??null,reason:d?.reason??null,last:d?.last?{at:d.last.at,top:d.last.top,left:d.last.left,reason:d.last.reason,issued:d.last.issued}:null,geometry:g};samples.push(rec);
   if(d?.last?.at!==lastAt){if(d?.last?.at!==undefined&&d?.last?.at!==null)targetEvents.push({t:i*250,pos,clock:rec.clock,last:rec.last,geometry:g});lastAt=d?.last?.at??lastAt;if(d?.last?.top!==null&&d?.last?.top!==undefined)w.scrollTo(0,d.last.top)}
   if(seenPositions.length>=3&&sincePos>=6)break;await new Promise(r=>setTimeout(r,250));
  }
 }finally{try{if(m?.active&&!m.paused)m.pause()}catch{};try{Services.prefs.clearUserPref(name);await new Promise(r=>setTimeout(r,160))}catch(e){restoreError=String(e)}}
 const groups={};for(const s of samples){const k=String(s.pos);(groups[k]??=[]).push(s)}
 const summary=Object.entries(groups).map(([pos,a])=>({pos:Number(pos),count:a.length,first:{t:a[0].t,clock:a[0].clock,scrollY:a[0].geometry.scrollY,whole:a[0].geometry.whole,expected:a[0].geometry.expected,reason:a[0].last?.reason??null,top:a[0].last?.top??null,at:a[0].last?.at??null},last:{t:a.at(-1).t,clock:a.at(-1).clock,scrollY:a.at(-1).geometry.scrollY,whole:a.at(-1).geometry.whole,expected:a.at(-1).geometry.expected,reason:a.at(-1).last?.reason??null,top:a.at(-1).last?.top??null,at:a.at(-1).last?.at??null},uniqueLastAt:[...new Set(a.map(x=>x.last?.at??null))],uniqueTargets:[...new Set(a.map(x=>JSON.stringify({reason:x.last?.reason??null,top:x.last?.top??null,left:x.last?.left??null,issued:x.last?.issued??null})))]}));
 const clocks=samples.map(x=>x.clock).filter(x=>typeof x==='number');return JSON.stringify({old,playError,restoreError,flow:v.flowMode,samplesCount:samples.length,distinctPositions:seenPositions,summary,targetEvents,clock:{first:clocks[0]??null,last:clocks.at(-1)??null,moved:(clocks.at(-1)??0)>(clocks[0]??0)},final:{mode:Services.prefs.getStringPref(name,'<none>'),user:Services.prefs.prefHasUserValue(name),active:!!m?.active,paused:!!m?.paused,following:diag()?.following??null,scrollY:w.scrollY}});
})()
