(() => {
  try {
    const result = Zotero.Reader.open(25431);
    return JSON.stringify({called:true,resultType:typeof result,readers:(Zotero.Reader._readers||[]).length});
  } catch (e) {
    return JSON.stringify({called:false,error:String(e),stack:e?.stack||null});
  }
})()
