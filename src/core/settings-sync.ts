import type { ProviderId } from './providers/types';
import { PRESET_FIELDS, parsePresetValues, SERVER_PRESETS, type PresetValues } from './server-presets';
import { DEFAULTS, PREF_PREFIX, PROVIDER_IDS, type PrefsBackend } from './settings';
import { coerceSetting, flattenSettings, type FlatSettings, type SettingValue } from './settings-backup';

/**
 * Two-way settings sync over the user's WebDAV folder (#68): the pure half.
 *
 * Settings do not merge as a whole — which is why the backup keeps one
 * snapshot file per machine (#41) — but one setting at a time they do, by
 * recency, exactly as the reading positions do per attachment (#40). So the
 * sync has one shared file, `zotero-tts-shared-settings.json`, holding the
 * latest value of each setting with when it was set and by which machine,
 * and every machine keeps, per setting, when it last changed it (the
 * stamps). A sync is read-merge-write: an item newer than this machine's
 * stamp is adopted, a stamp newer than the file's item is pushed, equal
 * stamps do nothing — values equal or not, which is what lets a provider a
 * check switched off here stay off here without switching it off anywhere
 * else (settings-sync-transport.ts).
 *
 * What never travels: the WebDAV connection and its switches (the sync
 * rides on them), the System voices switch (a platform's), and every key
 * of a provider section whose address is local — `localhost`, a private
 * or link-local range, a `.local`/`.lan` name, a bare hostname — decided
 * by the address on this machine and, for a hand-edited file, by the
 * file's own address item. Such a section is neither written into the
 * file nor applied from it, so a Kokoro on this computer's Docker and a
 * Chatterbox on that one's stay where they are (the owner's rule,
 * 2026-09-10: a LAN address is a local one, no exceptions).
 *
 * The stamps live in an undeclared pref, `webdav.syncState`, deliberately
 * outside DEFAULTS like `webdav.machineId`: the backup set is exactly
 * DEFAULTS, and stamps carried by a restore would make one machine claim
 * another's changes as its own.
 */

export const SHARED_SETTINGS_FILENAME = 'zotero-tts-shared-settings.json';
export const SHARED_SETTINGS_FORMAT = 'zotero-tts-shared-settings';
export const SHARED_SETTINGS_VERSION = 1;
export const SYNC_STATE_PREF = PREF_PREFIX + 'webdav.syncState';
/** The switch's pref as Zotero.Prefs.registerObserver wants it: relative to `extensions.zotero.`. */
export const SYNC_SETTINGS_OBSERVER = 'zotero-tts.webdav.syncSettings';

/** One setting's latest value in the shared file: when it was set (ms since the epoch) and by which machine. */
export interface SharedItem {
  key: string;
  value: SettingValue;
  ts: number;
  by: string;
}

export type SharedSettingsErrorKind =
  /** Not this format at all, or unreadable — overwriting it heals it. */
  | 'malformed'
  /** Written by a newer plugin — this build must not touch it. */
  | 'newer';

export class SharedSettingsError extends Error {
  constructor(
    public readonly kind: SharedSettingsErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SharedSettingsError';
  }
}

/** Every setting this version knows, with its default — the kind of value each holds. */
export const KNOWN_DEFAULTS: FlatSettings = flattenSettings(DEFAULTS);

/** The connection the sync rides on, its switches, and the one switch that is a platform's. */
export function neverSynced(key: string): boolean {
  return key.startsWith('webdav.') || key === 'system.enabled';
}

/** The keys that may travel at all; which of them do on a given sync also depends on the addresses (heldSections). */
export const SYNCABLE_KEYS: readonly string[] = Object.keys(KNOWN_DEFAULTS).filter((key) => !neverSynced(key));

/** The provider sections whose address decides whether they travel, and the key that holds it. */
export const ADDRESSED_SECTIONS: Readonly<Record<string, string>> = { openai: 'openai.baseURL', local: 'local.baseURL' };

const PRESET_VALUES_KEY = 'openai.presetValues';

/** `openai` for `openai.apiKey`; the key itself when it has no dot (`prefetch`). */
export function sectionOf(key: string): string {
  const dot = key.indexOf('.');
  return dot < 0 ? key : key.slice(0, dot);
}

const isProviderId = (section: string): section is ProviderId => (PROVIDER_IDS as readonly string[]).includes(section);

/**
 * Whether a setting edits what the Read Aloud player lists (ui/reading-guard.ts):
 * a provider's switch, address, key or voices, and the favorites pair. These
 * wait while a tab reads; everything else applies at once.
 */
export function editsPlayerList(key: string): boolean {
  return isProviderId(sectionOf(key)) || key === 'readAloud.favoritesOnly' || key === 'readAloud.favoriteVoices';
}

// ---- The local-address rule ------------------------------------------------

const v4 = (host: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
};

function isLocalV4(parts: number[]): boolean {
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8: "this host"
    a === 127 || // loopback
    a === 10 || // RFC 1918
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // link-local
    (a === 100 && b >= 64 && b <= 127) // RFC 6598 shared space: Tailscale and other overlays
  );
}

function isLocalV6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === '::1' || h === '::') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (mapped) {
    const parts = v4(mapped[1]);
    return parts ? isLocalV4(parts) : true;
  }
  const first = h.split(':')[0];
  if (first.length === 4 && /^f[cd]/.test(first)) return true; // fc00::/7, unique local
  return /^fe[89ab]/.test(first) && first.length === 4; // fe80::/10, link-local
}

/**
 * Whether an address names this computer or its own network — and so a
 * server that other computers cannot be assumed to reach. `localhost` and
 * `*.localhost`; 127/8, 0/8, 10/8, 172.16/12, 192.168/16, 169.254/16 and
 * 100.64/10; `::1`, `fc00::/7`, `fe80::/10`; names ending in `.local`,
 * `.lan`, `.home`, `.internal` or `.localdomain`; a hostname without a dot;
 * and anything that does not parse as a URL at all.
 */
export function isLocalAddress(raw: string): boolean {
  let host: string;
  try {
    host = new URL(raw.trim()).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (!host) return true;
  if (host.startsWith('[') && host.endsWith(']')) return isLocalV6(host.slice(1, -1));
  if (host.includes(':')) return isLocalV6(host);
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const parts = v4(host);
  if (parts) return isLocalV4(parts);
  if (!host.includes('.')) return true;
  return /\.(local|lan|home|internal|localdomain)$/.test(host);
}

/** The provider sections a set of values puts at a local address; a set without the address key (the file's) holds none for it. */
export function heldSections(values: Partial<FlatSettings>): Set<string> {
  const held = new Set<string>();
  for (const [section, addressKey] of Object.entries(ADDRESSED_SECTIONS)) {
    const address = values[addressKey];
    if (typeof address === 'string' && isLocalAddress(address)) held.add(section);
  }
  return held;
}

// ---- The shared file --------------------------------------------------------

const byKey = (a: SharedItem, b: SharedItem) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

const canonical = (items: readonly SharedItem[]): SharedItem[] =>
  [...items].sort(byKey).map((item) => ({ key: item.key, value: item.value, ts: item.ts, by: item.by }));

/** The canonical file text for these items; equal content is equal text, so an unchanged file is never re-uploaded. */
export function serializeSharedSettings(items: readonly SharedItem[]): string {
  return JSON.stringify({ format: SHARED_SETTINGS_FORMAT, version: SHARED_SETTINGS_VERSION, items: canonical(items) });
}

const isSettingValue = (value: unknown): value is SettingValue => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

function asItem(raw: unknown): SharedItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const { key, value, ts, by } = raw as Record<string, unknown>;
  if (typeof key !== 'string' || !key || !isSettingValue(value) || typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  return { key, value, ts, by: typeof by === 'string' ? by : '' };
}

/**
 * The items of a shared file. Malformed items are dropped. Throws a
 * SharedSettingsError: `malformed` for anything unreadable — the caller
 * treats the file as absent and heals it — and `newer` for a valid file of
 * a later version, which the caller must leave alone.
 */
export function parseSharedSettings(text: string): SharedItem[] {
  let parsed: { format?: unknown; version?: unknown; items?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new SharedSettingsError('malformed', 'The shared settings file on the server is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || parsed.format !== SHARED_SETTINGS_FORMAT) {
    throw new SharedSettingsError('malformed', 'The file on the server is not a Zotero-TTS shared settings file.');
  }
  if (typeof parsed.version !== 'number' || !Array.isArray(parsed.items)) {
    throw new SharedSettingsError('malformed', 'The shared settings file on the server has no readable items.');
  }
  if (parsed.version > SHARED_SETTINGS_VERSION) {
    throw new SharedSettingsError(
      'newer',
      `The shared settings file on the server is version ${parsed.version}; this build reads up to ${SHARED_SETTINGS_VERSION}. Update Zotero-TTS on this computer.`,
    );
  }
  return parsed.items.map(asItem).filter((item): item is SharedItem => item !== null);
}

// ---- This machine's record ----------------------------------------------------

export interface HeldProvider {
  /** When the check failed here. */
  ts: number;
  /** The check's message, for the pane's status line. */
  reason: string;
}

export interface SyncState {
  /** Per setting, when this machine last changed it; absent means never since the stamps began, and the file's value is taken. */
  stamps: Record<string, number>;
  /** Providers the sync switched off on this machine because their check failed here (#21); retried on the next adoption in their section. */
  held: Partial<Record<ProviderId, HeldProvider>>;
  /** Whether the stamps were seeded at the first sync with the switch on. */
  seeded: boolean;
}

const emptyState = (): SyncState => ({ stamps: {}, held: {}, seeded: false });

export function readSyncState(prefs: PrefsBackend): SyncState {
  const raw = prefs.get(SYNC_STATE_PREF);
  if (typeof raw !== 'string' || !raw) return emptyState();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyState();
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyState();
  const { stamps, held, seeded } = data as Record<string, unknown>;
  const state = emptyState();
  if (stamps && typeof stamps === 'object') {
    for (const [key, ts] of Object.entries(stamps as Record<string, unknown>)) {
      if (typeof ts === 'number' && Number.isFinite(ts) && ts >= 0) state.stamps[key] = ts;
    }
  }
  if (held && typeof held === 'object') {
    for (const [id, entry] of Object.entries(held as Record<string, unknown>)) {
      if (!isProviderId(id) || !entry || typeof entry !== 'object') continue;
      const { ts, reason } = entry as Record<string, unknown>;
      if (typeof ts === 'number' && Number.isFinite(ts) && typeof reason === 'string') state.held[id] = { ts, reason };
    }
  }
  state.seeded = !!seeded;
  return state;
}

export function writeSyncState(prefs: PrefsBackend, state: SyncState): void {
  prefs.set(SYNC_STATE_PREF, JSON.stringify({ stamps: state.stamps, held: state.held, seeded: state.seeded }));
}

/**
 * The stamps at the first sync with the switch on: every setting that
 * differs from its default and has no stamp yet counts as set now, so the
 * computer that was configured seeds the file whichever computer turns the
 * switch on first, and a fresh install — everything at its default, no
 * stamps — joins and receives. A setting set differently on two configured
 * computers goes to the one that turned the switch on later.
 */
export function seedStamps(values: FlatSettings, stamps: Record<string, number>, now: number): Record<string, number> {
  const out = { ...stamps };
  for (const key of SYNCABLE_KEYS) {
    if (out[key] === undefined && values[key] !== KNOWN_DEFAULTS[key]) out[key] = now;
  }
  return out;
}

// ---- The server presets, a value that merges inside -------------------------

/** The presets in one order, each field in one order, so equal content is equal text. */
function stablePresetValues(presets: PresetValues): string {
  const out: Record<string, Record<string, string>> = {};
  for (const id of SERVER_PRESETS) {
    const fields = presets[id];
    if (!fields) continue;
    const ordered: Record<string, string> = {};
    for (const field of PRESET_FIELDS) {
      const value = fields[field];
      if (typeof value === 'string') ordered[field] = value;
    }
    if (Object.keys(ordered).length) out[id] = ordered;
  }
  return JSON.stringify(out);
}

/** The file's presets replace this machine's preset by preset; presets only this machine has stay. */
export function mergePresetValues(mine: string, theirs: string): string {
  return stablePresetValues({ ...parsePresetValues(mine), ...parsePresetValues(theirs) });
}

/** What leaves this machine for the file: the server presets without those at a local address. */
export function outgoingValue(key: string, value: SettingValue): SettingValue {
  if (key !== PRESET_VALUES_KEY || typeof value !== 'string') return value;
  const presets = parsePresetValues(value);
  const kept: PresetValues = {};
  for (const id of SERVER_PRESETS) {
    const fields = presets[id];
    if (fields && !(typeof fields.baseURL === 'string' && isLocalAddress(fields.baseURL))) kept[id] = fields;
  }
  return stablePresetValues(kept);
}

// ---- The merge --------------------------------------------------------------

export interface MergeInput {
  /** This machine's settings, every key (flattenSettings(loadSettings(prefs))). */
  values: FlatSettings;
  /** When this machine last changed each; absent is never. */
  stamps: Record<string, number>;
  /** This machine's id, written as the item's `by`. */
  machine: string;
}

export interface MergePlan {
  /** Items to apply on this machine: newer than its stamp, with a value it does not have; each adopted key's stamp becomes the item's `ts`. */
  adopt: SharedItem[];
  /** Keys whose stamp moves to the file's `ts` without a write: newer there, same value here. */
  restamp: Record<string, number>;
  /** The file's next content, canonical. */
  items: SharedItem[];
  /** Whether `items` differs from what came down. */
  changed: boolean;
  /** Keys this machine wrote into the file. */
  pushed: string[];
  /** Keys the file offered that this machine does not take: a section held on either side, a value of the wrong kind. */
  skipped: string[];
}

export function mergeSharedSettings(local: MergeInput, remote: readonly SharedItem[]): MergePlan {
  const remoteByKey = new Map<string, SharedItem>();
  const remoteValues: Partial<FlatSettings> = {};
  for (const item of remote) {
    remoteByKey.set(item.key, item);
    remoteValues[item.key] = item.value;
  }
  const heldHere = heldSections(local.values);
  const heldThere = heldSections(remoteValues);
  // Everything the file holds passes through unless this machine has newer:
  // keys it does not sync, and a newer build's keys, stay as they are
  const next = new Map(remoteByKey);
  const adopt: SharedItem[] = [];
  const restamp: Record<string, number> = {};
  const pushed: string[] = [];
  const skipped: string[] = [];

  for (const key of SYNCABLE_KEYS) {
    const section = sectionOf(key);
    const theirs = remoteByKey.get(key);
    const mine = local.values[key];
    const myTs = local.stamps[key] ?? 0;
    if (heldHere.has(section)) {
      if (theirs) skipped.push(key);
      continue;
    }
    if (theirs) {
      const value = coerceSetting(theirs.value, KNOWN_DEFAULTS[key]);
      if (value === undefined || heldThere.has(section)) {
        skipped.push(key);
      } else if (theirs.ts > myTs) {
        const incoming = key === PRESET_VALUES_KEY ? mergePresetValues(String(mine), String(value)) : value;
        const current = key === PRESET_VALUES_KEY ? mergePresetValues(String(mine), '{}') : mine;
        if (incoming !== current) adopt.push({ ...theirs, value: incoming });
        else restamp[key] = theirs.ts;
        continue;
      }
    }
    if (myTs > 0 && (!theirs || myTs > theirs.ts)) {
      next.set(key, { key, value: outgoingValue(key, mine), ts: myTs, by: local.machine });
      pushed.push(key);
    }
  }

  const items = canonical([...next.values()]);
  const changed = serializeSharedSettings(items) !== serializeSharedSettings(remote);
  return { adopt, restamp, items, changed, pushed, skipped };
}
