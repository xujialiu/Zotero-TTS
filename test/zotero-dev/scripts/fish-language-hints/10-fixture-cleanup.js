(async () => {
  const fixtureID=24426;
  const list0=Zotero.Reader._readers||[];
  let fixture=null;
  for(let i=0;i<list0.length;i++)if(list0[i].itemID===fixtureID){fixture=list0[i];break;}
  const out={found:!!fixture,errors:[]};
  if(fixture){
    try{fixture._internalReader&&fixture._internalReader.toggleReadAloudPopup(false);}catch(e){out.errors.push('toggle:'+String(e));}
    await new Promise(resolve=>setTimeout(resolve,500));
    try{const p=fixture.close();if(p&&typeof p.then==='function')await p;out.closed=true;}catch(e){out.errors.push('close:'+String(e));}
  }
  for(let i=0;i<40;i++){let found=false;const now=Zotero.Reader._readers||[];for(let j=0;j<now.length;j++)if(now[j].itemID===fixtureID)found=true;if(!found)break;await new Promise(resolve=>setTimeout(resolve,100));}
  try{const item=Zotero.Items.get(fixtureID);if(item){await item.eraseTx();out.erased=true;}else out.itemMissing=true;}catch(e){out.errors.push('erase:'+String(e));}
  return JSON.stringify(out,null,1);
})()
