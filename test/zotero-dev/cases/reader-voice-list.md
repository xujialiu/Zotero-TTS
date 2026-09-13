[Checklist index](../README.md) · [Scripts](../scripts/reader-voice-list/README.md)

## The player's voice list

What a reader lists, and a provider that hangs while it lists.

Items 3.1 and 3.3 of the checklist, under their original numbers.

### 3.1

1. **The reader's list.** With the popup closed — on a tab whose popup
   has been opened and closed once, never before the first open: a bare
   `_prepareReadAloud()` there leaves the player unrendered for the tab's
   life (rulebook step 5; reader.js:83565-83569, measured 2026-09-05) —
   `_prepareReadAloud()` and poll `allVoices`: under favorites-only exactly the favorites per
   tier, no others; `diagnostics.systemVoices()` → Zotero's own system
   voices hidden (`hid N system voices` in the log; 191 on this Mac, 9
   on Windows);
   `diagnostics.multilingualFirst()` → `mulLabel` with the leading space;
   `manager.speed` the memory's speed.

### 3.3

3. **A provider that hangs at the open** (issue #55, 1.10.13). Start a
   listener that accepts every connection and never answers (a Python
   `socket` that `accept`s and holds — port 8899 on 2026-09-06), point
   `local.baseURL` at it with the Local engine and one answering
   provider enabled (Azure, or the System voices), the memory naming a
   voice of the answering one, favorites-only off; on a tab whose popup
   was opened and closed once, `_prepareReadAloud()` with the popup
   closed, `_allVoices` polled in ≤7 s windows against a start time kept
   on a chrome global. Expected — the mechanism: the list lands **about
   15 s** after the call (`PROVIDER_LISTING_TIMEOUT_MS`,
   `src/read-aloud/catalog.ts`), never 30; it holds the answering
   provider's voices and no `local::` id; `selectedVoiceID` stays the
   memory's voice and is never a Zotero id at any sample; the error
   store gains exactly one `local: listing voices failed: no voice list
   within 15 s` (matched with that prefix — the system-voice migration's
   error ends the same way) and no `Listing the plugin's voices took
   longer than 30 s`; the listener says whether the peer closed the
   connection at ≈15 s (the abort reaching the socket; recorded either
   way). Before the fix the union's 30 s cap dropped every provider's
   voices and Zotero resolved a Standard or Premium one. Then the memory
   on `local::am_puck`: the substitute is a voice of the answering
   provider (item 3.2's order), the `is not offered here. Reading with …`
   toast, the memory unchanged. The pane's voice browser leaves `Listing
   voices…` at ≈15 s on a cold catalog with the answering providers'
   rows and no `Listing voices failed` (about 4 s when a reader's
   listing minutes earlier already cached the answering providers — its
   own Local listing is still aborted at 15 s, 2026-09-06);
   `diagnostics.defaultVoice()` — started in one script,
   its stored promise awaited in a later one — reports `problems: []`.
   The toast's text is read from the chrome document (a 5 s transient
   the bridge's round trip outlasts — seeing it is a human check); it
   names the missing voice by its id (`local::am_puck`) when the whole
   provider is skipped, since no listed voice carries its label, and it
   is said once per popup open per `missing>instead` pair. Restore
   `local.baseURL` and the memory, stop the listener. Measured
   2026-09-06 on 10.0.2-beta.7, 1.10.12-beta, three providers answering
   (Azure 691, Chatterbox 28, a remote Kokoro 68; N 2267): the list
   landed as 2199 = 1480 Zotero + 691 + 28, `diagnostics.defaultVoice()`
   settled at 15065 ms and the pane's status line at 15326 ms, the
   listener saw every connection closed by the peer at 15.00–15.50 s,
   the error at +14663 ms of the listing, seven `local:` lines for
   seven listings and no 30 s line; the substitute was
   `azure::en-US-AndrewNeural`, the first en-US favorite by label.
