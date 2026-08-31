/**
 * The plugin's startup as a list of named steps, each on its own: a step
 * that throws or rejects is recorded and reported, and the next one runs
 * regardless, so one broken step costs exactly what it installs and never
 * the rest. Issue #25: the settings pane's registration threw once —
 * against a stale pane left behind by a plugin scope Zotero had not shut
 * down — and, being the one call outside a guard, took the voices, the
 * shortcuts and the bookmarks down with it, while Tools → Plugins showed
 * the plugin enabled. The report is what `diagnostics.startup()` shows:
 * the only way to tell from outside whether an instance actually started,
 * since `Zotero.ZoteroTTS` exists as soon as the bundle is evaluated.
 */
export type StartupStep = readonly [name: string, run: () => void | Promise<void>];

export type StepOutcome = { name: string; ok: true } | { name: string; ok: false; error: string };

export interface StartupReport {
  steps: StepOutcome[];
  /** The names of the steps that failed, in order; empty when everything is installed. */
  failed: string[];
}

/** Runs the steps in order, awaiting each; `report` hears every failure and may not stop the run either. */
export async function runStartupSteps(steps: readonly StartupStep[], report: (name: string, error: unknown) => void): Promise<StartupReport> {
  const outcomes: StepOutcome[] = [];
  for (const [name, run] of steps) {
    try {
      await run();
      outcomes.push({ name, ok: true });
    } catch (e) {
      outcomes.push({ name, ok: false, error: String(e) });
      try {
        report(name, e);
      } catch {
        // a reporter that fails is not a reason to skip the next step
      }
    }
  }
  return { steps: outcomes, failed: outcomes.filter((s) => !s.ok).map((s) => s.name) };
}
