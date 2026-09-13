# Manual follow verification scripts (issue #100)

Run through the Zotero bridge under the tester workflow. These scripts
were executed on disposable PDF and EPUB readers; inspect each script's
setup before reuse. Reader identifiers and geometry are run-specific.
Scripts communicate through temporary `Zotero.__ztts100` and
`Zotero.__ztts100Baseline` state, and are not independent commands.

## Beta2

[Executed-script manifest](beta2/artifact-manifest.md) and
[sanitized report](../../runs/2026-09-13-1.12.6-beta2-manual-follow/observed-report.md).

- Start with `01-baseline-snapshot.js`; record preference user-value flags,
  player/bookmark/view state, settings/tab state and existing errors before
  any fixture or transport changes. Never retain credential snapshots.
- `03` prepares temporary transport/audio state; `04` imports fixtures;
  `05` through `13` establish readers, real audio and the setting UI.
- `16` and `19` exercise PDF partial/full disappearance in both modes;
  `21`/`22` cover scrolled EPUB and `23`/`24`/`27` paginated navigation.
  Trusted wheel provenance plus controlled positional movement is not
  natural wheel or smooth-animation evidence.
- `35` through `44` cover legacy disengagement, resume, mode changes and
  explicit return. `51` requires actual audio-clock/position progression.
- `57` closes fixtures, `58` erases their items, `60` restores preferences
  and original user-value flags, and `63`/`64` audit the restored reader
  and position store. Always adapt cleanup to the current fixture IDs;
  never erase a baseline user item. Restore transport switches last.
- `65` is a read-only console query retaining the two teardown exceptions.

Expected default-on behavior: recognized navigation sets `interacting`,
suppresses automatic movement while held, retains following for any
visible sentence fragment, and disengages on complete disappearance.
Off immediately disengages. Explicit return restores following; ordinary
resume, preference changes and automatic scroll notifications do not.

The manifest distinguishes unsuccessful/timeout or superseded attempts.
They are evidence of the harness history and are not successful test
recipes. The beta2 pass stopped on two teardown exceptions; the report
retains that failure and the pending input/geometry/visual cases.

## Beta3

[Combined-build report](../../runs/2026-09-13-1.12.6-beta3-manual-follow/observed-report.md)
and [executed-script manifest](../../runs/2026-09-13-1.12.6-beta3-manual-follow/artifact-manifest.md).
The manifest identifies reused beta2 scripts. Beta3-specific scripts are
in `beta3/`, including setting EPUB flow before opening its player and
cleanup of the extra setup fixture. Preserve the fresh baseline before
running either setup route; do not substitute the historical item IDs.

Both formats/modes passed the controlled fragment checks and the final
fixture-close route produced no new dead-object messages. Trusted
Shift+Enter/PageDown routing, drag/pan inputs and real cross-page/oversized
geometry remain unverified through this bridge. Direct explicit locking
passed; it does not prove the shortcut route. The report separately
retains an early EPUB-flow setup error and native navigation-away noise.

## Beta4: automatic recovery on reentry

[Report and raw returns](../../runs/2026-09-13-1.12.6-beta4-manual-follow/report.md).
Scripts are in `beta4/`; they use a fresh baseline and disposable fixtures.
The current user reader state must be read anew, not copied from beta3.
Run 01/03/04 for baseline/temporary transport/fixtures, then the PDF and
EPUB readiness scripts before opening players. The 06b retry waits for
EPUB page mapping; it does not justify opening the player early.

Scripts 12–15 exercise repeated out-of-view waits and automatic partial
reentry in PDF/scrolled EPUB, both modes. Script 19 covers paginated
semantic navigation, 20 the disabled legacy rule, and 21/22 controlled
sentence transitions. A controlled transition is not natural audio:
the fixture AudioContexts did not advance during this pass.
Scripts 23–28 close fixtures, restore original state and audit it; the
corrected 26b/28 steps are the final restoration record. Adapt fixture
identifiers and all baseline state before reuse, and preserve the
original snapshot across retries.

## Final merged installation

The `merged-beta/` scripts use a fresh `Zotero.__ztts127Baseline` and
verify [1.12.7-beta](../../runs/2026-09-13-1.12.7-beta-manual-follow/report.md).
They cover identity/startup, reentry help and upstream bracket controls,
one PDF and one scrolled EPUB out/wait/back cycle, then fixture removal
and state restoration. This intentionally supplements the beta4 matrix
without claiming that natural playback or every gesture was reverified.
