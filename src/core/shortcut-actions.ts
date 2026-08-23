import { SPEED_ACTIONS, type SpeedAction } from './read-aloud-speed';

/**
 * Everything a keyboard shortcut can do to Zotero's Read Aloud: change the
 * playback speed (read-aloud-speed.ts), or skip by sentence or paragraph
 * the way the popup's skip buttons do (`ReadAloudManager.skipBack` /
 * `skipAhead`, granularity `'sentence' | 'paragraph'`). Bindings live in
 * the `shortcuts.<action>` prefs (settings.ts).
 */

export type { SpeedAction };

export type NavigationAction = 'previousSentence' | 'nextSentence' | 'previousParagraph' | 'nextParagraph';

export type ShortcutAction = SpeedAction | NavigationAction;

export const NAVIGATION_ACTIONS: readonly NavigationAction[] = ['previousSentence', 'nextSentence', 'previousParagraph', 'nextParagraph'];

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [...SPEED_ACTIONS, ...NAVIGATION_ACTIONS];

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

/**
 * Whether the action may sit on a bare arrow key. The arrows page and scroll
 * the reader, so only the actions that are taken exclusively while a Read
 * Aloud session is open (read-aloud-shortcuts.ts) may borrow them; a speed
 * key acts on an idle reader too and would steal paging.
 */
export function allowsBareArrows(action: ShortcutAction): boolean {
  return isNavigationAction(action);
}
