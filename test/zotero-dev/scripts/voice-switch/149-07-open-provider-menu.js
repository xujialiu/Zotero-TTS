(async () => {
  const session = Zotero.__ztts149;
  const fixture = session?.fixtures?.find(row => row.kind === 'pdf');
  const list = Zotero.Reader?._readers || [];
  let reader = null;
  for (let i = 0; i < list.length; i++) { try { if (!Components.utils.isDeadWrapper?.(list[i]) && list[i]?.itemID === fixture?.itemID) { reader = list[i]; break; } } catch (_) {} }
  const frame = reader?._iframeWindow?.document?.getElementById('ztts-player-frame');
  const doc = frame?.contentDocument;
  if (!doc) throw new Error('player frame is missing');
  const picker = doc.querySelector('button.picker[aria-label^="Provider:"]');
  if (!picker) throw new Error('provider picker is missing');
  picker.click();
  await new Promise(resolve => setTimeout(resolve, 500));
  const rows = [];
  const candidates = doc.querySelectorAll('button, [role="menuitem"], [role="option"], .menu-item, .picker-option, .option');
  for (let i = 0; i < candidates.length; i++) {
    const e = candidates[i];
    const text = (e.textContent || '').trim().replace(/\s+/g, ' ');
    if (!text && !e.getAttribute('aria-label')) continue;
    rows.push({ i, tag: e.tagName, cls: e.className || null, text: text.slice(0, 100), aria: e.getAttribute('aria-label'), role: e.getAttribute('role'), hidden: !!e.hidden, selected: !!e.getAttribute('aria-selected') && e.getAttribute('aria-selected') !== 'false' });
  }
  return JSON.stringify({ status: 'PASS', picker: { text: (picker.textContent || '').trim(), aria: picker.getAttribute('aria-label') }, rows: rows.slice(-80) }, null, 1);
})();
