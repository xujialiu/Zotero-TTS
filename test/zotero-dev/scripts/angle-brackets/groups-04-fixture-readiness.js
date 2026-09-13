(async () => {
  const samples=[];
  for (let i=0;i<80;i++) {
    const list=Zotero.Reader._readers||[]; const rows=[];
    for(let j=0;j<list.length;j++) {
      const r=list[j];
      rows.push({itemID:r.itemID,instanceID:r._instanceID,internal:!!r._internalReader,manager:!!(r._internalReader&&r._internalReader._readAloudManager)});
    }
    samples.push({ms:i*100,rows});
    const hit=rows.find?.(x=>x.itemID===25431&&x.internal&&x.manager);
    if(hit) break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  return JSON.stringify({final:samples[samples.length-1],samples:firstLast(samples)},null,1);
  function firstLast(a){if(a.length<=4)return a;return [a[0],a[1],a[a.length-2],a[a.length-1]];}
})()
