import { describe, expect, it } from 'vitest';
import { SPEED_ACTIONS } from '../../src/core/read-aloud-speed';
import { allowsBareArrows, isNavigationAction, NAVIGATION, NAVIGATION_ACTIONS, SHORTCUT_ACTIONS } from '../../src/core/shortcut-actions';

describe('shortcut actions', () => {
  it('lists the speed actions first, then the navigation ones', () => {
    expect(SHORTCUT_ACTIONS).toEqual([...SPEED_ACTIONS, ...NAVIGATION_ACTIONS]);
    expect(NAVIGATION_ACTIONS).toEqual(['previousSentence', 'nextSentence', 'previousParagraph', 'nextParagraph']);
  });

  it("maps each navigation action to a direction and a granularity Zotero's manager understands", () => {
    expect(NAVIGATION).toEqual({
      previousSentence: { direction: 'back', granularity: 'sentence' },
      nextSentence: { direction: 'ahead', granularity: 'sentence' },
      previousParagraph: { direction: 'back', granularity: 'paragraph' },
      nextParagraph: { direction: 'ahead', granularity: 'paragraph' },
    });
  });

  it('tells navigation actions from speed actions, and lets only the former sit on bare arrow keys', () => {
    expect(isNavigationAction('nextSentence')).toBe(true);
    expect(isNavigationAction('speedUp')).toBe(false);
    expect(allowsBareArrows('previousParagraph')).toBe(true);
    expect(allowsBareArrows('speedReset')).toBe(false);
  });
});
