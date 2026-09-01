import { loadSettings, type PrefsBackend } from '../core/settings';
import { applyBackup, createBackup, machineSettingsFilename, parseBackup, serializeBackup, SETTINGS_FILE_PATTERN } from '../core/settings-backup';
import type { WebDAVClient, WebDAVConfig, WebDAVFile } from '../core/webdav';
import { CHECKING_PROVIDERS, verifyRestoredProviders } from './backup-rows';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';

/**
 * The Sync group's WebDAV rows (#41): URL, username and password are
 * preference=-bound inputs read when a button is pressed, never earlier;
 * the client is injected (prefs-pane.ts builds core/webdav.ts on the
 * sandbox's fetch), so the flow is testable without a network.
 *
 * Settings do not merge, so every machine keeps its own file on the server
 * — `zotero-tts-settings_<machine id>.json` — and the machine-id field
 * names this one (core/machine-id.ts). Upload writes this machine's file;
 * Restore lists what the folder holds (the unsuffixed pre-1.11 file
 * included), asks which to take when there are several, and then runs the
 * unchanged restore path: confirm, refuse while a tab reads (#11), apply,
 * redraw, provider verification (#21). Settings bound with preference=
 * redraw themselves after a restore; onRestored covers the rows that are
 * not.
 */

export const WEBDAV_IDS = {
  upload: 'ztts-webdav-upload',
  download: 'ztts-webdav-download',
  test: 'ztts-webdav-test',
  message: 'ztts-webdav-message',
  machineId: 'ztts-webdav-machine-id',
} as const;

export interface WebDAVRowsDeps extends Partial<ReadingGuardDeps> {
  prefs: PrefsBackend;
  /** A client for the settings as they are now; throws a WebDAVError('config') for an unusable URL. */
  createClient(cfg: WebDAVConfig): WebDAVClient;
  /** This computer's file signature: read for the upload name, written from the pane's field (core/machine-id.ts). */
  machineId: { get(): string; set(raw: string): string };
  pluginVersion?: string;
  /** Timestamp written into the file; injected so tests are stable. */
  now?(): string;
  /** Asks before the current settings are replaced; omitted means yes. */
  confirm?(message: string): boolean;
  /** The picker when the server holds several machines' files: the chosen index, or null on cancel. Omitted takes the newest. */
  select?(title: string, options: string[]): number | null;
  /** Runs after a rename, so the fresh name gets its file soon (settings-autoupload via src/index.ts). */
  onMachineRenamed?(): void;
  /** Runs after a restore, for rows that must redraw themselves. */
  onRestored?(): void;
  /** The connection check a restore ends in, as the file restore runs it (ui/backup-rows.ts, issue #21). */
  verifyProviders?(): Promise<string>;
}

interface ElementLike {
  addEventListener(type: string, fn: () => void): void;
  setAttribute(name: string, value: string): void;
  /** The machine-id input's live text; buttons and labels have none. */
  value?: string;
}

interface RowsDocument {
  getElementById(id: string): ElementLike | null;
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Newest first; a file without a parseable date sorts last, the legacy era's servers permitting. */
function newestFirst(a: WebDAVFile, b: WebDAVFile): number {
  return (Date.parse(b.lastModified ?? '') || 0) - (Date.parse(a.lastModified ?? '') || 0);
}

/** The picker's line for one settings file: whose it is, and how fresh. */
export function settingsFileLabel(file: WebDAVFile): string {
  const id = SETTINGS_FILE_PATTERN.exec(file.name)?.[1];
  return `${id ?? 'shared file (before 1.11)'} — ${file.lastModified ?? 'date unknown'}`;
}

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
    const id = deps.machineId.get();
    const name = machineSettingsFilename(id);
    const backup = createBackup(deps.prefs, { pluginVersion: deps.pluginVersion, exportedAt: deps.now?.(), machine: id });
    await client.upload(name, serializeBackup(backup));
    const count = Object.keys(backup.settings).length;
    return `Uploaded ${count} settings to ${client.url}${name}. The file holds every setting, the API keys, gateway headers and WebDAV password included — keep the folder private.`;
  });

  button(WEBDAV_IDS.download, 'Restore failed', 'Looking…', async (client) => {
    const files = (await client.list()).filter((f) => SETTINGS_FILE_PATTERN.test(f.name)).sort(newestFirst);
    if (files.length === 0) return `No settings backup on ${client.url} yet.`;
    let file = files[0];
    if (files.length > 1) {
      const at = deps.select ? deps.select('Restore settings from which computer?', files.map(settingsFileLabel)) : 0;
      if (at === null || files[at] === undefined) return '';
      file = files[at];
    }
    const parsed = parseBackup(await client.download(file.name));
    const count = Object.keys(parsed.settings).length;
    const from = parsed.machine ? ` of ${parsed.machine}` : '';
    const saved = parsed.exportedAt ? `, saved ${parsed.exportedAt}` : '';
    if (deps.confirm && !deps.confirm(`Replace the current settings with the ${count}${from} on ${client.url}${saved}?`)) return '';
    if (refuseWhileReading(deps)) return '';
    const applied = applyBackup(deps.prefs, parsed);
    deps.onRestored?.();
    const skipped = parsed.ignored.length ? ` Skipped ${parsed.ignored.length}: ${parsed.ignored.join(', ')}.` : '';
    const restored = `Restored ${applied} settings from ${client.url}${file.name}.${skipped}`;
    if (!deps.verifyProviders) return restored;
    message(`${restored} ${CHECKING_PROVIDERS}`);
    const verdict = await verifyRestoredProviders(deps);
    return verdict ? `${restored} ${verdict}` : restored;
  });

  // This computer's name: shown as stored, sanitized on the way back in; a
  // rename starts a new file on the server, and the old one ages visibly
  // in the restore list
  const field = doc.getElementById(WEBDAV_IDS.machineId);
  if (field) {
    field.value = deps.machineId.get();
    field.addEventListener('change', () => {
      const stored = deps.machineId.set(field.value ?? '');
      field.value = stored;
      message(`This computer's settings upload as ${machineSettingsFilename(stored)}.`);
      deps.onMachineRenamed?.();
    });
  }
}
