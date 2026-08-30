import type { PrefsBackend } from '../core/settings';
import { applyBackup, BACKUP_FILENAME, createBackup, parseBackup, serializeBackup } from '../core/settings-backup';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';

/**
 * The Backup group of the preferences pane: two buttons and a message line.
 * File dialogs and file access are injected (prefs-pane.ts supplies
 * Zotero's FilePicker and Zotero.File), so the flow is testable without a
 * window. Settings bound with preference= redraw themselves after a
 * restore — Zotero observes every bound pref — and onRestored covers the
 * rows that are not bound.
 *
 * A restore is refused whole while a tab is reading (ui/reading-guard.ts,
 * issue #11): a backup is a full settings snapshot, so it writes the
 * provider switches, the favorites and the hiding switch at once, each of
 * which edits what the Read Aloud player lists. Half a backup would be
 * worse than none, so the check is one, immediately before the write.
 */

export interface BackupFileIO {
  /** Asks where to save; null when the user cancels. */
  pickSavePath(defaultName: string): Promise<string | null>;
  /** Asks which file to read; null when the user cancels. */
  pickOpenPath(): Promise<string | null>;
  writeFile(path: string, text: string): Promise<void>;
  readFile(path: string): Promise<string>;
}

export interface BackupRowsDeps extends BackupFileIO, Partial<ReadingGuardDeps> {
  prefs: PrefsBackend;
  pluginVersion?: string;
  /** Timestamp written into the file; injected so tests are stable. */
  now?(): string;
  /** Asks before the current settings are replaced; omitted means yes. */
  confirm?(message: string): boolean;
  /** Runs after a restore, for rows that must redraw themselves. */
  onRestored?(): void;
  /**
   * The connection check a restore ends in (issue #21): every provider the
   * restored settings turn on is checked, and one that fails goes back off.
   * Returns the sentence to append, or '' when there was nothing to check.
   * Omitted, a restore behaves as it did before there was one.
   */
  verifyProviders?(): Promise<string>;
}

interface ElementLike {
  addEventListener(type: string, fn: () => void): void;
  setAttribute(name: string, value: string): void;
}

interface RowsDocument {
  getElementById(id: string): ElementLike | null;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What the pane says while the providers are being checked. */
export const CHECKING_PROVIDERS = 'Checking the providers it turns on…';

/**
 * The restore's closing check (issue #21), tolerant of its own failure: the
 * settings are on disk and in the prefs either way, so a check that breaks
 * is reported beside the restore, never as a failed restore.
 */
export async function verifyRestoredProviders(deps: { verifyProviders?(): Promise<string> }): Promise<string> {
  if (!deps.verifyProviders) return '';
  try {
    return (await deps.verifyProviders()) || '';
  } catch (e) {
    return `The providers could not be checked: ${describe(e)}`;
  }
}

export function initBackupRows(doc: RowsDocument, deps: BackupRowsDeps): void {
  const message = (text: string) => doc.getElementById('ztts-backup-message')?.setAttribute('value', text);

  doc.getElementById('ztts-backup')?.addEventListener('command', async () => {
    try {
      const path = await deps.pickSavePath(BACKUP_FILENAME);
      if (!path) {
        message('');
        return;
      }
      const backup = createBackup(deps.prefs, { pluginVersion: deps.pluginVersion, exportedAt: deps.now?.() });
      await deps.writeFile(path, serializeBackup(backup));
      message(`Saved to ${path}. The file holds every setting, the API keys, gateway headers and WebDAV password included — keep it private.`);
    } catch (e) {
      message(`Backup failed: ${describe(e)}`);
    }
  });

  doc.getElementById('ztts-restore')?.addEventListener('command', async () => {
    try {
      const path = await deps.pickOpenPath();
      if (!path) {
        message('');
        return;
      }
      const parsed = parseBackup(await deps.readFile(path));
      const count = Object.keys(parsed.settings).length;
      if (deps.confirm && !deps.confirm(`Replace the current settings with the ${count} in ${path}?`)) {
        message('');
        return;
      }
      // Asked here, not before the file dialog: it is the write that has
      // to be safe, and the dialog is the user's only feedback
      if (refuseWhileReading(deps)) {
        message('');
        return;
      }
      const applied = applyBackup(deps.prefs, parsed);
      deps.onRestored?.();
      const skipped = parsed.ignored.length ? ` Skipped ${parsed.ignored.length}: ${parsed.ignored.join(', ')}.` : '';
      const restored = `Restored ${applied} settings from ${path}.${skipped}`;
      if (!deps.verifyProviders) {
        message(restored);
        return;
      }
      message(`${restored} ${CHECKING_PROVIDERS}`);
      const verdict = await verifyRestoredProviders(deps);
      message(verdict ? `${restored} ${verdict}` : restored);
    } catch (e) {
      message(`Restore failed: ${describe(e)}`);
    }
  });
}
