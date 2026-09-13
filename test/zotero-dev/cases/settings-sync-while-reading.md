[Checklist index](../README.md) · [Scripts](../scripts/settings-sync-while-reading/README.md)

## Synced settings wait while a tab reads (issue #68, 1.11.7)

Runs on the setup of [settings sync](settings-sync.md): the same WebDAV
folder, shared file, `webdav.syncState` handling and crafted items. Any open
Read Aloud player in any tab, paused included, defers every provider-section
item: a player stays open for the first half of the check, and none may be
open for the second. Item 1.16 supersedes 6.16: the same behavior, measured
on 1.11.7-beta5.

Items 1.16 and 6.16 of the checklist, under their original numbers.

### 1.16

16. **While a tab reads, the player's settings wait.** With a Read Aloud
    player open in any tab (paused counts; `popupOpen` alone counts), a
    sync carrying a newer provider-section key (`azure.voice`) and a newer
    shortcut reports `lastOutcome "deferred"`, `adopted 1`, `deferred 1`,
    `pushed 0`, `uploaded false`: the shortcut pref is written, the
    provider key is not, and `lastApplied.applied` names only the shortcut
    with `from ["tester"]`; the settings line ends with `1 more wait until
    the reading stops.` Pushing is never deferred. Once no player is open
    anywhere, the next trigger applies the voice (`adopted 1`,
    `lastApplied.applied ["azure.voice"]`) and the provider's check runs
    and passes (`state.held` stays `{}`, the log line carries no `held
    azure`) — measured 2026-09-10 on 1.11.7-beta5: a crafted `azure.voice`
    (`zh-CN-XiaoyiNeural`) reported `deferred 1` / `adopted 0` at a
    pane-open trigger with the fixture's player open and paused, and
    applied at the `reader-close` trigger that closed it, the sync settled
    `ok` within ~5 s.

### 6.16

16. **While a tab reads, the player's settings wait.** With a Read Aloud
    player open in any tab (paused counts; `popupOpen` alone counts), a
    sync carrying a newer provider-section key (`azure.voice`) and a newer
    shortcut reports `lastOutcome "deferred"`, `adopted 1`, `deferred 1`,
    `pushed 0`: the shortcut pref is written, the provider key is not, and
    `lastApplied.applied` names only the shortcut; the status line appends
    `1 more wait until the reading stops.` Pushing is never deferred. Once
    no player is open anywhere, the next trigger applies the voice
    (`adopted 1`) and the provider's check runs and passes (`state.held`
    stays `{}`) — the second half is unmeasured as of 2026-09-10.
