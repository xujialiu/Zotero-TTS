/**
 * The Top bar and the Bottom bar lie over the document's edge rather than
 * shrinking it (issue #135): what the follow has to count as off screen.
 */

/** A docked bar's height, the frame's own while no menu is open. */
export const BAR_HEIGHT = 34;

/** A vertical extent in the reader document, CSS px. */
export interface Band {
  top: number;
  bottom: number;
}

/** How many px of a box's top and bottom edge lie under a bar. */
export interface Covered {
  top: number;
  bottom: number;
}

/**
 * The strip a bar occupies, from its frame's box: the frame grows past the
 * bar while a menu is open, downward for the Top bar and upward for the
 * Bottom bar. Null for the Floating panel, which covers a corner and can be
 * dragged away.
 */
export function barBand(layout: string, frame: Band): Band | null {
  if (layout === 'top') return { top: frame.top, bottom: frame.top + BAR_HEIGHT };
  if (layout === 'A') return { top: frame.bottom - BAR_HEIGHT, bottom: frame.bottom };
  return null;
}

/** How much of the box's top and bottom edge the band lies over; a band over neither edge covers nothing. */
export function coveredEdges(band: Band | null, box: Band): Covered {
  if (!band || !(box.bottom > box.top)) return { top: 0, bottom: 0 };
  const top = band.top <= box.top && band.bottom > box.top ? Math.min(band.bottom, box.bottom) - box.top : 0;
  const bottom = band.bottom >= box.bottom && band.top < box.bottom ? box.bottom - Math.max(band.top, box.top) : 0;
  return { top, bottom };
}
