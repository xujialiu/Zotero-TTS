import { t } from '../core/l10n';
import { PREF_PREFIX, SWITCH_IDS, type PrefsBackend, type SwitchId } from '../core/settings';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';
import { isSecretField, setSecretLocked } from './secret-rows';

/**
 * The switch of each provider section, and of Zotero's two tiers (issue
 * #111, rows of the Zotero section wired the same way, with no fields to
 * lock): one button, "Enable" or "Disable".
 * Enable is a commit point — the provider's connection check (the very one
 * Test connection runs, prefs-pane.ts checkProvider) has to pass before
 * the pref goes on, and while it is on the section's fields are locked. So
 * an enabled provider always carries settings that were checked as they
 * are, and the voice browser lists again on the switch alone: no watching
 * of a dozen prefs, no debounce. The outcome is written where Test
 * connection writes its own; a failed check leaves the provider off, with
 * the message.
 *
 * A switch is checked against all current reading sessions (#121). An
 * unused provider may change; the provider of a playing or paused voice
 * stays available. Enabling checks again after its asynchronous probe.
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
  check(id: SwitchId): Promise<CheckOutcome>;
  /** A provider went on or off, or one that is on was checked again: the voice browser lists again. */
  onVoicesChanged(): void;
  /**
   * A provider's switch was just written, with its new value. The system
   * provider uses it to hide Zotero's own copies of the very voices it has
   * begun publishing, and to keep a choice that named one of them
   * (ui/prefs-pane.ts).
   */
  onSwitched?(id: SwitchId, on: boolean): void;
  /** The section's fields were just unlocked: the preset rows gray out theirs again (ui/server-preset-rows.ts). Omitted where there are none. */
  onUnlocked?(id: SwitchId): void;
}

/** The section's elements: the groupbox holding the fields, the switch, Test connection, and the line both write to. */
export function providerRowIds(id: SwitchId): { section: string; toggle: string; test: string; result: string } {
  return { section: `ztts-provider-${id}`, toggle: `ztts-enable-${id}`, test: `ztts-test-${id}`, result: `ztts-test-result-${id}` };
}

/** The section's fields: every input and the Server dropdown — the buttons are not among them. */
const FIELDS_SELECTOR = 'input, menulist, checkbox';

export function initProviderRows(
  doc: { getElementById(id: string): any },
  deps: ProviderRowsDeps,
): { refresh(): void; verifyEnabled(): Promise<string> } {
  const pref = (id: SwitchId) => `${PREF_PREFIX}${id}.enabled`;
  const enabled = (id: SwitchId) => deps.prefs.get(pref(id)) === true;
  /** The providers whose check is running: their buttons are held, and a click meanwhile does nothing. */
  const busy = new Set<SwitchId>();

  const elements = (id: SwitchId) => {
    const ids = providerRowIds(id);
    return {
      section: doc.getElementById(ids.section),
      toggle: doc.getElementById(ids.toggle),
      test: doc.getElementById(ids.test),
      result: doc.getElementById(ids.result),
    };
  };
  /** The line beside the buttons, written as text: a description's `value` never wraps (issue #31). */
  const say = (id: SwitchId, text: string) => {
    const line = elements(id).result;
    if (line) line.textContent = text;
  };
  const fields = (id: SwitchId): any[] => Array.from(elements(id).section?.querySelectorAll?.(FIELDS_SELECTOR) ?? []);

  /** The switch and the fields as the pref says: on is "Disable" with the fields locked, off is "Enable" with them open for editing. */
  function paint(id: SwitchId): void {
    const { toggle, test } = elements(id);
    const on = enabled(id);
    toggle?.setAttribute('label', on ? t('ztts-switch-disable') : t('ztts-switch-enable'));
    if (toggle) toggle.disabled = false;
    if (test) test.disabled = false;
    for (const field of fields(id)) {
      field.disabled = on;
      // A secret the user uncovered to edit it would stay in the clear behind
      // the lock, with its eye greyed out and nothing able to cover it again
      // (issue #19). So locking covers it: while a provider is on, its
      // secrets cannot be read at all.
      if (isSecretField(field)) setSecretLocked(field, on);
    }
    if (!on) deps.onUnlocked?.(id);
  }

  /** Both buttons held while a check runs. */
  function hold(id: SwitchId): void {
    const { toggle, test } = elements(id);
    busy.add(id);
    if (toggle) toggle.disabled = true;
    if (test) test.disabled = true;
  }

  /** The check as Test connection runs it; one that throws is a failed one, never an unhandled rejection. */
  async function run(id: SwitchId): Promise<CheckOutcome> {
    try {
      return await deps.check(id);
    } catch (e) {
      return { ok: false, message: t('ztts-connection-failed', { detail: e instanceof Error ? e.message : String(e) }) };
    }
  }

  async function onToggle(id: SwitchId): Promise<void> {
    if (busy.has(id)) return;
    if (enabled(id)) {
      if (await refuseWhileReading(deps, { [`${id}.enabled`]: false })) return;
      deps.prefs.set(pref(id), false);
      deps.onSwitched?.(id, false);
      paint(id);
      // The last check's "Connected…" beside an Enable button would read as if it still held
      say(id, '');
      deps.onVoicesChanged();
      return;
    }
    if (await refuseWhileReading(deps, { [`${id}.enabled`]: true })) return;
    hold(id);
    elements(id).toggle?.setAttribute('label', t('ztts-switch-checking'));
    say(id, t('ztts-switch-checking'));
    const outcome = await run(id);
    // Asked again, because the write is what the guard is about and the
    // check has had a quarter of a minute in which a player could open.
    // Refused, the outcome is dropped with it: the dialog is what the user
    // is told, and "Connected…" beside a switch that stayed Enable would
    // read as if it held. An allowed proposal keeps it and the write follows
    const refused = outcome.ok && (await refuseWhileReading(deps, { [`${id}.enabled`]: true }));
    say(id, refused ? '' : outcome.message);
    if (outcome.ok && !refused) {
      deps.prefs.set(pref(id), true);
      deps.onSwitched?.(id, true);
    }
    busy.delete(id);
    paint(id);
    if (outcome.ok && !refused) deps.onVoicesChanged();
  }

  async function onTest(id: SwitchId): Promise<void> {
    if (busy.has(id)) return;
    hold(id);
    say(id, t('ztts-switch-testing'));
    const outcome = await run(id);
    say(id, outcome.message);
    busy.delete(id);
    paint(id);
    if (outcome.ok && enabled(id)) deps.onVoicesChanged();
  }

  for (const id of SWITCH_IDS) {
    const { toggle, test } = elements(id);
    toggle?.addEventListener('command', () => onToggle(id));
    test?.addEventListener('command', () => onTest(id));
    paint(id);
  }

  /** After a settings restore: every switch and lock as the prefs say now; a section mid-check is left to its check. */
  function refresh(): void {
    for (const id of SWITCH_IDS) if (!busy.has(id)) paint(id);
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
    const inUse = (id: SwitchId) => !!deps.affectedTabs?.({ [`${id}.enabled`]: false }).length;
    const wanted = SWITCH_IDS.filter((id) => enabled(id) && !busy.has(id) && !inUse(id));
    if (!wanted.length) return '';
    for (const id of wanted) {
      hold(id);
      elements(id).toggle?.setAttribute('label', t('ztts-switch-checking'));
      say(id, t('ztts-switch-checking'));
    }
    const turnedOff: SwitchId[] = [];
    await Promise.all(
      wanted.map(async (id) => {
        const outcome = await run(id);
        if (!outcome.ok && !inUse(id)) {
          deps.prefs.set(pref(id), false);
          deps.onSwitched?.(id, false);
          turnedOff.push(id);
        }
        say(id, outcome.message);
        busy.delete(id);
        paint(id);
      }),
    );
    if (!turnedOff.length) return t('ztts-providers-checked', { count: wanted.length });
    // The switches moved, so the voice browser lists again — once, after all of them
    deps.onVoicesChanged();
    const named = SWITCH_IDS.filter((id) => turnedOff.includes(id)).join(', ');
    return t('ztts-providers-turned-off', { named, count: turnedOff.length });
  }

  return { refresh, verifyEnabled };
}
