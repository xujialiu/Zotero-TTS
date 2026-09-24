import { describe, expect, it, vi } from 'vitest';
import { findOptionsButton, hasPlayer, isOptionsPanelOpen } from '../../src/ui/player-options';

/** A document that answers only the selectors it was given. */
function fakeDoc(nodes: Record<string, unknown>) {
  return { querySelector: vi.fn((selector: string) => nodes[selector] ?? null) };
}

/** Zotero's own player, still in the document while a reading is open, and never shown (#134). */
const zoteroPlayer = () => ({
  '.read-aloud-popup': {},
  '.read-aloud-popup.expanded': {},
  '.read-aloud-popup .row.buttons .group:first-child > button.toolbar-button': { click: vi.fn() },
});

function floatingPanel(layout = 'B') {
  let expanded = false;
  const button = { click: vi.fn(() => { expanded = !expanded; }), getAttribute: () => String(expanded) };
  const frame = { hidden: false, getAttribute: () => layout, contentDocument: fakeDoc({ '.options-toggle': button }) };
  return { button, frame };
}

describe('the Options key, on the floating panel', () => {
  it('finds the visible floating panel\'s Options button and reads its expanded state', () => {
    const { button, frame } = floatingPanel();
    const doc = fakeDoc({ '#ztts-player-frame': frame, ...zoteroPlayer() });
    expect(findOptionsButton(doc)).toBe(button);
    expect(isOptionsPanelOpen(doc)).toBe(false);
    findOptionsButton(doc)?.click();
    expect(isOptionsPanelOpen(doc)).toBe(true);
    expect(hasPlayer(doc)).toBe(true);
  });

  it('has nothing to press in a bar layout', () => {
    const { frame } = floatingPanel('top');
    const doc = fakeDoc({ '#ztts-player-frame': frame });
    expect(findOptionsButton(doc)).toBeNull();
    expect(isOptionsPanelOpen(doc)).toBe(false);
    expect(hasPlayer(doc)).toBe(true);
  });

  it("never reaches Zotero's own player, hidden in the document while the Player is closed: the key falls through", () => {
    const { frame } = floatingPanel();
    frame.hidden = true;
    const doc = fakeDoc({ '#ztts-player-frame': frame, ...zoteroPlayer() });
    expect(findOptionsButton(doc)).toBeNull();
    expect(isOptionsPanelOpen(doc)).toBe(false);
    expect(hasPlayer(doc)).toBe(false);
    expect(hasPlayer(fakeDoc(zoteroPlayer()))).toBe(false);
  });

  it('answers null and false for a document that is missing or throws', () => {
    const throwing = { querySelector: () => { throw new Error('dead document'); } };
    for (const doc of [null, undefined, throwing]) {
      expect(findOptionsButton(doc)).toBeNull();
      expect(isOptionsPanelOpen(doc)).toBe(false);
      expect(hasPlayer(doc)).toBe(false);
    }
  });

  // A node without click() is not the button we meant; clicking undefined would throw
  it('returns null when the match cannot be clicked', () => {
    const frame = { hidden: false, getAttribute: () => 'B', contentDocument: fakeDoc({ '.options-toggle': { id: 'not-a-button' } }) };
    expect(findOptionsButton(fakeDoc({ '#ztts-player-frame': frame }))).toBeNull();
  });
});
