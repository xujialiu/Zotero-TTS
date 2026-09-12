[Checklist index](../README.md)

## 3. The Read Aloud integration on a fixture

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
2. **A remembered default the list does not offer** (issues #35, #36,
   #37, fixed in 1.10.2). Point the memory at an unoffered voice (a
   non-favorite under favorites-only), open the popup: expected the
   manager starts on **a Local voice it does offer, favorites first**,
   a line in the reader says which, the memory keeps the default, and
   `selectedVoiceID` is never a Zotero voice (`bdd0dcc3-en-US` was the
   metered fallback before the fix). Also: a manager sitting on the
   Standard tier follows a Local `mul` pick (#36), and a popup reopened
   right after favorites-only changed applies the remembered voice
   against the **new** list (#37). Expected outputs: the fix's own
   verification on the three issues; derive the current ones from
   `src/read-aloud/memory-sync.ts`.
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
   provider (item 2's order), the `is not offered here. Reading with …`
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
4. **Playback and its mechanism.** `notifyUserGestureActivation()` +
   `toggleReadAloudPopup(true)` in one script; `active && !paused`
   within a few seconds; the log `[zotero-tts] <provider>: N word
   timestamps for M chars` per sentence (`azure`/`local` N > 0, `system`
   N > 0 on Windows; `openai: no word timestamps for M chars,
   highlighting the sentence`, and on macOS `system: no word timestamps
   for M chars (macOS voices come without word timings), highlighting
   the sentence`);
   `manager.speed` the memory's. One pick per provider through the
   popup's own path (`selectVoice`, on the voice's language), each
   speaking within 15 s; a voice with no audio in 15 s is a FAIL with
   the log. Every pick is learned: memory and Zotero's entry follow.
5. **Highlight.** While speaking, `diagnostics.highlight()` → `patched:
   true`, `sentenceSlot: "ours"`, `activeWordTimestamp: "real"` (Azure,
   Kokoro, System on Windows) or the stand-in kind (OpenAI, System on
   macOS, granularity down to `sentence`), `style` = the pane's five
   prefs; the log `highlight style
   attached to a PDF view`; a screenshot with the word in the word color
   inside the sentence in the sentence color. Since 1.11.7 every tab is
   attached at its open, before its popup: a PDF tab reads `patched:
   true, awaitingPage: false` a hundred milliseconds after it opens,
   and `patched: false, awaitingPage: true` is one whose pages are not
   rendered yet — it goes `patched: true` with its first page (section
   3c); `patched: false` alone is a tab the plugin never attached to
   (before 1.11.7 it was the normal state of a tab whose popup never
   opened). On a tab whose popup never opened the diagnostic reports
   `granularity: null`, `state: null`, logs
   `highlight: effective granularity null (method function; state
   missing)` — once, or once per call when another open reader's line
   alternates with it (the logger repeats only what changed) — and adds
   nothing to `Zotero.getErrors()`, called twice (issue #39; before the
   fix, one error per call). A fresh tab is one opened after the install
   with no other tab's speed changed since: a speed change is spread to
   every open reader and pushes a state to it — such a tab holds a state
   without ever opening its popup and reports it, `popupOpen: false`.
6. **Invisible text** (issue #15). The fixture's size-zero line never
   reaches Zotero's structured text, so this needs a real latexit PDF
   (an inline span at size zero in a transparent color): expected the
   log `skipping N chars that are not visible on the page; playing a
   400 ms pause instead` and no such segment spoken. Without that
   fixture: NOT TESTABLE, say so.
7. **Empty audio becomes a pause** (issue #42). Azure answers
   asterisk-only text (the `****` scene separators) with zero audio
   frames — a success with nothing in it, which Zotero cannot decode
   and pauses on silently, error state unset, Retry inert. With a
   session open on an Azure voice, call the controller's own path,
   `voice.provider.remote.getAudio({ text: '****' }, voice.impl)`,
   twice: expected each time an `audio/wav` blob of 6444 bytes (the
   400 ms pause) with timestamps `[{start: 0, end: 86400, charStart:
   0, charEnd: 4}]`, the log `azure: empty audio for 4 chars; playing
   a 400 ms pause instead` — the second call with `(cached)`, proving
   a stored empty original heals on the way out. Playback across such
   a separator continues into the next sentence after the pause; a
   stop there with `_error: null` is the regression.
8. **Prefetch and cache.** The log's `prefetch: <provider>: N chars
   ready ahead of playback` lines reach up to the setting plus Zotero's
   three ahead (measured 6 on a 17-segment fixture) — that is the upper
   bound: `prefetchAfter` warms exactly the setting's count after the
   segment just requested, one chain at a time, so the steady state
   while playing is `position + count` (measured 2026-09-05 with the
   setting at 5: 5, 7 and 11 ahead, all inside
   `[position + count, position + 3 + count]`); after the first
   pass every replayed segment logs `(cached)`. A skip back is answered
   by Zotero's own `_audioBuffers` before the plugin's cache — not a
   check.
9. **The reading guard** (issues #11, #71). `diagnostics.players()` →
   per reader `{itemID, open, popupOpen, active, paused, popupInDom}`;
   `open` is `popupOpen || active` (paused counts, and so does a popup
   that has not started), and `paused` is `null` while `open` is false,
   since a manager that never ran reads `paused: true`. No player open:
   every reader `open`, `popupOpen`, `active`, `popupInDom` false. A
   session in tab A (script-started and mute is fine — the guard reads
   flags, not audio): `open: true, popupOpen: true, active: true,
   paused: true, popupInDom: true`. The popup goes up before the manager
   activates (~10 ms against ~1 s on a first open), and both count.
   Each of the five refusals — a provider's Enable/Disable
   (`#ztts-enable-<id>`), *Offer only favorite voices*
   (`#ztts-favorites-only`), a ♥ while only favorites are offered, a
   restore from a file or from WebDAV — opens `#ztts-notice`, an
   `html:dialog` of the pane's own document, within ~10 ms of the
   click: children `[style, div, div, div]`, the title strip
   `Zotero-TTS`, `⚠️`, a bold lead `Read Aloud is open in a tab:` — or
   `… in N tabs:` — one `  • <item title>` line per tab, a blank line,
   then `Stopping it there lets this change through; each tab keeps its
   place, and Read Aloud picks up there when you start it again. Or
   close the player in that tab yourself, then try again.` (`those
   tabs` in the plural). The last div holds exactly two buttons,
   `["Stop reading and continue", "Cancel"]`, and
   `document.activeElement` is Cancel.
   **The buttons' box** (issue #80). Zotero's
   `chrome://zotero/skin/preferences.css` caps every button of the
   settings window at `max-height: 25px` on macOS, and its type selector
   carries no `@namespace`, so it reaches an `html:button` too. Per
   button, `getBoundingClientRect()` against a `Range` over its contents
   (`selectNodeContents`; `off` = label-box center − button-box center,
   positive is low): at the pane's 13 px font a border box of
   **23.33 px** — inside the cap, which therefore never binds —
   `clientHeight` **19** and `scrollHeight` **19** (nothing overflows),
   computed `max-height` still `25px` and `appearance` still `auto`, and
   the label at gapTop **2.67**, gapBottom **4.67**, **off −1.00 px**,
   which is where the window's own native buttons sit (Zotero's *Test
   connection*: −0.50). The old `padding: 5px 14px` asked for 31.33 px,
   was clamped to 25, and drew the label at **+2.17**. By eye, on a
   screenshot of the button row: the macOS **rounded pill**, not the
   square bevel the theme falls back to above 25 px, and no descender
   clipped — the `p` of *Stop*, the `g` of *reading*.
   **The centering holds when the cap does bind.** On the live dialog
   `btn.style.paddingBlock = '5px'` takes the natural height back to
   31.33 px and the cap clamps it: computed `height` **25px**, gapTop
   **3.5**, gapBottom **5.5**, **off −1.00**, `clientHeight` and
   `scrollHeight` 21. That is the flex centering doing the work — inert,
   it would give the old 6.67 / 2.33 / **+2.17**, Gecko leaving an
   overflowing button's content at the top of its content box.
   `btn.style.paddingBlock = ''` returns every number to the paragraph
   above. This is the check that a larger Zotero UI font, where the line
   alone outgrows the cap, is still centered.
   **Cancel** — the button, a trusted Enter on it, or a trusted Escape
   (`keydown()` 0: Gecko's own dialog cancel): the dialog leaves the DOM
   within ~150 ms, the pref is unchanged, the unbound checkbox snaps
   back to the pref, a provider button keeps its label and its result
   line, `players()` is unchanged.
   **Stop reading and continue**: within ~200 ms the dialog goes, every
   open player closes — `open`/`popupOpen`/`active` false for each — and
   the setting is written in the same turn, no second click. The write
   is the row's own: `favoritesOnly` flips, a ♥ appends to
   `readAloud.favoriteVoices` and the glyph repaints, `<id>.enabled`
   flips and the button's label with it. With nothing open, none of the
   five asks anything: no dialog, the write goes straight through.
   `diagnostics.players(true)` runs that same `stopAll()`: `before` the
   open ones, `stopped` their itemIDs, `after` sampled at once —
   `popupInDom` **still true**, the element leaves on React's next
   render — and `later` at +1 s with `popupInDom` false.
   On a provider the guard asks **twice**: before the click's write, and
   again after a connection check that passed (Local's takes ~700 ms;
   another provider's may take 15 s). Open a session while the check
   runs — the click and `toggleReadAloudPopup(true)` in one script, no
   await between them — and the second dialog appears when the check
   lands. Stop there **keeps the check**: the result line still reads
   `Connected. N voices available. …` and the pref is written; Cancel
   there clears the line and drops the outcome.
   Unit-tested, not driven live (`test/ui/reading-guard.test.ts`,
   `test/read-aloud/player-stop.test.ts`): the two restores (a file
   picker and an OS confirm need a human), the `confirmEx` fallback
   where `showModal` is unavailable, and a player that refuses to close
   (the change stays refused, the OK-only notice names what is left).
   Reopening a stopped tab's player restores Zotero's saved place — one
   segment before where the manager stood, on a PDF, and on a
   never-played session that compounds one per close/reopen cycle
   (measured 2026-09-08: 4 → 3 → 2 → 1 → 0, the stored rect moving with
   it). That is the resume path, the same on the headphone button, not
   the guard — item 5.3's ground.
   **State**: Stop closes every open player in the profile, the user's
   own included — run it with none of theirs open, or with their
   consent; a script-reopened player is mute, so nothing restores them
   but the headphone button. A fixture session on an `en` document
   rewrites `reader.readAloudVoices` (`en.voice`, `en.tierVoices.local`):
   snapshot it before and rebuild it after.
10. **The pauses** (issue #44, 1.10.8). `diagnostics.pauses()` per
    reader. Popup closed: `patched.controller` false, `count` 0. A
    session on a plugin voice: `patched: {manager: true, controller:
    true}`, `voice.nativeSentenceDelay` 0, at the defaults `gaps:
    {sentence: 0, paragraph: round(200/speed)}`, `count` up one per
    boundary, `last.paragraph` true exactly into segments 5/9/12/15
    with `last.scheduled` 200 and `last.delay` round(200/speed), false
    elsewhere with 0 and 0. Mid-session, sentence 1000 and paragraph
    400 at 2× → `gaps {500, 700}` and the next boundaries' `last.delay`
    accordingly; `_allVoices.length` unchanged, `active` still true, no
    `#ztts-notice`. Both switches off → `gaps {0, 200}` and
    `last.delay === last.scheduled`. `Premium Voice 1` (spends: at most
    three sentences, only with Premium credit on the account —
    `selectTier('premium')` before `selectVoice`, and resume, poll and
    pause in ONE script, since every round trip is billed audio):
    `nativeSentenceDelay` 300; at the defaults `last.scheduled` 300 or
    500 → `delay` 0 or 100 at 2×; switches off → `delay === scheduled`.
    An in-place reinstall under the paused session → `patched` both
    true again, `count` 0, `diagnostics.patches().pauses` = one entry
    per open tab plus one per tab with a session (`{6, 6}` measured
    with four tabs and two sessions), no dead-object burst. The pane:
    the two rows under *Use one speed everywhere*, bound to the four
    prefs; writes through the number inputs and the checkboxes reach the
    prefs; the `?` tooltips open. By ear only: the pacing at 1× and 2×.
11. **The player's language dropdown lands on the language's remembered
    voice** (issue #49, 1.10.10). With *Use one voice everywhere* on, the
    memory naming a single-language Local voice V_en under `en`, the
    `mul` entry naming a Local multilingual voice V_mul — neither the
    first of its Local pool, or the check proves nothing — and both
    fixtures paused on V_en: tab 1's dropdown to *Multiple languages*,
    driven through its own rows (the language `CustomSelect`'s trigger,
    then `pointerup` on the `…-option-mul` row), read in the same
    script. Expected `manager._persistedVoices` = the `mul` entry (voice
    V_mul) right after the click — the mechanism; before the fix it was
    still the `en` entry — `selectedVoiceID` V_mul, both pref entries as
    before, the memory V_mul (`mul`), tab 2 on V_mul and still paused,
    and the log in order: `staged Zotero's entry for the dropdown's mul:
    voice V_mul`, `read-aloud memory (a pick the pref did not show): …
    V_mul (mul)`, `applied read-aloud memory: en -> mul, …` (tab 2's
    lane move), `spread read-aloud voice V_mul (mul): en: resynced`.
    Back to *English (United States)* (`…-option-en-US`):
    `_persistedVoices` the `en` entry, `selectedVoiceID` V_en (the first
    en-US voice of the pool — AIGenerate1 on 2026-09-05 and 2026-09-06,
    Masaru for `mul` — was the bug), entries untouched, memory V_en
    (`en`), tab 2 on V_en. The `staged … dropdown's` line appears once
    per click and never on a popup open, a spread, a pref restore or
    `_prepareReadAloud()`. With an en-GB Local voice listed, *English
    (United Kingdom)* loads the `en` entry and Zotero's own region rule
    then skips V_en for the first en-GB voice (Abbi on 2026-09-06),
    rewriting the entry with region `GB` — Zotero's design; the pref
    snapshot restores it. A language with no entry starts on Zotero's
    own choice, as without the plugin. Drive the dropdown in the
    **selected** tab: a player opened through the API in a background
    tab never mounts its DOM (the rulebook). Zotero logs one
    `selectionRanges[0] is undefined` TypeError (reader.js
    `_getAnnotationFromSelectionRanges`) per dropdown click, its own
    noise, nothing of ours in the stack. Measured 2026-09-06 with
    Andrew / AlloyTurbo at 2.1×, 1.10.10-beta.
12. **A raw `/Lang` tag, and the restore Zotero never repeats** (issue
    #59, 1.11.0). 204 of this library's PDFs carry `/Lang (EN)` and 37
    `/Lang (English)`; the tag reaches `setLanguage` as it is, Zotero's
    only restore of a fresh tab runs on it and finds no entry, and once
    the list lands `_resolveVoice` moves the manager to the first
    language it has a voice for (reader.js 82396-82420 of beta.7) and
    never restores again. Fixtures: Fluent Python (attachment key
    `6HKFATNK`, `/Lang (EN)`) and Tsai et al. 2025 (`2SHZQY6Z`,
    `/Lang (English)`), opened with `Zotero.Reader.open` and driven with
    `_prepareReadAloud()` on a popup-less tab — which never renders its
    player again (the rulebook), so close it right after; poll
    `manager.lang` in ≤ 6 s windows.
    - Both switches off: whichever side of the race wins, the manager
      ends on `en` with the pref's `en` entry — its `voice`, that voice's
      tier, its `speed`; `diagnostics.readAloudMemory()` gives that
      reader `resyncs: {count: 1, last: "EN -> en"}`; the log has
      `Zotero moved the manager EN -> en inside its resolution; restored
      again for en`; and **no `EN` key** is in
      `extensions.zotero.reader.readAloudVoices` at any sample. Measured
      2026-09-06 (1.11.0-beta3, 10.0.2-beta.7, Windows): the SDT landed
      first (tag visible 446–1006 ms, list at 1171 ms, 2267 voices),
      ending on the profile's own `en` entry, `69366774-en-US` /
      `premium` / 1.7; with the list loaded before `_prepareReadAloud`
      the move happens inside `setLanguage`, a 20 ms poll never sees the
      tag, same end state, same `resyncs`. The `English` fixture gives
      `last: "English -> en"`, applies the fossil `"English": {"speed":
      1.7}` while the tag stands and leaves it untouched. Before the
      fix the tag-first race ended on `a6ac2542-en-US` (Premium Voice
      1, tier `premium`) at speed 1.
    - Voice off, speed on, the memory's speed differing from the `en`
      entry's: nothing is written while the manager sits on the tag, and
      the second pass writes `en.speed` (1.5 measured), logging `applied
      read-aloud memory: en -> en, speed 1.5, voice -` after the move
      line.
    - Both on (the shipped defaults), a listed voice remembered: the
      lane is moved before the list lands, so `resyncs` is `null`, the
      log has `applied read-aloud memory: EN -> en, speed 1.7, voice
      <id> (en)`, `docLang` stays `EN`, and the remembered voice is
      selected once the list is in.
    Touches `reader.readAloudVoices`, `readAloud.memory` and both
    switches: restore the voices pref while the voice switch is off,
    then the switches, then the memory.
13. **A speed shortcut while the manager sits on the raw tag** (issue
    #59, 1.11.0). Voice off, speed on; a trusted `Shift+C` through
    `nsITextInputProcessor` on the reader's iframe window, fired by the
    polling script the instant `manager.lang` reads the tag — the window
    opens ~370–500 ms after `_prepareReadAloud()` and stands ~250–400
    ms. Expected: `keydown()` returns 1; the toast reads the manager's
    speed + 0.1 (`1.1×` from 1 — nothing has restored a speed for the
    tag); **no `EN` key ever**; the memory pref's `speed` is the new
    one; every existing key's `speed` follows it, written exactly once,
    by `persistSpeed` under `setDefaultSpeed` (the spread); the log has
    `read-aloud memory (a speed the pref could not carry): speed 1.1,
    voice …` then `spread read-aloud speed 1.1 to N reader(s)`, N the
    loaded readers open (1 on 2026-09-05, 3 on 2026-09-06). Once the
    list lands the manager is on `en` at that speed with the `en`
    entry's voice. Before the fix the shortcut created `"EN": {"speed":
    …}` and the pref observer, not `learnSpeed`, carried the speed.
14. **The move hook is per manager, and a reload takes it with it**
    (issue #59, 1.11.0). On an open reader
    `Object.prototype.hasOwnProperty.call(manager, '_resolveVoice')` is
    true (through the Xray and waived) while `getPrototypeOf(manager)`
    keeps its own `_resolveVoice` (system-voices' prototype shadow;
    `diagnostics.systemVoices()` → `patched: true`). Across an in-place
    reinstall with that tab open, sampled every 5 ms: the own property
    disappears for a moment (~55 ms measured) and comes back as a
    different function — tag the old one (`fn.__probe = 'x'`) and the
    tag must be gone. The new hook works: `manager.setLanguage('EN')`
    on the idle manager moves it back to `en` with the voice switch on
    and `resyncs` records the move (with the switch off Zotero lands on
    the selected tier's `languages[0]` — `ps` measured 2026-09-06,
    `reader.js` 82412 with `resolveLanguage` 38057-38077 comparing base
    languages case-sensitively — and the hook restores for that
    language). No `can't access dead object` in the debug store, nothing of
    ours in `Zotero.getErrors()` (the two `uncaught exception:
    undefined` per in-place install are Zotero's), a tab opened after
    the reload has the own property again, and `diagnostics.patches()`
    shows `live === total` everywhere.
15. **Cloudflare while reading** (1.11.3, issue #72). Point
    `readAloud.memory` at `cloudflare::@cf/myshell-ai/melotts/en` before
    the popup opens; the open starts the session on that voice, tier
    `local`, in about a second, and the tab's list is the profile's plus
    66 (2267 + 66 = 2333 on 2026-09-07). Per segment the log reads
    `[zotero-tts] cloudflare: no word timestamps for N chars (audio from
    @cf/myshell-ai/melotts), highlighting the sentence` — neither model
    family reports timing — with `[zotero-tts] prefetch: cloudflare: N
    chars ready ahead of playback` for the ones ahead and `(cached)` on
    a replay. `diagnostics.highlight()` on that view: `patched: true`,
    `granularity: "sentence"`, `activeWordTimestamp: "stand-in"`,
    `primaryShown: true`, `sentenceSlot: "ours"`, in word mode as in
    sentence mode — the whole-segment stand-in keeps the sentence lit.
    `selectVoice('cloudflare::@cf/deepgram/aura-1/angus')` then logs the
    same line naming `@cf/deepgram/aura-1`. **Budget**: read on MeloTTS.
    One played Aura sentence is five syntheses — Zotero's own read-ahead
    runs with `prefetchEnabled` off (304 characters, about 425 Neurons on
    2026-09-07) — so an Aura reading is a deliberate spend. `getAudio`
    with a wrong token (stashed, restored by length) resolves `{ audio:
    null, error: "unknown" }` in under 100 ms with `Cloudflare rejected
    the API token or the account ID (401) — Authentication error` in the
    log, never a hang; a segment Cloudflare 500s twice leaves the
    controller in `_error: "unknown"`, where only Retry or a voice
    re-pick moves it.
16. **A document stored decomposed keeps its highlight** (issue #74,
    1.11.3). `test/fixtures/ro-diacritics/ro-diacritics.epub`, imported as
    a standalone attachment: three paragraphs of the same Romanian
    sentences, stored comma-below precomposed, cedilla precomposed and
    NFD (`s U+0326` for ș, `a U+0306` for ă). Azure-Alina, granularity
    `word`, reading inside the third paragraph. Check:
    `diagnostics.highlight()` on the view and
    `view._getSpotlightColor('ReadAloudActiveSegment')` through the
    primary view. Expected: the word color (`#3478f6b3` at the default
    alpha), `sentenceSlot: "empty"` — on an EPUB at Word the pieces
    carry the sentence and Zotero's own slot is cleared on purpose;
    `"ours"` is the PDF path's value — with `sentencePieces` holding a
    head and a tail; a screenshot with the word lit inside the sentence,
    as on the first two paragraphs. Was: `#00000000` and
    `sentencePieces: false`, nothing drawn at all — the patch compared
    Zotero's NFC segment text with the DOM's own form by `===`.
17. **The transparent primary clears when Word is left** (issue #74).
    With the popup still open on that EPUB, set
    `extensions.zotero.reader.readAloud.highlightGranularity` to
    `sentence`. Check: `view._getSpotlightColor('ReadAloudActiveSegment')`
    on the next segment. Expected: the sentence color (`#ffff00b3` at the
    default). The flag clears on the next state push, so a paused manager
    still reads `#00000000` right after the pref write. Was: `#00000000`
    until the popup was closed and reopened.
18. **Azure word timestamps survive every Romanian encoding.** The same
    fixture, all three paragraphs, and `ro-diacritics.pdf` beside it
    (PDF.js hands its text decomposed). Check: the `[zotero-tts] azure: N
    word timestamps for M chars` line per segment against the segment's
    word count. Expected: N equals the word count for every segment —
    the title's 2, then 8/13/9/12, 7/13/9/12 and 8/13/9/12 per
    paragraph, in the EPUB and in the PDF (the PDF's char counts are
    larger) — and no `no word timestamps` line for
    Alina: Azure echoes back the form it was sent, so the alignment
    matches in every encoding.
19. **Each switch has its own line** (1.11.7-beta5, measured 2026-09-10):
    `#ztts-sync-positions-status` under *Sync reading positions between
    computers*, `#ztts-sync-settings-status` under *Sync settings between
    computers*, each hidden (0 height) while its switch is off; opening
    the pane pokes both transports and both lines move to the new time
    within ~570 ms. With both switches on and nothing new: `Reading
    positions synced <time>; nothing new for this computer.` and `Settings
    synced <time>; nothing new for this computer.`, both `hidden false`.
    The settings line names the last change here, not only the last sync:
    on load the pane first draws the previous sync's form and the pane-open
    sync replaces it at ~200 ms (201 ms measured, then stable for 5 s) —
    after an adoption, `Settings synced 12:50:47 PM; the last change here
    was 1 from tester at 12:50:17 PM.`; while something waits, the
    deferred sentence is appended to whichever form the line carries
    (`… the last change here was 2 from tester at 12:48:07 PM. 1 more wait
    until the reading stops.`). Before the fix the applied form lived
    ~100 ms and "nothing new for this computer" replaced it. The positions
    line's other forms — `… : <n> taken from your other computers.` right
    after an adoption, `… ; the last one from another computer arrived
    <when>.` on later syncs (`positionSync().transport.lastAdoption`),
    `Reading positions sync failed <time>: <detail>` — are unmeasured live
    as of 2026-09-10.
20. **A provider that fails its check goes off here only** — measured
    2026-09-10 on 1.11.7-beta5 with no player open (blocked on the two
    passes before by the owner's own paused player). Keep the real key
    first — the file's own body at the baseline, or the machine backup —
    because the adoption overwrites the local pref and it cannot be read
    from `azure.apiKey` afterwards. Craft `azure.apiKey: "not-a-key"` at
    `Date.now()+1000`, `by: "tester"`, and **leave the file's own
    `azure.enabled: true` item at the seed's ts** (equal to the machine's
    stamp; an older ts is not a resting state — `mergeSharedSettings` would
    push the local `true` back up and the flip would repeat on every
    trigger). The `reader-open` trigger applies both within 1.2 s
    (`lastApplied.applied ["azure.apiKey","azure.enabled"]`, `adopted 1`),
    the pref `azure.enabled` goes false, `state.held.azure.reason` is
    `Connection failed: Azure voices returned 401`,
    `state.stamps["azure.enabled"]` equals the file item's ts, `pushed 0`,
    `uploaded false`, and `sharedSettings()` still shows `azure.enabled:
    true` — the flip never travels. The next trigger (`reader-close`) is
    `adopted 0`, `pushed 0`, `uploaded false`, `lastApplied` unchanged: no
    check ran. Then the real key at `Date.now()+2000` → applied again
    (`["azure.apiKey","azure.enabled"]`), `azure.enabled` true,
    `state.held {}`, `uploaded false`. On a profile with *Keep a backup of
    this computer's settings on the server* on, expect one `settings
    auto-upload: 62 settings …` per pref the run moves.
21. **The three groups and their message lines** (1.11.7-beta3, measured
    2026-09-10): the pane's group order is `… Keyboard shortcuts, WebDAV,
    Sync, Backup, Build`; the Backup group's children run `h2`, the caption
    *To a file* (`label.ztts-caption`, `font-weight 600`, `margin-top
    8px`), *Backup settings…* / *Restore settings…*, *Export reading
    positions…* / *Import reading positions…* + `?`, the caption *This
    computer's copy on the server*, *This computer* + the id field + `?`,
    *Keep a backup of this computer's settings on the server* + `?`, *Back
    up to the server now* / *Restore settings from server…*,
    `#ztts-backup-message`. *Test connection* writes the WebDAV group's
    `#ztts-webdav-message` (`Connected to <url>.`) and leaves
    `#ztts-backup-message` empty; *Back up to the server now* writes
    `#ztts-backup-message` (`Backed up <n> settings to <url>zotero-tts-settings_<machine>.json.
    The file holds every setting…`) and leaves the WebDAV line as it was.
    Both lines are 0 px high while empty. The first button of each Backup
    row carries `style="min-width: 14em"` (the shortcut rows' own way; a
    button rule in the sheet must be macOS-only, issue #56), so the second
    column lines up — measured on beta5: the second button of each row at
    x 399, the first buttons 182 px wide (the beta3 pass had 340 and
    390 px); the second column's right edges stay ragged, its buttons
    being 125, 175 and 194 px wide.
22. **Speechify: text with nothing to say** (issue #79). With that
    session open, `voice.provider.remote.getAudio({ text: '* * *' },
    voice.impl)` resolves within 100 ms (4 ms) with an `audio/wav` of
    6 444 bytes — the 400 ms pause — and `[{ start: 0, end: 86400,
    charStart: 0, charEnd: 5 }]`, logging `speechify: empty audio for 5
    chars; playing a 400 ms pause instead` and **no line naming
    `simba`**: no request went out (live, `* * *` cost a minute and a
    502).
23. **Speechify: a key that stops working mid-reading** (issue #79).
    With `speechify.apiKey` set to `sk_wrong` (the real one stashed,
    restored by length), `getAudio` on an uncached sentence answers
    `{ audio: null, error: "unknown" }` within a second (0.29 s), never
    a hang, and the error console gains `Speechify simba-3.2: Speechify
    rejected the API key (401) — Unauthorized`.
24. **Numbers, a curly apostrophe, and a word with `point` inside**
    (issue #86, 1.11.7-beta9; measured live 2026-09-10).
    `test/fixtures/numbers/numbers.pdf`, Kokoro-af_alloy, highlight Word.
    Zotero cuts the page into six segments — the lead sentence (37 chars),
    then `In the reviewers’ … than they are.` as **one** 203-char segment
    (it does not break after `mm.`, as on the document the bug was found
    in), then `About 1,000 …` (78), `The pre-trained …` (54), `A
    magnification error …` (99) and the last paragraph (152). Play each
    from `manager.repositionTo(index)`, then read
    `controller._segmentTimestamps.get(index)` — re-read `mgr._controller`
    after the reposition, it rebuilds the controller — with each span's
    slice of the segment text. Expected, the mechanism: the log lines
    `local: 5 word timestamps for 37 chars`, `local: 37 word timestamps
    for 203 chars (5 bridged)`, `local: 14 word timestamps for 78 chars (3
    bridged)`, `local: 9 word timestamps for 54 chars (2 bridged)`, `local:
    18 word timestamps for 99 chars (2 bridged)`, `local: 31 word
    timestamps for 152 chars` — never a `dropped` (before the fix: 6
    timestamps for a two-sentence segment, the third of them `point`
    inside `branchpoints`). The 203-char segment's 37 spans, in reading
    order: `In, the, reviewers’, 29.83, mm, example, eye, a, scan,
    labelled, 3, ×, 3, mm, covers, 3.7, ×, 3.7, mm, Vessels, in, that, eye,
    therefore, look, narrower, their, branchpoints, denser, and, the,
    avascular, zone, smaller, than, they, are`. Every span starts and ends
    at a word boundary; `29.83` one span (chars 18–23) from the server's
    `twenty-nine` (0.624 s, where `reviewers’` ends) to its `three`
    (1.786 s); both `3`s and both `3.7`s spans of their own; `×` a span of
    its own here (the fixture's text layer has spaces around it) and
    joined with the digit after it (`×3`, `×3.7`) on the manuscript, whose
    layer has none; no span for `,` or `.` — `eye` ends at 2.774 s, the
    comma's end, and the final period (char 202) lies outside `are`
    (199–202); `branchpoints` one whole span (137–149). The second
    paragraph: `1,000` (6–11), `0.99` (33–37), the `76` of `76%` (54–56,
    the `%` out), `pre-trained` one span (4–15), `1.6` (31–34), the `1` of
    `[1]` (51–52), the `20` of `-20%` (26–28, the hyphen out) and `+10` of
    `+10%` (33–36, the `+` in). The third paragraph: 31 spans, one per
    word, no note on its log line. A timeline sampled every 40 ms walks in
    reading order and never onto a later line: at speed 3, `29.83` lit
    337–736 ms after the segment starts (audio 0.624–1.786) and
    `branchpoints` 3353–3554 ms (audio 9.749–10.274). Two screenshots,
    paused by polling `mgr._activeTimestampIndex` at 8 ms and
    `togglePaused()` in the same script: `29.83` alone lit, then the whole
    of `branchpoints` alone. `diagnostics.highlight()` →
    `activeWordTimestamp: "real"`; its `patched` and `sentenceSlot` are
    item 5's, and read `false` / `"empty"` on a tab attached while the
    window was minimized (issue #88) — not this item's. A
    segment's first span may start slightly negative (`-0.001`), the
    server's own first caption start passed through.
25. **A reply whose words are all rewritten falls back to the sentence**
    (issue #86; measured live 2026-09-10). With that session open,
    `voice.provider.remote.getAudio({ text: '29' }, voice.impl)` (a
    `Cu.cloneInto` segment is enough from chrome): the server says
    `twenty-nine`, nothing pairs, the log reads `local: no word timestamps
    for 2 chars (none of the 1 words the server returned is in the text),
    highlighting the sentence`, and the timestamps are the stand-in `[{
    start: 0, end: 86400, charStart: 0, charEnd: 2 }]` — never a
    word-colored sentence.
26. **Teardown**: popup closed, tab closed, the item erased, `rows` back.
