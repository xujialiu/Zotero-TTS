return (async () => {
  const ids=(globalThis.__ztts81?.created??[]).map((x)=>Number(x));const result=[];
  for(const id of ids){
    const item=Zotero.Items.get(id);
    if(!item){result.push({id,found:false});continue}
    try{await item.eraseTx();result.push({id,found:true,erased:true})}catch(e){result.push({id,found:true,erased:false,error:String(e)})}
  }
  return JSON.stringify({result});
})()

