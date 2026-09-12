# 3e. Open the player expanded (issue #81)

Status: **core live checks and focused follow-up completed** on 1.12.3-beta. See the
[measured results and cleanup incidents](../runs/2026-09-12-1.12.3-beta/issue-81.md).
The checklist below states expectations; a pending row in that report
must not be counted as a successful check.

Run section 0 first, then this section and cleanup. Use PDF and EPUB
fixtures, two tabs, and a separate reader window. Preserve the user's
`readAloud.openExpanded` preference (including whether it has a user value),
voice, speed, positions, and original player states. Restore them afterward.
Do not enable WebDAV sync just to test this setting.

The sandbox diagnostic is
`JSON.parse(Zotero.ZoteroTTS.diagnostics.playerExpanded())`. Match its
reader index and window/tab identity to titles for the report. Never use
`itemID` alone: one attachment can be open in both a tab and a window.
`attached` must be true on each reader;
after successful automatic expansion expect `enabled: true`, `popup: true`,
`ready: true`, `expanded: true`, `clicked: true`, `pending: false`, and
`outcome: "expanded"`. An already expanded native popup needs no click.

1. **Default off:** open a player through the toolbar and the normal start
   shortcut. Expect ordinary collapsed behavior and `clicked: false`.
2. **Opt in:** enable *Open the player expanded* under Reading. Existing
   players stay as they were. Close and reopen: expect the successful
   diagnostic above in PDF, EPUB, another tab, and a separate window.
3. **Manual folding:** fold using the Options button and `Shift+O` in
   separate openings. Expect `ready: true`, `expanded: false`, and no
   second automatic click. Closing and reopening expands again.
4. **Settings changes:** disable while expanded; the existing player stays
   expanded and the next opening uses Zotero's default. Enabling while
   collapsed leaves that player alone. Switching off during initialization
   releases the visibility gate immediately.
5. **Lifecycle:** cover a newly created reader and a tab open during plugin
   installation. Installation leaves an already-present popup alone;
   later openings expand. Closing readers and disabling the plugin remove
   their observation, timers, stylesheet, and ready markers.
6. **Playback:** opening keeps Zotero's normal activation behavior. Options
   initialization must not change voice, speed, pause state, or the audio
   controller. Native low-quota reminders must still expand their controls.
7. **Failure recovery:** an absent Options button, a throwing click, a
   click that never commits, and a document access failure are covered by
   unit tests. Live fault injection requires a disposable fixture and a
   restoration plan. Expect a visible ordinary player and an error, never
   indefinite hiding. A noncommitting click times out after 1,000 ms while
   the event loop runs.
8. **First visible frame:** a final expanded screenshot is insufficient.
   Verify the stylesheet is installed before popup creation, and sample
   computed visibility and expanded state around actual popup openings.
   Every visible sample before timeout should be expanded. Separately ask
   the user whether a collapsed flash or an unacceptable delay is visible;
   the timing experience is a human check, not a diagnostic claim.

Settings default, backup/restore, and sync eligibility are automated
checks. Actual methods: [first pass](../scripts/player-expanded-first-pass/README.md)
and [follow-up](../scripts/player-expanded-follow-up/README.md). Their reuse
instructions identify fixed fixture IDs and the confounded exception test.
