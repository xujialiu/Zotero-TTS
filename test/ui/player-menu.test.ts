import { describe, expect, it } from 'vitest';
import { floatingMenuPlacement } from '../../src/ui/player-menu';

describe('floating menu placement in the host window', () => {
  it('opens below even when there is also room above', () => {
    const p = floatingMenuPlacement({ panelTop: 300, panelHeight: 192, anchorTop: 340, anchorBottom: 366, menuHeight: 120, viewportHeight: 900 });
    expect(p.side).toBe('below');
    expect(p.menuTop).toBe(374);
    expect(p.frameTop + p.panelInset).toBe(300);
  });
  it('extends the frame above a low panel without moving the panel', () => {
    const p = floatingMenuPlacement({ panelTop: 650, panelHeight: 192, anchorTop: 680, anchorBottom: 706, menuHeight: 250, viewportHeight: 900 });
    expect(p.side).toBe('above');
    expect(p.menuTop + p.menuHeight).toBe(672);
    expect(p.frameTop + p.panelInset).toBe(650);
    expect(p.frameTop + p.frameHeight).toBeGreaterThanOrEqual(842);
  });
  it.each([
    { anchorTop: 180, anchorBottom: 206, side: 'below' },
    { anchorTop: 260, anchorBottom: 286, side: 'above' },
  ])('uses the roomier side and keeps a tall menu inside a short window', ({ anchorTop, anchorBottom, side }) => {
    const p = floatingMenuPlacement({ panelTop: 150, panelHeight: 192, anchorTop, anchorBottom, menuHeight: 290, viewportHeight: 450 });
    expect(p.side).toBe(side);
    expect(p.menuHeight).toBeLessThan(290);
    expect(p.menuTop).toBeGreaterThanOrEqual(10);
    expect(p.menuTop + p.menuHeight).toBeLessThanOrEqual(440);
  });
  it('is stable after the frame expands upward and the child anchor receives its inset', () => {
    const first = floatingMenuPlacement({ panelTop: 650, panelHeight: 98, anchorTop: 666, anchorBottom: 684, menuHeight: 290, viewportHeight: 800 });
    const childAnchor = 16 + first.panelInset;
    const second = floatingMenuPlacement({ panelTop: first.frameTop + first.panelInset, panelHeight: 98, anchorTop: first.frameTop + childAnchor, anchorBottom: first.frameTop + childAnchor + 18, menuHeight: 290, viewportHeight: 800 });
    expect(second).toEqual(first);
  });
});
