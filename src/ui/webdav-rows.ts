import { loadSettings, type PrefsBackend } from '../core/settings';
import { applyBackup, BACKUP_FILENAME, createBackup, parseBackup, serializeBackup } from '../core/settings-backup';
import type { WebDAVClient, WebDAVConfig } from '../core/webdav';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';

/**
 * The WebDAV rows of the Backup group: the very file the Backup and Restore
 * buttons write and read, kept in a WebDAV folder instead so it travels
 * between machines. URL, username and password are preference=-bound inputs
 * and are read when a button is pressed, never earlier; the client is
 * injected (prefs-pane.ts builds core/webdav.ts on the sandbox's fetch), so
 * the flow is testable without a network. Settings bound with preference=
 * redraw themselves after a restore; onRestored covers the rows that are not.
 * A download is refused while a tab is reading, for the reason the file
 * restore is (ui/backup-rows.ts, ui/reading-guard.ts, issue #11).
 */

export const WEBDAV_IDS = {
  upload: 'ztts-webdav-upload',
  download: 'ztts-webdav-download',
  test: 'ztts-webdav-test',
  message: 'ztts-webdav-message',
} as const;

export interface WebDAVRowsDeps extends Partial<ReadingGuardDeps> {
  prefs: PrefsBackend;
  /** A client for the settings as they are now; throws a WebDAVError('config') for an unusable URL. */
  createClient(cfg: WebDAVConfig): WebDAVClient;
  pluginVersion?: string;
  /** Timestamp written into the file; injected so tests are stable. */
  now?(): string;
  /** Asks before the current settings are replaced; omitted means yes. */
  confirm?(message: string): boolean;
  /** Runs after a restore, for rows that must redraw themselves. */
  onRestored?(): void;
}

interface ElementLike {
  addEventListener(type: string, fn: () => void): void;
  setAttribute(name: string, value: string): void;
}

interface RowsDocument {
  getElementById(id: string): ElementLike | null;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function initWebDAVRows(doc: RowsDocument, deps: WebDAVRowsDeps): void {
  const message = (text: string) => doc.getElementById(WEBDAV_IDS.message)?.setAttribute('value', text);
  // One request at a time: a second click while the first is still talking
  // to the server would only produce a second dialog or a second upload
  let busy = false;

  const button = (id: string, failure: string, progress: string, action: (client: WebDAVClient) => Promise<string>) => {
    doc.getElementById(id)?.addEventListener('command', async () => {
      if (busy) return;
      busy = true;
      try {
        message(progress);
        const client = deps.createClient(loadSettings(deps.prefs).webdav);
        message(await action(client));
      } catch (e) {
        message(`${failure}: ${describe(e)}`);
      } finally {
        busy = false;
      }
    });
  };

  button(WEBDAV_IDS.test, 'Connection failed', 'Testing…', async (client) => {
    await client.check();
    return `Connected to ${client.url}.`;
  });

  button(WEBDAV_IDS.upload, 'Upload failed', 'Uploading…', async (client) => {
    const backup = createBackup(deps.prefs, { pluginVersion: deps.pluginVersion, exportedAt: deps.now?.() });
    await client.upload(BACKUP_FILENAME, serializeBackup(backup));
    const count = Object.keys(backup.settings).length;
    return `Uploaded ${count} settings to ${client.url}${BACKUP_FILENAME}. The file contains your API keys — keep the folder private.`;
  });

  button(WEBDAV_IDS.download, 'Download failed', 'Downloading…', async (client) => {
    const parsed = parseBackup(await client.download(BACKUP_FILENAME));
    const count = Object.keys(parsed.settings).length;
    const saved = parsed.exportedAt ? `, saved ${parsed.exportedAt}` : '';
    if (deps.confirm && !deps.confirm(`Replace the current settings with the ${count} on ${client.url}${saved}?`)) return '';
    if (refuseWhileReading(deps)) return '';
    const applied = applyBackup(deps.prefs, parsed);
    deps.onRestored?.();
    const skipped = parsed.ignored.length ? ` Skipped ${parsed.ignored.length}: ${parsed.ignored.join(', ')}.` : '';
    return `Restored ${applied} settings from ${client.url}${BACKUP_FILENAME}.${skipped}`;
  });
}
