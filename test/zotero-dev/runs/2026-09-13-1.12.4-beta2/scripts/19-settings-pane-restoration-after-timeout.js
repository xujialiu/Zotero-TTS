(() => {
  const win=Services.wm.getMostRecentWindow('zotero:pref');
  const item=win&&win.document.querySelector('richlistitem[value="zotero-prefpane-general"]');
  if(!item)return JSON.stringify({found:false});
  item.click(); return JSON.stringify({found:true,selected:item.getAttribute('selected')});
})()
