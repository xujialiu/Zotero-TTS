import { describe, expect, it, vi } from 'vitest';
import {
  EXPANDED_POPUP_SELECTOR,
  findOptionsButton,
  hasPlayer,
  isOptionsPanelOpen,
  OPTIONS_BUTTON_SELECTOR,
  PLAYER_POPUP_SELECTOR,
} from '../../src/ui/player-options';

/** A document that answers only the selectors it was given. */
function fakeDoc(nodes: Record<string, unknown>) {
  return { querySelector: vi.fn((selector: string) => nodes[selector] ?? null) };
}

describe('findOptionsButton', () => {
  it('returns the first button of the player\'s button row', () => {
    const button = { click: vi.fn() };
    const doc = fakeDoc({ [OPTIONS_BUTTON_SELECTOR]: button });
    expect(findOptionsButton(doc)).toBe(button);
    expect(doc.querySelector).toHaveBeenCalledWith(OPTIONS_BUTTON_SELECTOR);
  });

  it('returns null when no player is on screen', () => {
    expect(findOptionsButton(fakeDoc({}))).toBeNull();
  });

  it('returns null for a document that is missing or throws', () => {
    expect(findOptionsButton(null)).toBeNull();
    expect(findOptionsButton(undefined)).toBeNull();
    expect(
      findOptionsButton({
        querySelector: () => {
          throw new Error('dead document');
        },
      }),
    ).toBeNull();
  });

  // A node without click() is not the button we meant; clicking undefined would throw
  it('returns null when the match cannot be clicked', () => {
    expect(findOptionsButton(fakeDoc({ [OPTIONS_BUTTON_SELECTOR]: { id: 'not-a-button' } }))).toBeNull();
  });
});

describe('the panel state', () => {
  it('reads as open exactly while the popup carries the expanded class', () => {
    expect(isOptionsPanelOpen(fakeDoc({ [EXPANDED_POPUP_SELECTOR]: {} }))).toBe(true);
    expect(isOptionsPanelOpen(fakeDoc({ [PLAYER_POPUP_SELECTOR]: {} }))).toBe(false);
    expect(isOptionsPanelOpen(null)).toBe(false);
  });

  it('reports whether the player is on screen at all', () => {
    expect(hasPlayer(fakeDoc({ [PLAYER_POPUP_SELECTOR]: {} }))).toBe(true);
    expect(hasPlayer(fakeDoc({}))).toBe(false);
    expect(hasPlayer(null)).toBe(false);
  });
});

// The selectors are the whole implementation: the panel's open/closed state
// is React state local to Zotero's popup, so the button is the only handle.
describe('the selectors', () => {
  it('name the popup, its expanded form and the options button', () => {
    expect(PLAYER_POPUP_SELECTOR).toBe('.read-aloud-popup');
    expect(EXPANDED_POPUP_SELECTOR).toBe('.read-aloud-popup.expanded');
    expect(OPTIONS_BUTTON_SELECTOR).toBe('.read-aloud-popup .row.buttons .group:first-child > button.toolbar-button');
  });
});
