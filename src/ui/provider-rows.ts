import { t } from '../core/l10n';
import type { ProviderId } from '../core/providers/types';
import { PREF_PREFIX, PROVIDER_IDS, type PrefsBackend } from '../core/settings';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';

/**
 * The switch of each provider section: one button, "Enable" or "Disable".
 * Enable is a commit point — the provider's connection check (the very one
 * Test connection runs, prefs-pane.ts checkProvider) has to pass before
 * the pref goes on, and while it is on the section's fields are locked. So
 * an enabled provider always carries settings that were checked as they
 * are, and the voice browser lists again on the switch alone: no watching
 * of a dozen prefs, no debounce. The outcome is written where Test
 * connection writes its own; a failed check leaves the provider off, with
 * the message.
 *
 * **Both** directions are refused while a tab is reading (ui/reading-guard.ts):
 * an open popup lists its voices until Read Aloud reopens there, so enabling
 * would leave the new voices out of that tab and disabling would leave the
 * gone ones in it — either way two tabs listing different things, which is
 * what issue #11 is about. Enabling asks twice, before the connection check
 * and again before the write: the check may take a quarter of a minute, and
 * it is the write that has to be safe.
 *
 * Test connection stays: while a provider is off it probes without
 * committing — and fills the Model suggestions, which has to happen while
 * the fields are editable — while on it is the retry after a server came
 * back, listing the voices again when it passes.
 */

export interface CheckOutcome {
  ok: boolean;
  message: string;
}

export interface ProviderRowsDeps extends ReadingGuardDeps {
  prefs: PrefsBackend;
  /** The provider's connection check as Test connection runs it, on the prefs as they are; bounded, never hanging. */
  check(id: ProviderId): Promise<CheckOutcome>;
  /** A provider went on or off, or one that is on was checked again: the voice browser lists again. */
  onVoicesChanged(): void;
  /**
   * A provider's switch was just written, with its new value. The system
   * provider uses it to hide Zotero's own copies of the very voices it has
   * begun publishing, and to keep a choice that named one of them
   * (ui/prefs-pane.ts).
   */
  onSwitched?(id: ProviderId, on: boolean): void;
  /** The section's fields were just unlocked: the preset rows gray out theirs again (ui/server-preset-rows.ts). Omitted where there are none. */
  onUnlocked?(id: ProviderId): void;
}

/** The section's elements: the groupbox holding the fields, the switch, Test connection, and the line both write to. */
export function providerRowIds(id: ProviderId): { section: string; toggle: string; test: string; result: string } {
  return { section: `ztts-provider-${id}`, toggle: `ztts-enable-${id}`, test: `ztts-test-${id}`, result: `ztts-test-result-${id}` };
}

/** The section's fields: every input and the Server dropdown — the buttons are not among them. */
const FIELDS_SELECTOR = 'input, menulist';

export function initProviderRows(
  doc: { getElementById(id: string): any },
  deps: ProviderRowsDeps,
): { refresh(): void; verifyEnabled(): Promise<string> } {
  const pref = (id: ProviderId) => `${PREF_PREFIX}${id}.enabled`;
  const enabled = (id: ProviderId) => deps.prefs.get(pref(id)) === true;
  /** The providers whose check is running: their buttons are held, and a click meanwhile does nothing. */
  const busy = new Set<ProviderId>();

  const elements = (id: ProviderId) => {
    const ids = providerRowIds(id);
    return {
      section: doc.getElementById(ids.section),
      toggle: doc.getElementById(ids.toggle),
      test: doc.getElementById(ids.test),
      result: doc.getElementById(ids.result),
    };
  };
  /** The line beside the buttons, written as text: a description's `value` never wraps (issue #31). */
  const say = (id: ProviderId, text: string) => {
    const line = elements(id).result;
    if (line) line.textContent = text;
  };
  const fields = (id: ProviderId): any[] => Array.from(elements(id).section?.querySelectorAll?.(FIELDS_SELECTOR) ?? []);

  /** The switch and the fields as the pref says: on is "Disable" with the fields locked, off is "Enable" with them open for editing. */
  function paint(id: ProviderId): void {
    const { toggle, test } = elements(id);
    const on = enabled(id);
    toggle?.setAttribute('label', on ? t('ztts-switch-disable') : t('ztts-switch-enable'));
    if (toggle) toggle.disabled = false;
    if (test) test.disabled = false;
    for (const field of fields(id)) {
      field.disabled = on;
      // A masked field the user revealed with its own reveal button stays
      // revealed once it is disabled, and that button is inert on a disabled
      // input — nothing could put it back (issue #19). So locking the section
      // hides it: while a provider is on, its secrets cannot be read at all.
      if (on && field.type === 'password' && 'revealPassword' in field) field.revealPassword = false;
    }
    if (!on) deps.onUnlocked?.(id);
  }

  /** Both buttons held while a check runs. */
  function hold(id: ProviderId): void {
    const { toggle, test } = elements(id);
    busy.add(id);
    if (toggle) toggle.disabled = true;
    if (test) test.disabled = true;
  }

  /** The check as Test connection runs it; one that throws is a failed one, never an unhandled rejection. */
  async function run(id: ProviderId): Promise<CheckOutcome> {
    try {
      return await deps.check(id);
    } catch (e) {
      return { ok: false, message: `Connection failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async function onToggle(id: ProviderId): Promise<void> {
    if (busy.has(id)) return;
    if (enabled(id)) {
      if (refuseWhileReading(deps)) return;
      deps.prefs.set(pref(id), false);
      deps.onSwitched?.(id, false);
      paint(id);
      // The last check's "Connected…" beside an Enable button would read as if it still held
      say(id, '');
      deps.onVoicesChanged();
      return;
    }
    if (refuseWhileReading(deps)) return;
    hold(id);
    elements(id).toggle?.setAttribute('label', t('ztts-switch-checking'));
    say(id, t('ztts-switch-checking'));
    const outcome = await run(id);
    // Asked again, because the write is what the guard is about and the
    // check has had a quarter of a minute in which a player could open. The
    // outcome is dropped with it: the dialog is what the user is told, and
    // "Connected…" beside a switch that stayed Enable would read as if it held
    const refused = outcome.ok && refuseWhileReading(deps);
    say(id, refused ? '' : outcome.message);
    if (outcome.ok && !refused) {
      deps.prefs.set(pref(id), true);
      deps.onSwitched?.(id, true);
    }
    busy.delete(id);
    paint(id);
    if (outcome.ok && !refused) deps.onVoicesChanged();
  }

  async function onTest(id: ProviderId): Promise<void> {
    if (busy.has(id)) return;
    hold(id);
    say(id, t('ztts-switch-testing'));
    const outcome = await run(id);
    say(id, outcome.message);
    busy.delete(id);
    paint(id);
    if (outcome.ok && enabled(id)) deps.onVoicesChanged();
  }

  for (const id of PROVIDER_IDS) {
    const { toggle, test } = elements(id);
    toggle?.addEventListener('command', () => onToggle(id));
    test?.addEventListener('command', () => onTest(id));
    paint(id);
  }

  /** After a settings restore: every switch and lock as the prefs say now; a section mid-check is left to its check. */
  function refresh(): void {
    for (const id of PROVIDER_IDS) if (!busy.has(id)) paint(id);
  }

  /**
   * The commit point a restore skipped (issue #21). A backup writes the four
   * switches straight to the prefs (core/settings-backup.ts applyBackup), so
   * a restore can leave a provider on carrying settings that have never
   * worked here — a local address from another machine, a key rotated since,
   * an expired gateway token. Every provider the restored prefs say is on is
   * checked as Enable would have checked it, and one that fails goes back
   * off with its message where Enable would have put it.
   *
   * All at once rather than one after another: each check is bounded by its
   * own timeout, and four in a row would be a minute of a pane that looks
   * frozen. Returns one sentence for the restore's message line.
   */
  async function verifyEnabled(): Promise<string> {
    const wanted = PROVIDER_IDS.filter((id) => enabled(id) && !busy.has(id));
    if (!wanted.length) return '';
    for (const id of wanted) {
      hold(id);
      elements(id).toggle?.setAttribute('label', t('ztts-switch-checking'));
      say(id, t('ztts-switch-checking'));
    }
    const turnedOff: ProviderId[] = [];
    await Promise.all(
      wanted.map(async (id) => {
        const outcome = await run(id);
        if (!outcome.ok) {
          deps.prefs.set(pref(id), false);
          deps.onSwitched?.(id, false);
          turnedOff.push(id);
        }
        say(id, outcome.message);
        busy.delete(id);
        paint(id);
      }),
    );
    if (!turnedOff.length) return `Checked ${wanted.length} provider${wanted.length === 1 ? '' : 's'}: all working.`;
    // The switches moved, so the voice browser lists again — once, after all of them
    deps.onVoicesChanged();
    const named = PROVIDER_IDS.filter((id) => turnedOff.includes(id)).join(', ');
    return `Turned off ${named}: the restored settings do not work here — see the message beside ${turnedOff.length === 1 ? 'it' : 'each'}.`;
  }

  return { refresh, verifyEnabled };
}
