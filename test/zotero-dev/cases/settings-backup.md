[Checklist index](../README.md) · [Scripts](../scripts/settings-backup/README.md)

## Settings backup: the file, this computer's copy on the server, the pane's groups

Against the user's real WebDAV folder; every test file deleted from the
server at the end, every switch restored (bool prefs through
`zotero_execute_js` with `Zotero.Prefs.set(name, false, true)` and a
read-back — `zotero_set_pref` cannot write false). The folder's starting state as found on 2026-09-05
and 2026-09-06 is in [position sync](position-sync.md). `readAloud.memory`
is not a settings key, so items 6.6 and 6.7 take their settings change
from a sync switch.

Items 3.21 and 6.6–6.9 of the checklist, under their original numbers.

### 3.21

21. **The three groups and their message lines** (1.11.7-beta3, measured
    2026-09-10): the pane's group order is `… Keyboard shortcuts, WebDAV,
    Sync, Backup, Build`; the Backup group's children run `h2`, the caption
    *To a file* (`label.ztts-caption`, `font-weight 600`, `margin-top
    8px`), *Backup settings…* / *Restore settings…*, *Export reading
    positions…* / *Import reading positions…* + `?`, the caption *This
    computer's copy on the server*, *This computer* + the id field + `?`,
    *Keep a backup of this computer's settings on the server* + `?`, *Back
    up to the server now* / *Restore settings from server…*,
    `#ztts-backup-message`. *Test connection* writes the WebDAV group's
    `#ztts-webdav-message` (`Connected to <url>.`) and leaves
    `#ztts-backup-message` empty; *Back up to the server now* writes
    `#ztts-backup-message` (`Backed up <n> settings to <url>zotero-tts-settings_<machine>.json.
    The file holds every setting…`) and leaves the WebDAV line as it was.
    Both lines are 0 px high while empty. The first button of each Backup
    row carries `style="min-width: 14em"` (the shortcut rows' own way; a
    button rule in the sheet must be macOS-only, issue #56), so the second
    column lines up — measured on beta5: the second button of each row at
    x 399, the first buttons 182 px wide (the beta3 pass had 340 and
    390 px); the second column's right edges stay ragged, its buttons
    being 125, 175 and 194 px wide.

### 6.6

6. **Settings auto-upload, switch off**: a settings change queues
   nothing (`diagnostics.settingsUpload()` → `autoUpload.pending` false
   and `uploads` unmoved 30 s after the change; the machine file absent
   only on a folder that never had one — on a profile that already holds
   `zotero-tts-settings_<id>.json` its `lastModified` does not move).

### 6.7

7. **Switch on**: the change is itself uploaded ~10 s later —
   `autoUpload.uploads` rises, `zotero-tts-settings_<This computer>.json`
   appears in `settingsFiles()` with a `lastModified` matching the
   upload, the backup's `meta.machine` the id; a two-change burst is one
   upload carrying the settled value; *Back up to the server now* writes the
   same file without moving the auto-upload counter.

### 6.8

8. **This computer.** Renaming writes a fresh file and leaves the old
   machine's untouched; renaming back restores; the pre-1.11 unsuffixed
   `zotero-tts-settings.json` is listed as the shared file.

### 6.9

9. **Modal flows** — *Restore settings from server…* (the picker and the
   confirm), *Export/Import reading positions…*, *Backup/Restore
   settings…* — cannot be driven from the bridge (native dialogs block
   its event loop): their substrate is proved headlessly
   (`settingsFiles()` runs the very `list()` the button runs) and the
   click paths are section 8's.
