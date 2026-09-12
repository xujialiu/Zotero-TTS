[Checklist index](../README.md)

## 1b. Fish Audio voice sources (issue #91)

Run after the baseline with a working Fish Audio API key. Preserve the
key in Zotero only, never in a tool argument or file. Save and restore
`fish.enabled`, `fish.voices`, `fish.includeOfficial`, `fish.includeOwn`,
`fish.includeManual`, `fish.freeOnly`, remembered/default voices, and any
sync switches suspended for the run. Use one fixture and leave the owner's
reading sessions alone. Source switches and the Model IDs field are the
final scope; the earlier draft's community search is not shipped.

1. **Official source.** Empty manual field; official on, own/manual off.
   The catalog and a fresh fixture player contain the Fish Official
   account's voices plus `fish::mul/default`. The account is
   `d8b0991f96b44e489422ca2ddf0bd31d`; its live list on 2026-09-12 had 338
   unique, trained TTS voices, ten tagged `zh`, returned in four pages.
   Compare the current API's count rather than pinning 338 forever. No
   unrestricted community-discovery request belongs to automatic listing.
2. **Own and manual sources.** Test the three sources independently and
   together. With an account that owns no models, own-only gives Default.
   Enter one valid Model ID absent from the official list: manual-only
   gives it and Default; toggling manual off retains the field verbatim
   and hides the extra voice, and back on restores it. Source settings
   survive settings reload and backup/restore.
3. **Union and all-off.** Enter an official voice's ID manually, enable
   official+manual: one entry per raw model ID. Turn official off: the
   manual copy stays; turn manual off as well, with own off: only Default.
   A disabled source contributes no cached voices or stale notices.
4. **The controls.** All three source switches start on in a profile
   without their prefs. They lock while Fish is enabled and unlock after
   Disable. The three sources occupy one horizontal row with a normal-weight
   caption. Voices (Model IDs) accepts multiple IDs; Model IDs in that
   caption links to discovery, and the neighboring `?` includes
   `https://fish.audio/app/discovery/` and explains that Model ID identifies
   a voice. Existing pasted links still work. There is no separate Find
   Model IDs link or Refresh Fish list button. Enable/Disable and Test
   connection follow the three source switches at the end of Cloud;
   Local includes `github.com/fishaudio/fish-speech` in its heading.
   By eye: labels, field, and help fit the pane with no clipping; there is
   no in-plugin community search panel.
5. **Reading guard.** Enabled sources are locked and ignore synthetic
   commands. Disable retains the provider's existing reading guard: with
   the fixture's player open, it asks to stop reading. Cancel leaves the
   provider and source choices unchanged; agree closes the fixture player
   before unlocking the configuration. Never accept a dialog naming the owner's tabs;
   report that positive path as unit-tested when a protected user session
   prevents it from running live.
6. **Refresh and cache.** A repeated catalog call reuses the source
   snapshots; Enable or Test connection loads again. `diagnostics.fishVoices()`
   returns only `cacheHits`, `loads`, `cachedAccounts`. Reuse increases
   hits without increasing loads; a connection check increases loads. Turning a
   source off and on takes effect even with its snapshot cached. Await
   `diagnostics.fishVoices(true)` to list through the actual provider and
   report `sources`, `count`, `ids`, and `notices` beside the counters.
   Compare the IDs in Zotero and return counts/small samples to the tool,
   never dump the entire list. This proves filtering without starting
   playback or disturbing a protected paused reader. No key or account
   identifier is returned by the diagnostic.
7. **Synthesis.** One existing Fish voice on the free model still returns
   real word timings on the fixture. The connection check uses Default
   to verify synthesis. Only one small sample per live check; sound
   quality and the highlight's pace are human checks.
8. **Deterministic cases stay in unit tests.** Whole-operation timeout
   and transport abort, retry after a hung shared load, no late pages or
   cache overwrite, stale notice persistence across provider instances,
   auth errors/account isolation, all eight source combinations, and
   canceled source changes use controlled dependencies. Do not break the
   owner's network or replace their credentials to manufacture failures.
9. **Restore.** Restore prefs, memory last; erase the fixture, restore the
   debug store, and report byte-identical state and no new plugin or
   dead-object errors. The beta build may remain installed for the owner.

**Verified on 2026-09-12, 1.12.2-beta2 (Luna-max tester).** Startup
20/20; `(official, own, manual)` counts `000=1, 001=2, 010=1, 011=2,
100=339, 101=340, 110=339, 111=340` on an account with no own models and
one manual ID. No duplicates or notices; official/manual overlap stayed
one entry; repeated listing kept loads at 3 while hits rose 24 to 27.
Three checkboxes editable; help URL present; `blank=[]`, `questionless=[]`;
no horizontal overflow. Default connection probe: 340 voices, synthesis
works. Guard Cancel passed for source and refresh. Positive stop/refresh,
backup/restore and fresh playback stayed unit-covered because the user's
paused reader was protected. Every changed setting and reader state was
restored; Debug storing off, auto-upload restored on; no new plugin or
dead-object error. Full evidence: [2026-09-12 notes](../notes/NOTES_2026-09-12.md).
