# Official Standard/Premium #95 handoff follow-up

This scratch run is research for issue #95 on the installed Zotero-TTS
1.12.6-beta build. It uses `test/fixtures/fixture-a.pdf` as a disposable
reader, removes a pre-existing ReaderTab native-interface test stub only while
the fixture is opened, mutes volume, disables every provider and sync path, and
restores the exact baseline in `99-cleanup-restore.js`. Standard and Premium
requests are explicitly authorized and bounded to one adjacent same-language
pair per tier. No user document is played or changed.

Run order:

1. `00-baseline-redacted.js`
2. `01-mute-disable-providers.js`
3. `02-remove-native-test-stub.js`
4. `03-open-fixture.js`
5. `04-spec-standard.js`, `05-start-handoff.js`, `06-poll-handoff.js`, `07-capture-handoff.js`
6. `04-spec-premium.js`, `05-start-handoff.js`, `06-poll-handoff.js`, `07-capture-handoff.js`
7. `08-cross-tier-entrypoint.js`
8. `09-close-fixture.js`, `10-restore-native-test-stub.js`, `99-cleanup-restore.js`

The `04-spec-*` scripts select two actual voices in the current language pool.
The start script sends trusted Shift+Space and Shift+. inside the fixture, then
records target controller creation, target readiness, native timing arrays,
prepared play offsets, old-source stop scheduling, and diagnostics. Manual tier
selection in the cross-tier script is reported separately from a prepared
shortcut handoff. `evidence.json`, `report.md`, `cleanup.json`, and
`script-status.json` are written after the run; they contain no secrets or raw
preference values.

Execution status is updated as each script runs. A revised script is marked
pending until that exact file is executed.

This run executed `99-cleanup-restore-executed-rev1.js`; the current
`99-cleanup-restore.js` is a revision 2 prepared for future reuse that writes
the final status before serializing `cleanup.json`, and was not re-run after
the revision. See `script-status.json` for the complete executed/pending list.
