/** Placement uses the host viewport, never an iframe mid-resize. */
export function floatingMenuPlacement(input: {
  panelTop: number; panelHeight: number; anchorTop: number; anchorBottom: number;
  menuHeight: number; viewportHeight: number;
}) {
  if (!Object.values(input).every(Number.isFinite)) throw new Error('Invalid player menu geometry');
  const margin = 10, gap = 8;
  const bottom = Math.max(margin, input.viewportHeight - margin);
  const below = Math.max(0, bottom - input.anchorBottom - gap);
  const above = Math.max(0, input.anchorTop - gap - margin);
  const side = input.menuHeight <= below ? 'below' : input.menuHeight <= above ? 'above' : below >= above ? 'below' : 'above';
  const menuHeight = Math.max(0, Math.min(input.menuHeight, side === 'below' ? below : above));
  const menuTop = Math.max(margin, Math.min(bottom - menuHeight,
    side === 'below' ? input.anchorBottom + gap : input.anchorTop - gap - menuHeight));
  const frameTop = Math.min(input.panelTop, menuTop);
  const frameHeight = Math.max(input.panelTop + input.panelHeight, menuTop + menuHeight) - frameTop;
  return { side, menuTop, menuHeight, frameTop, frameHeight, panelInset: input.panelTop - frameTop };
}
