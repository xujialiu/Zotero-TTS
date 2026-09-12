return (async () => {
  const wantedInstance = 'oxkx7jxW';
  const reader = (Zotero.Reader._readers ?? []).find(r => r?._instanceID === wantedInstance);
  if (!reader) return JSON.stringify({error:'target-reader-missing'});
  const win = reader._window;
  try { win?.focus?.(); } catch {}
  const doc = reader._iframeWindow?.document;
  if (!doc) return JSON.stringify({error:'iframe-missing'});
  const t0 = performance.now();
  const samples = [];
  let firstVisible = null;
  let firstExpanded = null;
  let opened = false;
  try {
    reader._internalReader.toggleReadAloudPopup(true);
    opened = true;
    const until = performance.now() + 5000;
    while (performance.now() < until) {
      const popup = doc.querySelector('.read-aloud-popup');
      const cs = popup ? doc.defaultView.getComputedStyle(popup) : null;
      const rect = popup?.getBoundingClientRect?.();
      const sample = {
        ms: Math.round((performance.now() - t0) * 10) / 10,
        exists: !!popup,
        visibility: cs?.visibility ?? null,
        display: cs?.display ?? null,
        expanded: !!popup?.classList.contains('expanded'),
        ready: !!popup?.hasAttribute('data-ztts-expanded-ready'),
        width: rect ? Math.round(rect.width) : null,
        height: rect ? Math.round(rect.height) : null,
      };
      samples.push(sample);
      const visible = !!popup && sample.visibility !== 'hidden' && sample.display !== 'none' && sample.width > 0 && sample.height > 0;
      if (visible && !firstVisible) firstVisible = sample;
      if (visible && sample.expanded && sample.ready && !firstExpanded) {
        firstExpanded = sample;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const manager = reader._internalReader?._readAloudManager;
    return JSON.stringify({
      target: { instanceID: reader._instanceID, constructor: reader.constructor?.name ?? null, itemID: reader.itemID, tabID: reader.tabID ?? null, windowType: win?.document?.documentElement?.getAttribute?.('windowtype') ?? null },
      firstVisible,
      firstExpanded,
      sampleCount: samples.length,
      firstSamples: samples.slice(0, 8),
      lastSamples: samples.slice(-3),
      managerBeforeClose: { active: !!manager?.active, paused: !!manager?.paused, popupOpen: !!reader._internalReader?.popupOpen },
    });
  } finally {
    if (opened) {
      try { reader._internalReader.toggleReadAloudPopup(false); } catch {}
    }
  }
})()
