return (async () => {
  const w = Services.wm.getMostRecentWindow('navigator:browser'), target = Zotero.ZoteroTTSRun.state?.baseline?.host || { windowState: 1 };
  const snap = () => ({ windowState: w?.windowState ?? null, outerWidth: w?.outerWidth ?? null, outerHeight: w?.outerHeight ?? null,
    innerWidth: w?.innerWidth ?? null, innerHeight: w?.innerHeight ?? null, screenX: w?.screenX ?? null, screenY: w?.screenY ?? null });
  if (!w) throw new Error('navigator window is missing');
  const before = snap();
  if (target.windowState === 1) { if (before.windowState !== 1) w.maximize?.(); for (let i = 0; i < 100 && w.windowState !== 1; i++) await new Promise(resolve => setTimeout(resolve, 50)); }
  else { w.resizeTo?.(target.outerWidth, target.outerHeight); w.moveTo?.(target.screenX, target.screenY); await new Promise(resolve => setTimeout(resolve, 700)); }
  const after = snap();
  if (after.windowState !== target.windowState) throw new Error('host did not restore baseline window state: ' + JSON.stringify({ target, before, after }));
  return JSON.stringify({ target, before, after, restoredState: true, positionEvidence: target.screenX == null || target.screenY == null ? 'original screen position was not captured' : 'baseline position restored' }, null, 1);
})()
