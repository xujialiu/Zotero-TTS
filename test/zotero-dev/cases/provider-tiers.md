[Checklist index](../README.md)

## One entry per provider in the player's first dropdown (issue #110, 1.12.10)

The player's first dropdown (Zotero's *Voice Mode*) lists one entry per
enabled provider that has voices, beside Zotero's Standard and Premium,
sorted by displayed name; each provider remembers its own last voice per
language; voice labels carry no provider prefix; the voice browser's first
column is the same list. Mechanism: every plugin voice's `impl.tier` is
rewritten to its provider's key (`azure`, `cloudflare`, `speechify`,
`fish`, `fishspeech`, `openai`, `system`; the local engine's name,
`kokoro`) in a shadow of the manager's `_resolveVoice`, outside
system-voices.ts's, and the reader's `React.createElement` is wrapped per
tab to hand the tier select another option list, and the manager's
`selectTier` gets a hook that refreshes its persisted entry from the
reader's state before the pick reads it, since Zotero refreshes that
entry only when a popup opens (`src/read-aloud/provider-tiers.ts`).

Run the baseline first. Fixture: `fixture-a.pdf` as a standalone
attachment, opened, its popup opened muted (`readAloud.volume` 0 for the
run); the owner's paused player untouched. The checks name Kokoro and
Fish-cloud; substitute whichever providers are enabled in the profile
(read `zotero-tts.<provider>.enabled`, never switch one on for the run).
Expected values below are derived from `src/` (`buildTierOptions`,
`strandedTarget`, `providerTierLabels`) unless a run is cited.

### 1. The build and its patches

1. `diagnostics.startup()` → `version` the build, the step `provider
   entries in the player` ok. `diagnostics.providerTiers()` (async) →
   `feature: "provider-tiers"` — the build's identity, since a sibling
   worktree may name the same `-betaN`; `labels` holding
   `standard: "Standard"`, `premium: "Premium"`, `kokoro: "Kokoro"`,
   `fish: "Fish-cloud"`, `fishspeech: "Fish-local"`, `system: "System"`,
   `azure`, `cloudflare`, `speechify`, `openai` (`OpenAI`, or the
   Server preset's name: `Xiaomi MiMo` / `Chatterbox-TTS-Server`).
2. After the fixture's popup opened, its reader in `readers` →
   `resolveShadow: true`, `createElementWrapped: true`,
   `tierMemoryHook: true`; `tiers` = the
   enabled providers' keys plus `standard` / `premium` (signed in) and
   **never `local`**; `retagged` = one count per provider key, no
   `local` key (a `local` count is the re-tag not landing — FAIL);
   `selectedTier` a key of `tiers`; `options` = the list last handed to
   the dropdown: Zotero's Standard/Premium as given (present, `disabled`
   when empty), one `{ value, label, disabled: false }` per provider tier
   with voices, sorted by label (`Fish-cloud`, `Kokoro`, `Premium`,
   `Standard` on a Fish + Kokoro profile), no `local` entry.
   `diagnostics.patches()` → `providerTiers.live` = 2 per open tab whose
   popup opened this session (one prototype, one React; the selectTier
   hook is not in that log), `total` equal.
   The debug log carries `provider tiers attached`, `provider tiers: the
   player's first dropdown is wrapped` and `re-tagged N plugin voices by
   provider: fish 339, kokoro 68` once per listing.

### 2. The dropdown's rows

3. Open the Options panel (read the popup's `expanded` class first: the
   expanded-player setting may have it open, and a click would fold it)
   and open the first dropdown. It is the CustomSelect whose open
   `.custom-select-dropdown` holds a row with id ending `-option-standard`
   or `-option-premium` (React's `useId` prefix varies; never match the
   localized aria-label). Its `.option` rows, in DOM order: ids ending
   `-option-<value>` for exactly the `options` of item 2 in that order,
   `.label` texts the labels — `Fish-cloud`, `Kokoro`, `Premium`,
   `Standard`; no row ending `-option-local`; the `selected` class on the
   row of `selectedTier`; the trigger's text the selected entry's name.
   Zotero's `checked` gutter and the ♥ column (favorite-marks) are
   unaffected. Close the dropdown with Escape.

### 3. A pick, and each provider's own memory

4. A pick on a **paused** player is a prepared handoff (issue #108,
   `read-aloud/voice-switch.ts`): `selectTier` and `selectVoice` run as a
   preview, the manager keeps its current tier and voice, and the switch
   lands when playback resumes. So every pick below is followed by
   `manager.play()` (muted), a poll of up to 15 s for `selectedTier` /
   `selectedVoiceID` to reach the pick, then `manager.pause()`; on an idle
   manager (no session) the picks apply at once, since the handoff wraps
   an active one only. Set `zotero-tts.readAloud.sameForAllDocuments`
   **false** for this item (snapshot, restore): on, the pick's voice would
   spread to every other open tab's session. `manager.selectTier('kokoro')`
   (the dropdown's own onChange), resumed → `manager.selectedTier`
   `kokoro`, `manager.voices` all `local::…` ids, `manager.languages`
   Kokoro's, `voicesForLanguage` only Kokoro voices;
   `reader.readAloudVoices.<lang>.tierVoices` ends with the key `kokoro`
   naming the voice resolved. Pick a second Kokoro voice with
   `selectVoice('local::…')`, resumed; then `selectTier('fish')`, resumed →
   a Fish voice, `tierVoices` `{ …, kokoro: <the second Kokoro voice>,
   fish: … }` with `fish` last; `selectTier('kokoro')`, resumed → **the
   second Kokoro voice comes back** (`selectedVoiceID` equals it): the
   per-provider memory. Labels: every `voicesForLanguage[i].label` carries
   no `Kokoro-` / `Fish-cloud-` prefix (`af_bella`, `Dax — Casual US male
   (EN)`). Measured 2026-09-15 on 1.12.10-beta3: a `selectTier` read back
   600 ms later on a paused player still showed the old tier, as this
   describes; the manual replay of `selectTier`'s body (no wrapper) held.
   On beta3 the last step then landed on the tier's **first** voice: Zotero
   reads `tierVoices` off `_persistedVoices`, which it refreshes only when
   a popup opens (reader.js:82359, 84170-84176), so within one session its
   own Standard and Premium forget the same way. Since beta4 the selectTier
   hook refreshes the entry first; the second voice coming back is the
   proof, and the debug log carries `provider tiers: each entry's own
   memory follows the reader's state` once per attached tab.

### 4. A selection no voice carries

5. Direct: with the popup on Kokoro, from chrome scope set
   `manager._selectedTier = 'azure'` (a key no listed voice carries) and
   call `manager._resolveVoice()` → `providerTiers()` for that reader:
   `selectedTier: "kokoro"`, `lastMove: { from: "azure", to: "kokoro",
   by: "remembered" }` (the entry's `voice` is the Kokoro voice; with
   the entry's voice not listed and `readAloud.memory` naming a Fish
   voice, `to: "fish", by: "default"`; with neither listed, `to` the
   first entry of `options`, `by: "first"`); the log line `the player's
   entry azure has no voices any more; moved to kokoro (remembered)`.
   `manager.voices.length` > 0 afterwards — never the stranded 0.
6. Between two opens, with `zotero-tts.readAloud.sameForAllDocuments`
   set to `false` for this item (snapshot, restore): the popup on Kokoro,
   close it, set `zotero-tts.local.enabled` false, reopen → the list
   lands without Kokoro; `lastMove.from` `kokoro`, `selectedTier` the
   rule's target, `options` without `kokoro`; the dropdown's rows
   (item 3) agree. Switch the provider back on and reopen → `kokoro`
   listed again. With the switch left **on** instead, memory-sync's
   substitute (#35) stages the manager before the list lands and
   `lastMove` stays as it was while `selectedTier` follows the substitute
   — the correct outcome there, not a FAIL.

### 5. The voice browser's first column

7. Settings → Zotero-TTS: `#ztts-voices-tiers` children read `<Name> (N)`
   for **every enabled provider** — `(0)` for one that lists nothing,
   e.g. Fish-cloud with the key removed for the check — plus
   `Premium (N)` and `Standard (N)`, sorted by name (Han by pinyin first:
   `标准 / 高级 / 系统` before the Latin names in zh-CN); the selected
   column is the default voice's provider (`readAloud.memory`'s voice), the
   language column that entry's languages, the rows without prefix.
   `diagnostics.defaultVoice()` → `opensOn.tier` the provider key of the
   memory's voice (`kokoro`), `status` of the shape `Default voice: Kokoro
   | English (United States) | af_bella | 1.7×`. `diagnostics.languageColumn()`
   → per reader `tier` a provider key and `same: true`.

### 6. Reload and dispose

8. `zotero_plugin_reload` (or an in-place reinstall of the same xpi) with
   the fixture's popup open: no `can't access dead object` in the errors;
   afterwards `providerTiers()` reports the fixture tab `resolveShadow`
   `createElementWrapped` and `tierMemoryHook` true again, `diagnostics.patches().providerTiers`
   `live` equal to `total`; close the fixture tab → the next
   `patches()` shows `live` down by 2 while `total` stays until the next
   attach compacts the log (proto-patches.ts; measured 2026-09-15:
   `live` 6 → 4 within 1.3 s, `total` 6), no error logged.

### What the run may touch, and what only a human can judge

Prefs, snapshot and restored byte for byte, `readAloud.memory` last:
`extensions.zotero.reader.readAloudVoices` (the fixture's `en` entry is
rewritten by every pick), `zotero-tts.readAloud.memory`,
`zotero-tts.readAloud.volume`, `zotero-tts.readAloud.sameForAllDocuments`
(item 6), `zotero-tts.local.enabled` (item 6), the two WebDAV sync
switches if they are on. The fixture item, erased in a call of its own.
Budget: a few short readings of the second provider and a few Fish cloud
syntheses (item 4 resumes after every pick), muted. A human judges the dropdown's look — the entry names' widths, the
trigger's text, the Han sort as rendered — and that a pick in the
dropdown sounds like the provider named.
