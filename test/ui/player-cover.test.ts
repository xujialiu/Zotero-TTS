import { describe, expect, it } from 'vitest';
import { BAR_HEIGHT, barBand, coveredEdges } from '../../src/ui/player-cover';

/** The reader document measured on 2026-09-23 (issue #137): a 41 px toolbar, the document area down to 912. */
const VIEW = { top: 41, bottom: 912 };

describe('barBand', () => {
  it("is the bar's own strip, not the frame that grows while a menu is open", () => {
    expect(BAR_HEIGHT).toBe(34);
    expect(barBand('top', { top: 41, bottom: 75 })).toEqual({ top: 41, bottom: 75 });
    expect(barBand('top', { top: 41, bottom: 501 })).toEqual({ top: 41, bottom: 75 });
    expect(barBand('A', { top: 878, bottom: 912 })).toEqual({ top: 878, bottom: 912 });
    expect(barBand('A', { top: 452, bottom: 912 })).toEqual({ top: 878, bottom: 912 });
  });

  it('is nothing for the Floating panel', () => {
    expect(barBand('B', { top: 51, bottom: 253 })).toBeNull();
  });
});

describe('coveredEdges', () => {
  it("covers the top of a view under the Top bar and the bottom of one over the Bottom bar", () => {
    expect(coveredEdges({ top: 41, bottom: 75 }, VIEW)).toEqual({ top: 34, bottom: 0 });
    expect(coveredEdges({ top: 878, bottom: 912 }, VIEW)).toEqual({ top: 0, bottom: 34 });
  });

  it('covers only what the band and the box share', () => {
    expect(coveredEdges({ top: 41, bottom: 75 }, { top: 60, bottom: 912 })).toEqual({ top: 15, bottom: 0 });
    expect(coveredEdges({ top: 878, bottom: 912 }, { top: 41, bottom: 900 })).toEqual({ top: 0, bottom: 22 });
  });

  it('covers nothing of a box the band does not reach, such as the lower view of a stacked split', () => {
    expect(coveredEdges({ top: 41, bottom: 75 }, { top: 480, bottom: 912 })).toEqual({ top: 0, bottom: 0 });
    expect(coveredEdges({ top: 878, bottom: 912 }, { top: 41, bottom: 476 })).toEqual({ top: 0, bottom: 0 });
  });

  it('covers nothing without a band or of an empty box', () => {
    expect(coveredEdges(null, VIEW)).toEqual({ top: 0, bottom: 0 });
    expect(coveredEdges({ top: 41, bottom: 75 }, { top: 41, bottom: 41 })).toEqual({ top: 0, bottom: 0 });
  });
});
