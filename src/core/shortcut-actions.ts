import { SPEED_ACTIONS, type SpeedAction } from './read-aloud-speed';

/**
 * Everything a keyboard shortcut can do to Zotero's Read Aloud: change the
 * playback speed (read-aloud-speed.ts), skip by sentence or paragraph
 * the way the popup's skip buttons do (`ReadAloudManager.skipBack` /
 * `skipAhead`, granularity `'sentence' | 'paragraph'`), act on the
 * reading position (`reader.startReadAloudAtPosition`, the context menu's
 * "Read Aloud from Here"), or drive the player itself (its Options panel,
 * which has no method at all — ui/player-options.ts). Bindings live in the
 * `shortcuts.<action>` prefs (settings.ts).
 */

export type { SpeedAction };

export type NavigationAction = 'previousSentence' | 'nextSentence' | 'previousParagraph' | 'nextParagraph';

/** Actions on the reading position rather than within the segment stream. */
export type PositionAction = 'startFromSelection' | 'returnToSpoken';

/**
 * Actions on the player popup itself. `toggleOptions` presses its Options
 * button, the one control of the player that had no key; it is a DOM click
 * because the panel's state never leaves Zotero's React component.
 */
export type PlayerAction = 'toggleOptions';

export type ShortcutAction = SpeedAction | NavigationAction | PositionAction | PlayerAction;

export const NAVIGATION_ACTIONS: readonly NavigationAction[] = ['previousSentence', 'nextSentence', 'previousParagraph', 'nextParagraph'];

export const POSITION_ACTIONS: readonly PositionAction[] = ['startFromSelection', 'returnToSpoken'];

export const PLAYER_ACTIONS: readonly PlayerAction[] = ['toggleOptions'];

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  ...SPEED_ACTIONS,
  ...NAVIGATION_ACTIONS,
  ...POSITION_ACTIONS,
  ...PLAYER_ACTIONS,
];

/** Zotero's own granularities: a paragraph is the run of segments from one `paragraphStart` anchor to the next. */
export type SkipGranularity = 'sentence' | 'paragraph';

export const NAVIGATION: Record<NavigationAction, { direction: 'back' | 'ahead'; granularity: SkipGranularity }> = {
  previousSentence: { direction: 'back', granularity: 'sentence' },
  nextSentence: { direction: 'ahead', granularity: 'sentence' },
  previousParagraph: { direction: 'back', granularity: 'paragraph' },
  nextParagraph: { direction: 'ahead', granularity: 'paragraph' },
};

export function isNavigationAction(action: ShortcutAction): action is NavigationAction {
  return action in NAVIGATION;
}

export function isPositionAction(action: ShortcutAction): action is PositionAction {
  return (POSITION_ACTIONS as readonly string[]).includes(action);
}

export function isPlayerAction(action: ShortcutAction): action is PlayerAction {
  return (PLAYER_ACTIONS as readonly string[]).includes(action);
}

/**
 * Whether the action may sit on a bare arrow key. The arrows page and scroll
 * the reader, so only the actions that are taken exclusively while a Read
 * Aloud session is open (read-aloud-shortcuts.ts) may borrow them; a speed
 * key acts on an idle reader too and would steal paging.
 */
export function allowsBareArrows(action: ShortcutAction): boolean {
  return isNavigationAction(action);
}
