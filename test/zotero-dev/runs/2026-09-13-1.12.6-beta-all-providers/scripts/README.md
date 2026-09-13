# All-provider voice-handoff research scratch

These files are the retained scripts for the authorized issue #95 provider
investigation. The executed/pending status is recorded in `script-status.json`;
the status was updated as the run progressed. They use `test/fixtures/fixture-a.pdf`
as a disposable item, mute the plugin volume, disable position/settings sync while
testing, and retain the raw provider timing arrays only in the privileged runtime
snapshot. No credentials or raw preference snapshots belong in this directory.

Run order for a fresh provider configuration:

1. `00-baseline-redacted.js`
2. `01-config-summary.js`
3. `02-disable-sync-and-mute.js`
4. Set a mode with `03-mode-all-configured.js` or `03-mode-chatterbox-fish.js`.
5. `04-apply-config.js`
6. `05-open-fixture.js`; use `06-wait-catalog-window.js` only when the catalog
   needs another bounded window (it was not needed in this run).
7. Set one `07-spec-*.js`, then `08-start-handoff.js`.
8. Run `09-poll-handoff.js` in bounded windows until `COMPLETED`, `FAILED`,
   `CANCELLED`, or an explicit provider failure is recorded.
9. `10-capture-handoff.js`, `11-close-fixture.js`; repeat from step 3 for the
   next mode or pair.
10. `14-save-evidence.js` writes the sanitized report and full timing evidence.
11. `99-cleanup-restore.js` restores every baseline value and deletes the runtime
    snapshot.

The first 2.7-second revision of `08-start-handoff.js` was attempted for
Speechify and Fish Speech and is recorded as a harness timeout; the saved file
is the later activation/resume revision with a 6.3-second start window, used for
the successful retries and all later cases.

The expected handoff result is a committed word boundary when both sides have
usable timestamps and the target is ready before the current segment advances;
sentence fallback is expected for wordless providers or a target that misses the
current segment. Official Standard/Premium tier changes are recorded separately
as native manual selections and are never labeled as #95 shortcut handoffs.

## Archive status

The first pass completed 22 plugin-provider handoff cases and two official-tier
service probes. See [the run report](../report.md)
and its script-status.json and cleanup.json for execution and restoration status.
The [official-tier scripts](official-followup/README.md) and
[follow-up report](../official-followup/report.md)
record successful Standard and Premium same-tier word handoffs. This directory
also retains unused preparation scripts and superseded revisions, explicitly
distinguished by script-status.json; their presence is not a PASS claim.
