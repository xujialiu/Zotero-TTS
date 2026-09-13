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
