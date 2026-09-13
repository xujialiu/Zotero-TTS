# Manual follow beta2 scripts (issue #100)

[Executed-script manifest](artifact-manifest.md) and
[sanitized report](../observed-report.md).

Run through the Zotero bridge under the tester workflow. These scripts
were executed on disposable PDF and EPUB readers; inspect each script's
setup before reuse. Reader identifiers and geometry are run-specific.
Scripts communicate through temporary `Zotero.__ztts100` and
`Zotero.__ztts100Baseline` state, and are not independent commands.

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
