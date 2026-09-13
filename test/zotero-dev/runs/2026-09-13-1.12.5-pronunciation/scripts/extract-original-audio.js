// Prerequisites: the original paused EPUB, segments and decoded buffers from
// runs/2026-09-13-1.12.5-pronunciation/report.md; the /tmp output folder exists.
// Reads cached PCM and writes mono PCM16 WAV files only. No playback, synthesis,
// preferences or reader state changes. Remove the /tmp WAV files when no longer needed.
(async()=>{
const readers=Zotero.Reader._readers;let r=null;
for(let i=0;i<readers.length;i++)if(readers[i].itemID===24246)r=readers[i];
if(!r)return JSON.stringify({error:'Original reader is no longer open'});
const m=r._internalReader._readAloudManager,c=m._controller;
const out=[];
for(const [i,expected,name] of [[6653,'< 100 exp>','100-exp-no-trailing-space'],[6654,'< 100 exp >','100-exp'],[6656,'< 2/50 HP >','2-of-50-hp']]){
const s=c._segments[i],b=c._audioBuffers.get(i);
if(s?.text!==expected||!b){out.push({i,error:'Original segment or cached audio unavailable'});continue;}
const samples=b.getChannelData(0),bytes=new Uint8Array(44+samples.length*2),v=new DataView(bytes.buffer);
const str=(p,t)=>{for(let j=0;j<t.length;j++)bytes[p+j]=t.charCodeAt(j);};
str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,b.sampleRate,true);v.setUint32(28,b.sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);
for(let j=0;j<samples.length;j++){const x=Math.max(-1,Math.min(1,samples[j]));v.setInt16(44+j*2,Math.round(x*(x<0?32768:32767)),true);}
const path='/tmp/ztts-pronunciation-research/'+name+'.wav';await IOUtils.write(path,bytes);
out.push({i,text:s.text,path,duration:b.duration,sampleRate:b.sampleRate});
}
return JSON.stringify({files:out,state:{active:m.active,paused:m.paused,position:c._position,voice:m.selectedVoiceID},source:'Existing decoded audio cache; no synthesis or playback'});
})()
