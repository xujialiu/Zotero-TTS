import { t } from '../core/l10n';
import { DEFAULT_BRACKET_PAIRS, validateBracketPairs } from '../core/speech-text';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';

export function initBracketRows(
  doc: { getElementById(id: string): any },
  deps: {
    prefs: PrefsBackend;
    askDefaults(message: string): Promise<boolean>;
    watch?(name: string, onChange: () => void): () => void;
  },
): { refresh(): void; dispose(): void } {
  const box = doc.getElementById('ztts-strip-angle-brackets');
  const input = doc.getElementById('ztts-bracket-pairs');
  const enabledKey = PREF_PREFIX + 'readAloud.stripAngleBrackets';
  const pairsKey = PREF_PREFIX + 'readAloud.bracketPairs';
  const enabled = () => deps.prefs.get(enabledKey) !== false;
  const pairs = () => {
    const value = deps.prefs.get(pairsKey);
    return typeof value === 'string' ? value : DEFAULT_BRACKET_PAIRS;
  };
  let pending = false, disposed = false, revision = 0;
  function refresh() {
    if (disposed) return;
    if (box) { box.checked = enabled(); box.disabled = pending; }
    if (input) { input.value = pairs(); input.disabled = pending || enabled(); }
  }
  function onInput() {
    if (disposed || pending || enabled() || !input) return;
    deps.prefs.set(pairsKey, input.value);
  }
  async function onCommand() {
    if (disposed || pending || !box || !input) return;
    if (!box.checked) {
      deps.prefs.set(enabledKey, false);
      refresh();
      return;
    }
    const draft = String(input.value);
    const result = validateBracketPairs(draft);
    if (!result.ok) {
      pending = true;
      refresh();
      const before = revision;
      try {
        const accepted = await deps.askDefaults(result.reason === 'empty' ? t('ztts-bracket-error-empty')
          : result.reason === 'entry' ? t('ztts-bracket-error-entry', { entry: result.entry })
          : t('ztts-bracket-error-duplicate', { entry: result.entry }));
        // Do not overwrite an external restore/sync that arrived while the dialog was open.
        if (disposed || revision !== before) return;
        if (accepted) {
          deps.prefs.set(pairsKey, DEFAULT_BRACKET_PAIRS);
          deps.prefs.set(enabledKey, true);
        }
      } finally { pending = false; refresh(); }
    } else {
      deps.prefs.set(pairsKey, draft);
      deps.prefs.set(enabledKey, true);
      refresh();
    }
  }
  box?.addEventListener('command', onCommand);
  input?.addEventListener('input', onInput);
  const stops = ['readAloud.stripAngleBrackets', 'readAloud.bracketPairs'].map(key =>
    deps.watch?.('zotero-tts.' + key, () => { revision++; refresh(); }));
  refresh();
  return {
    refresh,
    dispose() {
      disposed = true;
      for (const stop of stops) stop?.();
      box?.removeEventListener('command', onCommand);
      input?.removeEventListener('input', onInput);
    },
  };
}
