import { allowsBareArrows, SHORTCUT_ACTIONS, type ShortcutAction } from '../core/shortcut-actions';
import { DEFAULTS, loadSettings, PREF_PREFIX, type PrefsBackend } from '../core/settings';
import type { KeyEventLike } from '../core/shortcuts';
import { recorderOutcome, shortcutLabel } from './shortcut-recorder';

interface ElementLike {
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, listener: (event: any) => void): void;
  classList: { toggle(name: string, force?: boolean): boolean };
}

/** The part of Document the rows need; tests pass a fake. */
export interface RowsDocument {
  getElementById(id: string): ElementLike | null;
  addEventListener(type: 'keydown', listener: (event: any) => void, capture: boolean): void;
  removeEventListener(type: 'keydown', listener: (event: any) => void, capture: boolean): void;
}

type RecorderEvent = KeyEventLike & { preventDefault(): void; stopPropagation(): void };

const ACTION_NAMES: Record<ShortcutAction, string> = {
  speedReset: 'Reset speed',
  speedDown: 'Slower',
  speedUp: 'Faster',
  previousSentence: 'Previous sentence',
  nextSentence: 'Next sentence',
  previousParagraph: 'Previous paragraph',
  nextParagraph: 'Next paragraph',
  startFromSelection: 'Read from selection',
  returnToSpoken: 'Go to reading position',
};

/**
 * Wire the "Keyboard shortcuts" rows of the preferences pane. Each row has a
 * button showing the binding; clicking it records the next key combination
 * pressed anywhere in the pane (Esc cancels, Backspace clears). Bindings
 * are written straight to prefs, which the reader re-reads on every key.
 */
export function initShortcutRows(doc: RowsDocument, prefs: PrefsBackend, metaLabel: string): { refresh(): void } {
  const prefKey = (action: ShortcutAction) => `${PREF_PREFIX}shortcuts.${action}`;
  const button = (action: ShortcutAction) => doc.getElementById(`ztts-key-${action}`);
  let recording: { action: ShortcutAction; handler: (event: RecorderEvent) => void } | null = null;

  const setMessage = (text: string) => doc.getElementById('ztts-key-message')?.setAttribute('value', text);

  const refresh = () => {
    const bindings = loadSettings(prefs).shortcuts;
    for (const action of SHORTCUT_ACTIONS) {
      const el = button(action);
      if (!el) continue;
      const active = recording?.action === action;
      el.setAttribute('label', active ? 'Press the new keys… (Esc cancels)' : shortcutLabel(bindings[action], metaLabel));
      el.classList.toggle('ztts-recording', active);
    }
  };

  const stop = () => {
    if (recording) doc.removeEventListener('keydown', recording.handler, true);
    recording = null;
    refresh();
  };

  const start = (action: ShortcutAction) => {
    stop();
    setMessage('');
    const handler = (event: RecorderEvent) => {
      const outcome = recorderOutcome(event, action, loadSettings(prefs).shortcuts);
      if (outcome.kind === 'ignore') return;
      event.preventDefault();
      event.stopPropagation();
      if (outcome.kind === 'set') {
        prefs.set(prefKey(action), outcome.text);
      } else if (outcome.kind === 'clear') {
        prefs.set(prefKey(action), '');
      } else if (outcome.kind === 'reject') {
        setMessage(
          outcome.reason === 'conflict'
            ? `Already used by "${ACTION_NAMES[outcome.conflictsWith]}".`
            : allowsBareArrows(action)
              ? 'Add a modifier (Ctrl, Alt, Shift or Cmd) or use an arrow key: a bare key would type instead.'
              : 'Add a modifier (Ctrl, Alt, Shift or Cmd): a bare key would type instead.',
        );
      }
      stop();
    };
    recording = { action, handler };
    doc.addEventListener('keydown', handler, true);
    refresh();
  };

  for (const action of SHORTCUT_ACTIONS) {
    button(action)?.addEventListener('command', () => (recording?.action === action ? stop() : start(action)));
    doc.getElementById(`ztts-key-clear-${action}`)?.addEventListener('command', () => {
      stop();
      prefs.set(prefKey(action), '');
      setMessage('');
      refresh();
    });
  }
  doc.getElementById('ztts-key-defaults')?.addEventListener('command', () => {
    stop();
    for (const action of SHORTCUT_ACTIONS) prefs.set(prefKey(action), DEFAULTS.shortcuts[action]);
    setMessage('');
    refresh();
  });
  refresh();

  return { refresh };
}
