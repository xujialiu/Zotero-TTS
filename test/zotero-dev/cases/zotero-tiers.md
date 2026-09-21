[Checklist index](../README.md)

## Zotero's Standard and Premium behind switches of their own (issue #111, 1.12.11)

The settings pane's **Zotero** section (last of the provider sections)
holds two independent switches, **Standard** and **Premium**, both on to
begin with. A tier switched off is hidden — gone from the player's first
dropdown, the voice browser's first column and the language dropdown — not
greyed; nothing Zotero remembers is touched, and switching it back on
brings the tier's last voice per language back. Enable checks first, as a
provider's does: a Zotero sync account is signed in and the tier lists at
least one voice; Test connection reports the voices and the credits.
Without a signed-in account an off tier's Enable is greyed, the reason on
its line, and follows a sign-in at once (issue #130, items 10-11). The
two entries read `Zotero Standard` / `Zotero Premium` (zh-CN `Zotero 标准`
/ `Zotero 高级`) in the player and the browser. Mechanism: the composite
remote interface drops a hidden tier's key from Zotero's own `getVoices`
answer before anything reads it (`src/read-aloud/remote-interface.ts`,
`withoutTiers`), and `buildTierOptions` drops any of Zotero's options
without voices (`src/read-aloud/provider-tiers.ts`); the switches are
`<section>.enabled` prefs, `zotero-standard.enabled` /
`zotero-premium.enabled`, wired by `ui/provider-rows.ts` like a
provider's (`src/ui/zotero-tier-check.ts` is the check).

Run the baseline first. Fixture: `fixture-a.pdf` as a standalone
attachment, opened, its popup opened muted (`readAloud.volume` 0 for the
run). **No player may be open** while a switch is used — the reading guard
refuses both directions (item 6), so the owner's paused player must be
closed before the run, and the run's own fixture tab closed or stopped
before each switch. **Read the popup's state only once it has settled**:
right after a popup opens, `providerTiers()` can still show
`buildTierOptions`' nothing-has-voices fallback while the plugin's
catalog (Fish's 339-voice listing) is loading — poll until `tiers` and
`options` stop changing, up to 6 s (the kit's every open does). Expected
values below were derived from `src/` and corrected by the first run
(`scripts/zotero-tiers/README.md`).

1. **The section.** Settings → Zotero-TTS: the groupbox
   `ztts-zotero-section` is the last provider section, right after
   `ztts-provider-system` and before the voice browser, its `h2` `Zotero`
   (plain text, no link); a `description[data-l10n-id="ztts-zotero-note"]`
   with a `?` (`ztts-help-zotero`); then two hboxes
   `ztts-provider-zotero-standard` and `ztts-provider-zotero-premium`, each
   a `label` reading `Standard` / `Premium` (zh-CN `标准` / `高级`), a
   button `ztts-enable-zotero-<tier>` reading `Disable` while the pref
   `zotero-tts.zotero-<tier>.enabled` is `true` (both by default) and
   `Enable` when it is `false`, a button `ztts-test-zotero-<tier>` `Test
   connection`, and a `description#ztts-test-result-zotero-<tier>`. The
   pane's groupboxes stand Azure · Cloudflare Workers AI · Fish Audio ·
   Fish Speech · Kokoro-FastAPI · OpenAI · Speechify · System voices ·
   Zotero (#112), 17 groupboxes in all with the eight that follow.
2. **The check, headless.** `Zotero.ZoteroTTS.diagnostics.zoteroTiers()`
   (async) → `feature: "zotero-tiers"`, `switches: { "zotero-standard":
   true, "zotero-premium": true }`, `hidden: []`, `signedIn: true` (the
   owner's profile syncs), `checks["zotero-standard"]` = `{ ok: true,
   message: "Signed in: N Standard voices, M credits remaining." }` with N
   ≥ 1 (28 Standard and 1452 Premium voices at 1.11.0) and M a number with
   the locale's grouping (`1,234`), or `"Signed in: N Standard voices."`
   when Zotero answers no figure; `checks["zotero-premium"]` the same for
   Premium. **Test connection** beside Standard writes the very same
   message into `ztts-test-result-zotero-standard` (`Testing…` first).
3. **Off hides the tier.** No player open. Click **Disable** beside
   Standard → the pref `zotero-tts.zotero-standard.enabled` `false`, the
   button reads `Enable`, the result line is blank; `#ztts-voices-tiers`
   loses `Zotero Standard (N)` and keeps `Zotero Premium (N)`; the voice
   browser's status line names a default voice as before. Open the
   fixture's popup: `diagnostics.providerTiers()` → `hidden: ["standard"]`,
   the tab's `tiers` without `standard` (with `premium` and every enabled
   provider), `options` without a `standard` entry, a `premium` entry
   labeled `Zotero Premium`; `manager._allVoices` walked **by index** has
   no voice with `tier === 'standard'`; no language that only Standard
   voices covered is left — compare the set of `_allVoices[i].language`
   (by index; the field the manager's voice objects carry) with both on
   against the set with Standard off: every language lost is one only
   Standard voices had (`[]` on the owner's profile, where Fish covers
   them all). Not `manager.languages`: that is the selected tier's list,
   not a union.
   `diagnostics.zoteroTiers()` → `switches["zotero-standard"]: false`,
   `hidden: ["standard"]`, its check still `ok: true` (the check asks
   Zotero, not the switch).
4. **A hidden selection moves.** With both on, in the fixture's popup pick
   `Zotero Standard` in the first dropdown and a voice under it, pause,
   close the popup and the tab; Disable Standard (item 3's way); reopen
   the fixture and its popup → `diagnostics.providerTiers()` →
   `selectedTier` ≠ `standard`, the player on a listed entry with a voice
   selected, `voices.length > 0`; `lastMove` stays `null`: a stopped
   session carries no `_selectedTier` into the next resolve, so the
   stranded rule never fires — Zotero's own restore finds the Standard
   voice gone (the hide runs before it looks) and lands elsewhere by
   itself, with the #35 substitute planned against the list. The stranded
   rule itself is exercised by `cases/provider-tiers.md` item 5.
5. **On brings it back, with its memory.** No player open. Click
   **Enable** beside Standard → the button reads `Checking…`, the result
   line `Checking…`, then the pref `true`, the button `Disable`, the
   result line item 2's message; `#ztts-voices-tiers` lists `Zotero
   Standard (N)` again. Open the fixture's popup and pick `Zotero
   Standard` → `manager.selectedVoiceID` is the id picked in item 4 (the
   entry's memory in `reader.readAloudVoices` was never written by the
   hide), and `manager.languages` is the full list again.
6. **The reading guard.** With the fixture's popup open (paused is
   enough): **Disable** beside Premium → the guard's dialog names the tab,
   the pref stays `true`, the button stays `Disable`; Stop and continue
   (#71) stops the player and the switch goes through, as for a provider.
   Restore: Enable Premium (item 5's way).
7. **Everything off.** No player open. Disable both Zotero tiers and every
   enabled provider (note which were on; the pref names are
   `zotero-tts.<id>.enabled`) → the voice browser's status line
   (`#ztts-voices-status`) reads `No provider is on: enable one above.`
   (zh-CN `没有打开任何服务商：请在上方启用一个。`) and `#ztts-voices-tiers`
   is empty. Open the fixture's popup → `diagnostics.providerTiers()` →
   `tiers: []`, `options` = Zotero's own three as it built them, every one
   `disabled: true` (`Zotero Standard`, `Zotero Premium`, `Local`), the
   player's voice list empty, no error in the ring. Restore every switch
   (the providers through their Enable buttons, so the checks run; a
   provider that fails its check now stays off and is reported).
8. **Backup and restore.** Settings → Backup → the backup JSON holds
   `"zotero-standard.enabled": true` and `"zotero-premium.enabled": true`
   (`createBackup` flattens every setting); a restore of a file with
   `"zotero-standard.enabled": true` written while the switch is off runs
   the check on that row (`Checking…`, then item 2's message) before it
   goes on — the same round as a provider's (#21). Optional: the unit
   tests cover the flattening; run it only if item 5 left time.
9. **After a reload.** In-place reinstall of the same xpi with the fixture
   tab open (the harness's step) → item 3's `hidden` and the dropdown hold
   on the surviving tab, the section's switches read as the prefs say, no
   new dead-object line.

10. **Signed out, Enable is greyed (issue #130).** The settings pane
    open, no player open. Disable Standard (item 3's way): a tier that is
    on keeps a pressable Disable. Then, in chrome scope, keep
    `Zotero.Sync.Data.Local.hasCredentials` and replace it with
    `() => false` — an own property of that object, and what
    `Zotero.Sync.Runner.enabled` reads — and fire
    `Zotero.Notifier.trigger('modify', 'api-key', [])`, the notification
    Zotero sends once a login is saved or removed → `ztts-enable-zotero-standard`
    `disabled: true`, label `Enable`; `ztts-test-result-zotero-standard`
    `Not signed in to a Zotero account: sign in under Settings → Sync.`
    (zh-CN `未登录 Zotero 账户：请在 设置 → 同步 中登录。`);
    `ztts-enable-zotero-premium` `disabled: false`, label `Disable`, the
    same reason on its line; both `ztts-test-zotero-<tier>` `disabled:
    false`. A `command` event dispatched at the greyed button → no
    `Checking…`, the pref stays `false`. `diagnostics.zoteroTiers()` →
    `signedIn: false`, both checks `{ ok: false, message: <the reason> }`.
    The notification also reaches Zotero's reader, which sets every tab's
    `loggedIn` from the same flag (`providerTiers()` `signedIn: false`
    everywhere), and Zotero's streamer, which re-reads its key.
11. **Signed in again, at once.** Put `hasCredentials` back (assign the
    kept function) and fire the notification again → Standard's Enable
    `disabled: false`, both result lines empty, every tab's `signedIn`
    `true` again. Enable Standard (item 5's way): `Checking…`, then item
    2's message and `Disable`.

What it may touch: `zotero-tts.zotero-standard.enabled`,
`zotero-tts.zotero-premium.enabled` (both back to `true`), the provider
switches of item 7 (back to what they were, through Enable), the fixture
tab and its popup, `readAloud.volume` (0 for the run, restored); for
items 10-11 only, `Zotero.Sync.Data.Local.hasCredentials` (the kept
function assigned back) and two `api-key` notifications, which leave
every tab's `loggedIn` as it was. Zotero's
`reader.readAloudVoices` is read, never written by the kit: item 4's pick
writes it through the player, as any pick does.

Only a human can judge: nothing here — every item is a diagnostic or a DOM
read. Only a human can see whether the section's `?` tooltip and the two
rows read well beside the other sections; a screenshot is enough.

Not testable live on the owner's profile: a real sign-out, which is not
the kit's to do — items 10-11 stand in for it by the flag
`Zotero.Sync.Runner.enabled` reads, and `test/ui/zotero-tier-check.test.ts`
and `test/ui/provider-rows.test.ts` cover the outcome and the greyed
button. A tier that Zotero lists no voices for cannot be provoked either;
the first of those tests covers the message.
