# A tab open across an update keeps building its voice list (issue #131)

Expected behavior from 1.14.4. The automated regression is
`test/read-aloud/live-voice-list.test.ts` ("builds the list with Zotero's
own loadVoices when an earlier instance's hook is left on the manager").
The update starts from the released 1.14.3
(`gh release download v1.14.3 -p zotero-tts.xpi`), the last build with the
bug.

Complete the baseline and test WebDAV isolation first. Open one fixture
from `test/fixtures/` in a tab of its own and open its player; keep that
tab open for the whole case. The provider switch used below is
`zotero-standard.enabled`, whose saved value and user-value state are
preserved privately and restored in a finally block.

### 1. On 1.14.3, a leftover hook freezes the tab's list

Install 1.14.3 in place and confirm `diagnostics.startup()` has no failed
step. Plant a leftover the way an earlier instance leaves one: set the tab
manager's own `loadVoices` to a reader-realm function that resolves without
touching `this` (`Cu.exportFunction`). Reinstall 1.14.3 in place, then
flip the switch off and on.

Expected: two `can't access property "length", list is undefined` errors
from `content/zotero-tts.js`, one per flip, and the tab's
`diagnostics.liveVoiceList()` entry at `applied: 0`. This is the red
state; if it does not appear, stop — the rest proves nothing.

### 2. The update to the fix repairs that tab without reopening it

Install the fix build in place over item 1's state, without closing the
tab. Flip the switch off and on.

Expected: no new `list is undefined`; the entry's `applied` counts up by
the flips; `pluginPlayer()` for the tab lists the enabled providers and
voices. The manager's own `loadVoices` is the new instance's hook, and the
class's method is Zotero's (`Object.getPrototypeOf(manager).loadVoices`,
its source starting `async loadVoices(`).

### 3. A clean shutdown leaves Zotero's own methods

Reinstall the fix build in place once more and flip the switch again.

Expected: as item 2 — no error, `applied` counts up. Between the two
instances nothing is carried: the leftover planted in item 1 is nowhere on
the manager (its own `loadVoices` and `deactivate` are the current
instance's hooks, each once).

### 4. A plain update from 1.14.3

Close the fixture tab, install 1.14.3, open the fixture and its player,
then install the fix build in place with the tab still open, and flip the
switch.

Expected: no error, the list applied, the player's dropdowns filled.

Leave the fix build installed, close the fixture tab, restore the switch's
saved state, then perform the baseline cleanup. No playback or synthesis
is necessary. A live run retains its executed kit under
`test/zotero-dev/scripts/update-open-tab-voices/`.
