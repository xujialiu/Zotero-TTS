[Checklist index](../README.md)

## The player without a Zotero account (issue #130, 1.14.1)

Signed out of Zotero, the player lists every enabled provider's voices and
reads with them, as signed in; only Zotero's own Standard and Premium are
left out, as Zotero itself leaves them out. Nothing changes signed in. Mechanism: Zotero asks for its remote voice list only with an
account signed in (`loadVoices(this._state.loggedIn)`, reader.js 84271),
and every plugin voice travels in it; the plugin's `loadVoices` hook asks
for that list whatever the flag says on a reader whose interface is the
plugin's (`src/read-aloud/live-voice-list.ts`), the composite interface
skips Zotero's own `getVoices` while the reader's flag says signed out
(`src/read-aloud/remote-interface.ts`, `signedIn`). Zotero's own player,
whose log-in row the plugin used to replace, is never shown since #134.

**Signed out, per tab.** The owner's profile is signed in, and signing out
is not the kit's to do. The player reads the tab's own flag, so the case
sets it on the fixture tab alone, with Zotero's own setter — the one its
`api-key` notification calls (`xpcom/reader.js` 2879-2882):
`reader._internalReader.setLoggedIn(false)`, before the popup opens, and
`reader._internalReader.setLoggedIn(Zotero.Sync.Runner.enabled)` to put it
back. Every other tab keeps its flag. That the account itself stays signed
in is what makes item 1 a proof: `diagnostics.zoteroTiers()` says
`signedIn: true` with both switches on, and Zotero's voices are still
missing from the fixture's list.

Run the baseline first. Fixture: `fixture-a.pdf` as a standalone
attachment, opened, its popup opened muted (`readAloud.volume` 0 for the
run). The checks name the providers enabled in the profile (read
`zotero-tts.<provider>.enabled`; never switch one on for the run) and
need both Zotero switches on (`zotero-tts.zotero-standard.enabled`,
`zotero-tts.zotero-premium.enabled`, `true` by default). Read the popup's
state only once it has settled: poll `providerTiers()` until `tiers`
stops changing, up to 6 s (`cases/zotero-tiers.md`). Expected
values are derived from `src/` until a run corrects them.

1. **The plugin's list is asked for, Zotero's is not.** Fixture tab
   signed out, popup opened → `diagnostics.liveVoiceList()`, the fixture's
   entry: `asked: false`, `remote: true`, `applied` one more than before
   the open. `diagnostics.providerTiers()`, the fixture's reader:
   `signedIn: false`; `tiers` = every enabled provider that lists voices
   (`fish`, `kokoro`, `system`… as the profile has them), and neither
   `standard` nor `premium`; `retagged` counts the plugin's voices under
   provider keys. The manager's `_allVoices`, walked by index, holds no
   voice with `tier` `standard` or `premium`. The debug output holds
   `[zotero-tts] Zotero's own voices not asked for: no Zotero account is
   signed in` for the open. `diagnostics.zoteroTiers()` → `signedIn: true`,
   `switches` both `true`, `hidden: []`.
2. **The plugin player shows them.** `diagnostics.pluginPlayer()` →
   `state.opened: true`, `providers` = item 1's `tiers` with their labels
   (`Fish Audio`, `Kokoro`, `System`…), no `Zotero Standard` or `Zotero
   Premium`; `provider` one of them; `voices.length > 0`; `error: null`.
3. **It reads.** Play from the player (muted) → the manager `active`,
   not `paused`, within 10 s a segment's audio from the selected
   provider: a `[zotero-tts] <provider>: N word timestamps for M chars`
   line in the debug output, no `standard` or `premium` voice in use
   (`manager._voice.tier`). Stop and close the popup.
4. **Signed in again, as before.** `setLoggedIn(Zotero.Sync.Runner.enabled)`
   on the fixture tab, popup opened → `liveVoiceList()` `asked: true`,
   `remote: true`; `providerTiers()` `signedIn: true`, `tiers` with
   `standard` and `premium` beside the providers; no `not asked for` line
   for this open. Close the popup.

What it may touch: the fixture tab's `_state.loggedIn`, through Zotero's
own `setLoggedIn` (back to `Zotero.Sync.Runner.enabled`),
`readAloud.volume` (0 for the run, restored), the fixture tab and its
popup. Nothing is written to the account or to any other tab.

Only a human can judge: nothing — every item is a diagnostic, a log line
or a DOM read.

Not testable live on the owner's profile: a real sign-out. The player
reads the tab's flag, which is what the case sets; the pane reads the
account (`cases/zotero-tiers.md` items 10-11 cover it). The first-run and
Manage voices windows, which get their interface from the same reader,
are not opened: the unit tests cover the skip.
