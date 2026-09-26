# Independent document voices (issue #146)

[Scripts](../scripts/document-voices/README.md)

Run the baseline first. Isolate both plugins' WebDAV destinations with the
dedicated test configuration before installation or state changes. Privately
snapshot the global default, migration marker, legacy voice/speed memory,
document voice branch, native voice entries, sync state, favorites and
provider settings. Use fixture attachments only. Clear test-created voice
records and restore snapshots before restoring automatic sync or backup.

The mechanism diagnostic is
`JSON.parse(Zotero.ZoteroTTS.diagnostics.documentVoices())`: `defaultVoice`,
validated `records`, and each reader's `key`, `saved`, `selected`, `active`,
and `paused`. No credentials are included. Verify the installed beta's
bundle includes this diagnostic, not just its version string.

1. **Initial copy.** Choose voice A in settings and open two fixture
   attachments without starting audio. Both records name A with
   `manual: false`. A PDF and an EPUB under one parent have distinct keys.
2. **Default independence.** Choose B in settings. Both old records still
   name A; a newly opened fixture starts with B. The settings highlight
   names B. The retired shared-voice switch is absent.
3. **Document pick.** Pick B in the first fixture's player (exercise the
   real voice dropdown and a voice shortcut). Its record becomes manual;
   the other fixture and global default stay unchanged. Test a same-value
   pick too: manual intent must be recorded even when native prefs do not
   change. A handoff preview must not write until the choice commits.
4. **Persistence.** Close/reopen the fixture, then reinstall the same beta
   in place. The document still selects its saved voice. Open it in a
   separate reader window and verify the same key and saved choice.
5. **Unavailable voice.** Give a fixture a valid record naming a missing
   voice. Open its player and try Play and a direct controller-creation
   path. No substitute synthesis request occurs; the saved record stays,
   a prompt asks for another voice, and a manual available choice works.
6. **No default.** With no document record and no global default, reading
   does not start on a fallback. Set a default through settings, then Play
   works and initializes the document. Restore the prior default.
7. **Sync and deferral.** On the isolated WebDAV file, introduce a newer
   manual choice for one fixture and sync while it is playing, then while
   paused. The saved record updates; the current session's selected voice
   does not. Close and reopen the player: the synced voice is selected.
8. **Merge.** Introduce a later inherited record against a local manual
   choice and an independent newer manual record for the other fixture.
   Sync retains the first manual choice and adopts the second independently.
   Verify the uploaded file retains both. Do not use the owner's server.
9. **Backup.** Export and restore settings containing the default and both
   fixture voices. They retain distinct choices and intent/timestamps.
   Old backups without these keys leave existing document voices intact.
10. **Regressions and cleanup.** Speed remains global with its switch on;
    paused/playing handoffs and speech still work. No new plugin errors.
    Restore all local records and settings, isolate test remote artifacts
    and pending writes, and only then restore original sync/backup.

Clock ties, malformed imports and migration-once rules are also covered by
unit tests. Perceptual voice quality is human-only; the live run verifies
actual selected IDs and synthesis paths.

Verified on 2026-09-26 with 1.15.2-beta2 (`30d5770`): the initial fixtures
were standalone PDF and EPUB attachments, not siblings under one parent;
attachment identity is independent of the parent in the adapter. Missing
voice and no-default checks observed no controller, no active fallback,
and unchanged Fish timing-log counts, not an HTTP request counter. Global
speed was still enabled; propagation and initial-speed migration are
covered by unit tests. The issue's closing report gives the observed
values for all ten items and the restored state.
