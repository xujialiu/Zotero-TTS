import { allowsBareArrows, SHORTCUT_ACTIONS, type ShortcutAction } from '../core/shortcut-actions';
import {
  formatShortcut,
  parseShortcut,
  sameShortcut,
  shortcutFromEvent,
  shortcutProblem,
  type KeyEventLike,
} from '../core/shortcuts';

/**
 * What a key press means while the preferences pane is recording a new
 * shortcut. Pure: the pane turns the outcome into pref writes and labels.
 */
export type RecorderOutcome =
  | { kind: 'ignore' }
  | { kind: 'cancel' }
  | { kind: 'clear' }
  | { kind: 'reject'; reason: 'needs-modifier' }
  | { kind: 'reject'; reason: 'conflict'; conflictsWith: ShortcutAction }
  | { kind: 'set'; text: string };

const noModifiers = (e: KeyEventLike) => !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;

export function recorderOutcome(
  event: KeyEventLike,
  action: ShortcutAction,
  current: Record<ShortcutAction, string>,
): RecorderOutcome {
  if (event.key === 'Escape') return { kind: 'cancel' };
  if ((event.key === 'Backspace' || event.key === 'Delete') && noModifiers(event)) return { kind: 'clear' };
  const shortcut = shortcutFromEvent(event);
  if (!shortcut) return { kind: 'ignore' };
  const problem = shortcutProblem(shortcut, { allowBareArrows: allowsBareArrows(action) });
  if (problem) return { kind: 'reject', reason: problem };
  for (const other of SHORTCUT_ACTIONS) {
    if (other === action) continue;
    const existing = parseShortcut(current[other] ?? '');
    if (existing && sameShortcut(existing, shortcut)) return { kind: 'reject', reason: 'conflict', conflictsWith: other };
  }
  return { kind: 'set', text: formatShortcut(shortcut) };
}

/** Button label for a stored binding. */
export function shortcutLabel(text: string, metaLabel = 'Meta'): string {
  if (!text.trim()) return 'Not set';
  const parsed = parseShortcut(text);
  return parsed ? formatShortcut(parsed, metaLabel) : `${text} (invalid)`;
}
