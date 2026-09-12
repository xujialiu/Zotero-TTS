(async () => {
  const list=Zotero.Reader._readers||[];let reader=null;for(let i=0;i<list.length;i++)if(list[i].itemID===25431)reader=list[i];
  if(!reader)return JSON.stringify({error:'fixture reader missing'});
  const internal=reader._internalReader;const manager=internal&&internal._readAloudManager;const trace=[];let error=null;
  try{
    internal.toggleReadAloudPopup(true);
    for(let i=0;i<70;i++){
      const c=manager&&manager._controller;
      trace.push({ms:i*100,active:!!(manager&&manager.active),paused:manager?!!manager.paused:null,voice:manager?manager.selectedVoiceID:null,segments:c&&c._segments?c._segments.length:null});
      if(i>=3&&manager&&manager.active&&!manager.paused){manager.pause();await new Promise(resolve=>setTimeout(resolve,100));break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }catch(e){error=String(e)}
  const c=manager&&manager._controller;const segs=c&&c._segments||[];const actual=[];
  for(let i=0;i<segs.length;i++){const s=segs[i];actual.push({text:s.text,position:s.position?{start:s.position.start,end:s.position.end}:null,sourcePosition:s.sourcePosition?s.sourcePosition.value:null,paragraphSourcePosition:s.paragraphSourcePosition?s.paragraphSourcePosition.value:null});}
  const expected=[
    {text:'<Hello world>.',position:{start:[0,0,0],end:[0,0,14]},sourcePosition:'epubcfi(/6/2!/4/2/1,:0,:14)',paragraphSourcePosition:'epubcfi(/6/2!/4/2/1,:0,:14)'},
    {text:'“<The quick brown fox jumps over the lazy dog>!”',position:{start:[1,0,0],end:[1,0,48]},sourcePosition:'epubcfi(/6/2!/4/4/1,:0,:48)',paragraphSourcePosition:'epubcfi(/6/2!/4/4/1,:0,:48)'},
    {text:'<The next sentence keeps its words and punctuation.>',position:{start:[2,0,0],end:[2,0,52]},sourcePosition:'epubcfi(/6/2!/4/6/1,:0,:52)',paragraphSourcePosition:'epubcfi(/6/2!/4/6/1,:0,:52)'},
    {text:'Ordinary text with a < comparison stays intact.',position:{start:[3,0,0],end:[3,0,47]},sourcePosition:'epubcfi(/6/2!/4/8/1,:0,:47)',paragraphSourcePosition:'epubcfi(/6/2!/4/8/1,:0,:47)'},
    {text:'<Only the opening bracket stays intact.',position:{start:[4,0,0],end:[4,0,39]},sourcePosition:'epubcfi(/6/2!/4/10/1,:0,:39)',paragraphSourcePosition:'epubcfi(/6/2!/4/10/1,:0,:39)'},
    {text:'<>',position:{start:[5,0,0],end:[5,0,2]},sourcePosition:'epubcfi(/6/2!/4/12/1,:0,:2)',paragraphSourcePosition:'epubcfi(/6/2!/4/12/1,:0,:2)'},
    {text:'<The final sentence continues after the empty pair>.',position:{start:[6,0,0],end:[6,0,52]},sourcePosition:'epubcfi(/6/2!/4/14/1,:0,:52)',paragraphSourcePosition:'epubcfi(/6/2!/4/14/1,:0,:52)'}
  ];
  return JSON.stringify({error,traceCount:trace.length,trace:trace.length>6?[trace[0],trace[1],trace[trace.length-2],trace[trace.length-1]]:trace,state:{active:!!(manager&&manager.active),paused:manager?!!manager.paused:null,voice:manager?manager.selectedVoiceID:null},segments:{count:actual.length,unchanged:JSON.stringify(actual)===JSON.stringify(expected),actual},textSettings:JSON.parse(await Zotero.ZoteroTTS.diagnostics.textSettings())},null,1);
})()
