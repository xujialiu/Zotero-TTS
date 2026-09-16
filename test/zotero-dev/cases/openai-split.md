[Checklist index](../README.md) · [Scripts](../scripts/openai-split/README.md)

## The OpenAI section split into OpenAI, Xiaomi MiMo and OpenAI Compatible, and the old settings carried over (issue #113, 1.12.12)

Three provider sections where there was one with a **Server** dropdown:
**OpenAI** (`openai-official`: API key, Model, Voices; api.openai.com,
fixed), **Xiaomi MiMo** (`mimo`: the same three; api.xiaomimimo.com,
fixed, the chat completions route) and **OpenAI Compatible** (`compatible`:
Address, API key, Model, Voices, Extra headers). Each is a provider of its
own — switch, Test connection, entry in the player's first dropdown and
the voice browser's first column, voice ids `<id>::<voice>` — and all
three can be on at once. The first start on a profile that had the old
section moves its values into the three (`src/core/openai-split.ts`,
temporary, deleted in 2.0.0): the server that was chosen keeps its
switch and its fields, the other two start off with the values the
dropdown remembered for them, the remembered voices are re-prefixed, and
the nine `openai.*` prefs are cleared. Backups and shared settings files
from before the split are read the same way (unit tests only: a live
restore from such a file would overwrite this profile).

Run the baseline first. **This profile's real prefs are the migration's
input**: read them by length before the install (`openai.server`, the
lengths of `openai.apiKey` and `openai.headers`, whether
`openai.presetValues` holds each of `openai`, `chatterbox`, `mimo`,
`other`, the `tierVoices` keys and any `openai::` id in
`reader.readAloudVoices`, `readAloud.memory` and
`readAloud.favoriteVoices`) — never a value, and by the full pref name
with the global flag (`Zotero.Prefs.get('extensions.zotero.zotero-tts.openai.server', true)`;
a relative name with the flag reads `undefined` and proves nothing —
the first run's mistake). **No player may be open** while a switch is
used: the reading guard refuses both directions, so the tester closes
the owner's paused player before items 4–5 (`toggleReadAloudPopup(false)`
on that reader, the tab noted in the report) and does not reopen it. Xiaomi MiMo's
probe spends nothing (free for now); the Chatterbox behind OpenAI
Compatible is the owner's own. Expected values below are derived from
`src/` and the probes of 2026-09-15 (issue #113) and corrected by the
first run (`scripts/openai-split/README.md`).

1. **The migration ran, once.** After the install (an in-place upgrade
   restarts the plugin, which runs the startup steps),
   `Zotero.ZoteroTTS.diagnostics.startup()` lists the step `OpenAI section
   split` as `ok`. `Zotero.ZoteroTTS.diagnostics.openaiSplit()`
   (synchronous) → `feature: "openai-split"`; `report.target` = the section
   the old `openai.server` named (`mimo` on this profile as of 2026-09-15),
   `report.enabled` = the old `openai.enabled` under that target and
   `false` under the other two, `report.clearedKeys` = the number of
   `openai.*` prefs that held a value (9 on this profile),
   `report.rewrittenPrefs` = how many of the three voice prefs named an
   `openai::` voice (derive from the pre-install read: 0–3);
   `sections.mimo` = `{ enabled: <old openai.enabled>, apiKey: <length of
   the old openai.apiKey>, model: "mimo-v2.5-tts", voices: "" }`,
   `sections["openai-official"]` = the remembered OpenAI set (`apiKey` 0
   here, `model: "gpt-4o-mini-tts"`), `sections.compatible` = the
   remembered Chatterbox set (`baseURL` 36 — the address by length,
   `headers` 151, `apiKey` 0, `model: "tts-1"`), all three `enabled`
   false on this profile; `legacyPrefs: []` — no `openai.*` pref holds a
   user value (`Services.prefs.prefHasUserValue(fullName)`), while
   `staleDefaults` lists the nine: `Zotero.Prefs.get(fullName, true)` still
   answers the old prefs.js's defaults for every one of them as long as
   this Zotero process has loaded a build from before the split (Gecko
   keeps a default registered until it quits; none after a full restart).
   **A second in-place install of the same xpi** — the check that failed
   on 2026-09-16, when the gate read those defaults and split them over
   the sections it had just filled — shows `report: null`, `legacyPrefs:
   []`, the same `staleDefaults`, and the sections unchanged: the same key
   lengths, `openai-official.enabled` still false. On a profile already
   migrated (this one, since 2026-09-16) the install shows `report: null`
   from the first start, and the migration itself is the unit tests';
   the live proof is the gate holding. Any `openai::` id read before the
   install now carries the target's prefix (`mimo::…`) wherever it sat —
   an entry's `voice`, any `tierVoices` value — and a `tierVoices` key that
   is literally `openai` becomes the target key in the same position (this
   profile's `mul` entry kept its `local` key and had its value rewritten).
2. **The pane.** Settings → Zotero-TTS: no `ztts-openai-server` menulist
   and no `ztts-provider-openai` groupbox; `ztts-provider-openai-official`
   right after `ztts-provider-local`, its `h2` `OpenAI (platform.openai.com)`
   with the host a `zotero-text-link`, then rows API key (password, pref
   `openai-official.apiKey`, a `?` `ztts-help-openai`), Model (text, list
   `ztts-openai-official-models`), Voices (placeholder `built-in voices`),
   the buttons `ztts-enable-openai-official` / `ztts-test-openai-official`
   and `ztts-test-result-openai-official`; `ztts-provider-compatible` next,
   `h2` `OpenAI Compatible` (plain text), rows Address (placeholder
   `http://localhost:8004`, a `?` `ztts-help-compatible`), API key, Model
   (list `ztts-compatible-models`), Voices (placeholder `the server's own`),
   Extra headers (password, placeholder `Name: value; Name: value`, the
   `?` `ztts-help-extra-headers`), the buttons; `ztts-provider-mimo`
   between `ztts-provider-system` and `ztts-zotero-section`, `h2` `Xiaomi
   MiMo (platform.xiaomimimo.com)` linked, rows API key (`?`
   `ztts-help-mimo`), Model (list `ztts-mimo-models`), Voices, the buttons.
   The provider groupboxes stand Azure · Cloudflare Workers AI · Fish Audio
   · Fish Speech · Kokoro-FastAPI · OpenAI · OpenAI Compatible · Speechify ·
   System voices · Xiaomi MiMo · Zotero: 19 groupboxes in the pane in all.
   The three sections show the migrated values (key fields by length).
   zh-CN (item 1.10's route): the `?` texts in Chinese, the headings and
   `OpenAI Compatible` unchanged.
3. **Test connection, each section, nothing switched on.** Xiaomi MiMo
   (its key migrated) → `Connected. Model mimo-v2.5-tts available. 9 voices
   available. Synthesis works.` within a few seconds, the datalist
   `ztts-mimo-models` filled with the account's models, `mimo-v2.5-tts`
   first; a request to `https://api.xiaomimimo.com/v1/chat/completions`
   and none to `/v1/audio/speech`. OpenAI Compatible (the Chatterbox set)
   → `Connected. 28 voices available. Synthesis works.`, `/v1/models` a
   404 tolerated. OpenAI (no key on this profile) → `No API key set for
   this provider.` with no request made. Address emptied on OpenAI
   Compatible (temporarily, restored right after) → `Cannot connect:
   OpenAI Compatible: no server address`, no request.
4. **Two of them on at once, each its own entry.** No player open. Enable
   Xiaomi MiMo and Enable OpenAI Compatible (each runs its check first) →
   `mimo.enabled` and `compatible.enabled` true, both sections locked.
   `diagnostics.providerTiers()` → `labels` holds `"openai-official":
   "OpenAI"`, `mimo: "Xiaomi MiMo"`, `compatible: "OpenAI Compatible"` (and
   no `openai` key). The voice browser's first column lists `OpenAI
   Compatible` and `Xiaomi MiMo` (sorted by name among the others), 28
   voices under the first (`Abigail.wav` … as their own names) and 9 under
   the second (`mimo_default`, `冰糖`, `茉莉`, `苏打`, `白桦`, `Mia`, `Chloe`,
   `Milo`, `Dean`), all under Multiple languages; their ids
   `compatible::Abigail.wav`, `mimo::冰糖`. A fixture's popup opened muted
   lists the same two entries in its first dropdown; one sentence of
   `fixture-b.pdf` read with `mimo::冰糖` (`selectVoice`, paused in the
   same script) logs `[zotero-tts] mimo: no word timestamps for N chars
   (audio through /v1/chat/completions), highlighting the sentence`, and
   one with `compatible::Emily.wav` logs `[zotero-tts] compatible: no word
   timestamps for N chars, highlighting the sentence`. Nothing typed for
   one section reaches another: the MiMo request carries `Authorization`
   and no `CF-Access-Client-Id`; the Chatterbox request carries the two
   `CF-Access-*` headers and no `Authorization` (the debug store, or a
   fetch wrapper in the script).
5. **Restore.** Disable both (no player open); the three switches back to
   what item 1 found (all off here); the fixture closed; the volume and the
   memory restored as the baseline says. The migrated values stay: they are
   this profile's settings now.

What only unit tests cover: the conversion of a backup file and of a
shared settings file from before the split (`test/core/openai-split.test.ts`,
`test/core/settings-sync.test.ts`, `test/core/settings-backup.test.ts`).
What only a human can judge: nothing here.
