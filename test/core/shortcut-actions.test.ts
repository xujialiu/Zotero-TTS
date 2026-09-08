import { describe, expect, it } from 'vitest';
import { SPEED_ACTIONS } from '../../src/core/read-aloud-speed';
import { VOLUME_ACTIONS } from '../../src/core/read-aloud-volume';
import {
  allowsBareArrows,
  isNavigationAction,
  isPlayerAction,
  isPositionAction,
  isVolumeAction,
  NAVIGATION,
  NAVIGATION_ACTIONS,
  PLAYER_ACTIONS,
  POSITION_ACTIONS,
  SHORTCUT_ACTIONS,
} from '../../src/core/shortcut-actions';

describe('shortcut actions', () => {
  it('lists the speed actions first, then the volume ones, then navigation, position and the player', () => {
    expect(SHORTCUT_ACTIONS).toEqual([...SPEED_ACTIONS, ...VOLUME_ACTIONS, ...NAVIGATION_ACTIONS, ...POSITION_ACTIONS, ...PLAYER_ACTIONS]);
    expect(VOLUME_ACTIONS).toEqual(['volumeDown', 'volumeUp']);
    expect(NAVIGATION_ACTIONS).toEqual(['previousSentence', 'nextSentence', 'previousParagraph', 'nextParagraph']);
    expect(POSITION_ACTIONS).toEqual(['startFromSelection', 'returnToSpoken']);
    expect(PLAYER_ACTIONS).toEqual(['toggleOptions', 'stopReading']);
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

  it('tells the volume actions apart from every other group, and keeps them off bare arrow keys', () => {
    expect(isVolumeAction('volumeUp')).toBe(true);
    expect(isVolumeAction('volumeDown')).toBe(true);
    expect(isVolumeAction('speedUp')).toBe(false);
    expect(isVolumeAction('nextSentence')).toBe(false);
    expect(isNavigationAction('volumeUp')).toBe(false);
    expect(isPositionAction('volumeDown')).toBe(false);
    expect(isPlayerAction('volumeUp')).toBe(false);
    expect(allowsBareArrows('volumeUp')).toBe(false);
    expect(allowsBareArrows('volumeDown')).toBe(false);
  });

  it('tells the player actions apart from every other group, and keeps them off bare arrow keys', () => {
    expect(isPlayerAction('toggleOptions')).toBe(true);
    expect(isPlayerAction('stopReading')).toBe(true);
    expect(isPlayerAction('returnToSpoken')).toBe(false);
    expect(isPlayerAction('nextSentence')).toBe(false);
    expect(isPlayerAction('speedUp')).toBe(false);
    expect(isPositionAction('toggleOptions')).toBe(false);
    expect(isPositionAction('stopReading')).toBe(false);
    expect(isNavigationAction('toggleOptions')).toBe(false);
    expect(allowsBareArrows('toggleOptions')).toBe(false);
    expect(allowsBareArrows('stopReading')).toBe(false);
  });
});
