(async () => {
  const list=Zotero.Reader._readers||[];let reader=null;for(let i=0;i<list.length;i++)if(list[i].itemID===25431)reader=list[i];
  const cleanup={readerFound:!!reader,errors:[],closed:false,erased:false};
  if(reader){
    try{reader._internalReader&&reader._internalReader.toggleReadAloudPopup(false)}catch(e){cleanup.errors.push('toggle:'+String(e))}
    try{const p=reader.close();if(p&&typeof p.then==='function')await p;cleanup.closed=true}catch(e){cleanup.errors.push('close:'+String(e))}
  }
  for(let i=0;i<30;i++){let found=false;const now=Zotero.Reader._readers||[];for(let j=0;j<now.length;j++)if(now[j].itemID===25431)found=true;if(!found)break;await new Promise(resolve=>setTimeout(resolve,100))}
  try{const item=Zotero.Items.get(25431);if(item){await item.eraseTx();cleanup.erased=true}else cleanup.itemMissingBeforeErase=true}catch(e){cleanup.errors.push('erase:'+String(e))}
  await new Promise(resolve=>setTimeout(resolve,300));
  const now=Zotero.Reader._readers||[];let remaining=0;for(let i=0;i<now.length;i++)if(now[i].itemID===25431)remaining++;
  let itemExists=false;try{itemExists=!!Zotero.Items.get(25431)}catch(e){itemExists=false}
  let position=null;try{position=JSON.parse(await Zotero.ZoteroTTS.diagnostics.position())}catch(e){position={error:String(e)}}
  return JSON.stringify({cleanup,remainingReaders:now.length,fixtureReadersRemaining:remaining,fixtureItemExists:itemExists,position:{database:position&&position.database?{rows:position.database.rows,userVersion:position.database.userVersion}:null,store:position&&position.store?{queued:position.store.queued,lastError:position.store.lastError,deletions:position.store.deletions}:null,localEntries:position&&position.localEntries!==undefined?position.localEntries:null}},null,1);
})()
