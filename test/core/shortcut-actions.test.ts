import { describe, expect, it } from 'vitest';
import { SPEED_ACTIONS } from '../../src/core/read-aloud-speed';
import {
  allowsBareArrows,
  isNavigationAction,
  isPositionAction,
  NAVIGATION,
  NAVIGATION_ACTIONS,
  POSITION_ACTIONS,
  SHORTCUT_ACTIONS,
} from '../../src/core/shortcut-actions';

describe('shortcut actions', () => {
  it('lists the speed actions first, then the navigation ones, then the position ones', () => {
    expect(SHORTCUT_ACTIONS).toEqual([...SPEED_ACTIONS, ...NAVIGATION_ACTIONS, ...POSITION_ACTIONS]);
    expect(NAVIGATION_ACTIONS).toEqual(['previousSentence', 'nextSentence', 'previousParagraph', 'nextParagraph']);
    expect(POSITION_ACTIONS).toEqual(['startFromSelection', 'returnToSpoken']);
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

  it('tells position actions apart, and keeps them off bare arrow keys', () => {
    expect(isPositionAction('startFromSelection')).toBe(true);
    expect(isPositionAction('returnToSpoken')).toBe(true);
    expect(isPositionAction('speedUp')).toBe(false);
    expect(isPositionAction('nextSentence')).toBe(false);
    expect(isNavigationAction('startFromSelection')).toBe(false);
    expect(allowsBareArrows('startFromSelection')).toBe(false);
    expect(allowsBareArrows('returnToSpoken')).toBe(false);
  });
});
