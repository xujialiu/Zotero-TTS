import { PREF_PREFIX, type PrefsBackend } from './settings';

/**
 * The name this computer signs its settings file with on the WebDAV server
 * (#41): `zotero-tts-settings_<id>.json`. Settings cannot merge the way
 * reading positions do, so every machine writes its own file and no two
 * machines ever contend for one.
 *
 * The pref is deliberately NOT in DEFAULTS: the backup set is exactly
 * DEFAULTS, and an identity inside it would be hijacked by restoring
 * another machine's backup — machine B would silently start writing
 * machine A's file. So it is an undeclared pref, written on first use,
 * and it never travels. The default is the hostname (the caller supplies
 * it; core code has no reach to it), which the user can rename in the
 * pane — a Windows `DESKTOP-4F2K9J` reflects nothing.
 */

export const MACHINE_ID_PREF = PREF_PREFIX + 'webdav.machineId';

/** Longer adds nothing to a filename; real hostnames are shorter anyway. */
export const MACHINE_ID_MAX_CHARS = 40;

/**
 * A filename- and URL-safe id: letters, digits, dot, dash, underscore.
 * Every run of anything else — spaces, slashes, non-ASCII — becomes one
 * dash; leading and trailing dashes and dots go (a name of only such
 * characters comes out empty, and the caller falls back). Idempotent, so a
 * stored id sanitizes to itself.
 */
export function sanitizeMachineId(raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .slice(0, MACHINE_ID_MAX_CHARS)
    .replace(/^[-.]+|[-.]+$/g, '');
}

/**
 * This computer's id: the stored one, or the sanitized default persisted
 * on first use ('computer' when even that yields nothing). A stored value
 * that no longer sanitizes to itself — a hand-edited prefs.js — is
 * repaired in place.
 */
export function machineId(prefs: PrefsBackend, defaultName: () => string): string {
  const stored = prefs.get(MACHINE_ID_PREF);
  if (typeof stored === 'string') {
    const clean = sanitizeMachineId(stored);
    if (clean) {
      if (clean !== stored) prefs.set(MACHINE_ID_PREF, clean);
      return clean;
    }
  }
  let name = '';
  try {
    name = defaultName();
  } catch {
    name = '';
  }
  const id = sanitizeMachineId(name) || 'computer';
  prefs.set(MACHINE_ID_PREF, id);
  return id;
}

/** The rename from the pane's field; a name that sanitizes to nothing keeps (and returns) the current id. */
export function renameMachineId(prefs: PrefsBackend, raw: string, defaultName: () => string): string {
  const clean = sanitizeMachineId(raw);
  if (!clean) return machineId(prefs, defaultName);
  prefs.set(MACHINE_ID_PREF, clean);
  return clean;
}
