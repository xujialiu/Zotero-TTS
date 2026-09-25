# Zotero-TTS — every string the settings pane shows and the plugin writes
# into it. This file is the source of truth; the other locales mirror its
# ids, attributes and variables (test/l10n.test.ts). Ids carry the ztts-
# prefix because a document's Fluent messages share one namespace with
# Zotero's own and every other plugin's.
#
# A ? icon is a XUL <label value="?" help="…">, and Fluent drops every
# localizable attribute the translation leaves out — `value` included — so
# each help message names its .value = ? beside the .help.


## Provider sections (the OpenAI, Azure and Local engine headings are product names)

ztts-field-api-key =
    .value = API key
ztts-field-model =
    .value = Model
ztts-field-voices =
    .value = Voices
# The Voices field's placeholder: what an empty field offers (issue #113)
ztts-voices-input-builtin =
    .placeholder = built-in voices
ztts-voices-input-server =
    .placeholder = the server's own
ztts-field-extra-headers =
    .value = Extra headers
ztts-help-extra-headers =
    .value = ?
    .help = Only for a server reached remotely through Cloudflare Access: its service token as two headers, CF-Access-Client-Id: …; CF-Access-Client-Secret: … (see the Cloudflare tutorial in the README). Otherwise leave empty.
# The three sections that speak OpenAI's API (issue #113)
ztts-help-openai =
    .value = ?
    .help = The key and the model name come from platform.openai.com; OpenAI bills per character. Leave Voices empty for OpenAI's own voices, or list newer ones. Sentences are highlighted, not words. A proxy or mirror of OpenAI goes in the OpenAI Compatible section.
ztts-help-mimo =
    .value = ?
    .help = The key comes from platform.xiaomimimo.com; free for now. Leave Voices empty for MiMo's built-in voices, Chinese and English, or list your own. Sentences are highlighted, not words.
ztts-help-compatible =
    .value = ?
    .help = Any server that speaks OpenAI's API: Chatterbox-TTS-Server, a hosted service, a proxy of OpenAI. The address with or without /v1; a key only if the server wants one; the model as the server names it, and Test connection lists the ones it has. Leave Voices empty for the server's own voices. Sentences are highlighted, not words. One server at a time.
ztts-test-connection =
    .label = Test connection
ztts-field-region =
    .value = Region
ztts-field-account-id =
    .value = Account ID
ztts-field-api-token =
    .value = API token
ztts-help-cloudflare =
    .value = ?
    .help = Both values are on the Workers AI page of your Cloudflare dashboard: Use REST API → Create a Workers AI API Token, with the Account ID beside it. Every text-to-speech model of Workers AI is offered, each voice under its language. Sentences are highlighted, not words. 10,000 free Neurons a day: a few pages with an Aura voice, hours with MeloTTS (see the tutorial in the README).
ztts-help-speechify =
    .value = ?
    .help = The key is on the API keys page of your Speechify workspace (platform.speechify.ai). Every voice the key lists is offered under its language — no Mandarin, only Cantonese — and words are highlighted. Free: 50,000 characters a month, about fifteen pages, and a jump ahead can take a second or two to start; then $10 a month for a million.
ztts-help-fish =
    .value = ?
    .help = The key is on the Developers page of your fish.audio account. The source switches choose whether official voices, your own voices or the Model IDs below are listed; the model's Default voice is always available. All have word highlighting. The free model costs nothing but keeps your requests, promises no speed, and may end; the paid one bills by the byte of text, three per Chinese character.
ztts-fish-free-only =
    .label = Use only the free model
ztts-help-fish-free-only =
    .value = ?
    .help = On, every sentence goes to the free S2.1 Pro: no API credit needed, no speed guarantee, and Fish Audio may keep the text to improve its models. Off, the paid S2.1 Pro at $15 per million bytes of text, billed to your account's API credit, which is separate from the website's — with none, Test connection says so.
ztts-heading-fish-sources =
    .value = Voice sources
ztts-fish-include-official =
    .label = Official voices
ztts-help-fish-include-official =
    .value = ?
    .help = Voices published by Fish Official. Turn this off to leave the official voices out of the automatic list.
ztts-fish-include-own =
    .label = Your voices
ztts-help-fish-include-own =
    .value = ?
    .help = Voices in your Fish Audio account. Turn this off to leave your account voices out of the automatic list.
ztts-fish-include-manual =
    .label = Manual voices
ztts-help-fish-include-manual =
    .value = ?
    .help = Voices identified by the Model IDs you entered. Turn this off to hide them while keeping the IDs saved.
ztts-field-fish-voices = Voices (<label data-l10n-name="model-ids">Model IDs</label>)
ztts-fish-model-ids-input =
    .placeholder = IDs from Fish Audio
ztts-help-fish-model-ids =
    .value = ?
    .help = Fish Audio calls a voice's ID its Model ID. Find a voice at https://fish.audio/app/discovery/, open its page and copy its Model ID. Paste several IDs separated by commas or spaces; existing voice links also work.
ztts-help-fish-speech =
    .value = ?
    .help = A fish-speech API server on your machine or LAN (see the tutorial in the README): every reference voice on it is offered, and sentences are highlighted, not words. Needs a 24 GB GPU. A server started with --api-key takes it in Extra headers as "Authorization: Bearer …".
ztts-field-address =
    .value = Address
ztts-heading-system-voices = System voices
# One note per platform; ui/platform-class.ts shows the one that applies
ztts-system-note-win = Your Windows voices, with word highlighting.
ztts-system-note-mac = Your Mac's voices, highlighted by sentence.
ztts-system-note-other = Not available on Linux.
ztts-help-system-voices =
    .value = ?
    .help = The plugin takes over the voices your system itself installs, so they come with the voice browser, samples, favorites and the cache, like every other provider's. Windows adds word highlighting; on macOS the sentence is highlighted. Linux is not supported.

## The provider switch, written by ui/provider-rows.ts

## Zotero's own voices (issue #111): a switch per tier, no fields

ztts-zotero-note = Zotero's own voices, with a Zotero account signed in. A tier switched off leaves the player; Standard and Premium keep separate credits, bought on zotero.org.
ztts-help-zotero =
    .value = ?
    .help = Standard and Premium are the voices Zotero itself offers once you are signed in under Settings → Sync; each has its own credits, bought on zotero.org. Switch a tier off to take it out of the player's first dropdown, the voice browser and the language list; nothing Zotero remembers is lost, and switching it back on brings the tier's last voice back. Signed out, Enable is greyed; signed in, it checks that Zotero lists voices in that tier.
ztts-zotero-standard = Standard
ztts-zotero-premium = Premium
ztts-zotero-not-signed-in = Not signed in to a Zotero account: sign in under Settings → Sync.
ztts-zotero-tier-empty = Zotero lists no { $tier } voices.
ztts-zotero-tier-ok = Signed in: { $count } { $tier } voices, { $credits } credits remaining.
ztts-zotero-tier-ok-no-credits = Signed in: { $count } { $tier } voices.

# The eye after a key, a gateway header line or the WebDAV password: it
# uncovers the value so it can be read, selected and copied, and covers it
# again. A provider that is on greys it out — its secrets stay covered.
ztts-secret-show = Show the value
ztts-secret-hide = Hide the value

ztts-switch-enable = Enable
ztts-switch-disable = Disable
ztts-switch-checking = Checking…
ztts-switch-testing = Testing…


## Voice browser

ztts-heading-voice-browser = Voice browser
ztts-favorites-only =
    .label = Offer only favorite voices in the player
    .bold = favorite voices
ztts-voices-speed =
    .value = Speed
    .tooltiptext = Samples play at this speed; with “Use one speed everywhere” on, releasing the slider makes it the speed Read Aloud starts with
ztts-volume =
    .value = Volume
ztts-volume-percent =
    .value = %
ztts-help-volume =
    .value = ?
    .help = How loud Read Aloud plays, for every voice, and the samples here. 100% is Zotero's own level, and the most. The volume keys below change it by 10% while Read Aloud is open, and a change lands on the sentence being spoken.


## Reading

ztts-heading-reading = Reading
ztts-open-expanded =
    .label = Open the player expanded
ztts-help-open-expanded =
    .value = ?
    .help = Show the floating panel's provider, language and voice rows whenever it opens. Options or Shift+O hides or shows them for this opening. Changes apply the next time you open the player.
ztts-one-voice =
    .label = Use one voice everywhere
ztts-help-one-voice =
    .value = ?
    .help = One voice for every document and every open tab. Off: Zotero keeps one voice per document language.
ztts-one-speed =
    .label = Use one speed everywhere
ztts-help-one-speed =
    .value = ?
    .help = One speed for every document and every open tab. Off: Zotero keeps one speed per document language.
ztts-sentence-pause =
    .label = Pause between sentences
ztts-paragraph-pause =
    .label = Pause between paragraphs
ztts-pause-ms =
    .value = ms
ztts-help-sentence-pause =
    .value = ?
    .help = How long every voice waits before the next sentence of the same paragraph, at 1× speed; reading faster shortens it in step. Off: no pause between sentences.
ztts-help-paragraph-pause =
    .value = ?
    .help = The whole pause where a paragraph begins, at 1× speed, in place of the pause between sentences there, even when shorter; reading faster shortens it in step. Off: no pause where a paragraph begins.
ztts-skipped-lines =
    .label = Read a page's first line when Zotero would skip it
ztts-help-skipped-lines =
    .value = ?
    .help = A sentence that runs onto the next page can lose that page's first line: Zotero reads straight past it, and the join sounds like a sentence. On, the line is read and highlighted like any other. Off if a page header is ever read aloud. Applies to documents opened from now on.
ztts-split-sentences =
    .label = Read a sentence Zotero split in two as one
ztts-help-split-sentences =
    .value = ?
    .help = Zotero sometimes breaks a paragraph in the middle of a sentence and reads the halves as two sentences, with a pause between them. On, the halves are read and highlighted as one sentence. Off if two paragraphs are ever read as one. Applies to documents opened from now on.
ztts-prefetch =
    .label = Prefetch upcoming sentences
ztts-prefetch-ahead =
    .value = ahead
ztts-help-prefetch =
    .value = ?
    .help = Synthesizes the sentences ahead while the current one plays, so playback never waits for the server. Zotero already fetches 3 ahead on its own, so what is ready runs from your number to your number plus 3. The audio waits in the cache below, which stays on while this is on. On a paid provider, sentences you skip past are synthesized and billed anyway.
ztts-cache-audio =
    .label = Cache synthesized audio
ztts-help-cache-audio =
    .value = ?
    .help = Keeps synthesized sentences in memory — 64 MB, emptied when Zotero restarts — so reading a passage again is instant and, on a paid provider, free. Prefetch stores its audio here, so it cannot be turned off while prefetch is on.


## Highlight

ztts-heading-highlight = Highlight
# The two levels as switches (issue #114), each the label of its color's row
ztts-highlight-sentence =
    .label = Sentence
ztts-highlight-word =
    .label = Word
ztts-highlight-opacity =
    .value = Opacity (%)
ztts-help-highlight-switches =
    .value = ?
    .help = Both on: the word being spoken in its color, with its sentence in the sentence color under it. One off: only the other is highlighted, and the last one on cannot be turned off. A voice without word timing highlights the sentence either way. Zotero's own Highlight current setting follows this choice and cannot be changed there.
# The preview's sample line. The spans are the markup's own elements,
# matched by data-l10n-name: the pieces ui/highlight-rows.ts paints from
# the switches — the word, and the sentence before and after it.
ztts-preview-line = The first sentence has been read. <span data-l10n-name="before">Read Aloud is now on </span><span data-l10n-name="word">this</span><span data-l10n-name="after"> word.</span> The next one follows.
ztts-restore-colors =
    .label = Restore default colors


## Keyboard shortcuts

ztts-heading-shortcuts = Keyboard shortcuts
ztts-key-speed-reset =
    .value = Reset speed to 1.0×
ztts-key-slower =
    .value = Slower (−0.05×)
ztts-key-faster =
    .value = Faster (+0.05×)
ztts-key-quieter =
    .value = Quieter (−10%)
ztts-key-louder =
    .value = Louder (+10%)
ztts-key-previous-sentence =
    .value = Previous sentence
ztts-key-next-sentence =
    .value = Next sentence
ztts-key-previous-paragraph =
    .value = Previous paragraph
ztts-key-next-paragraph =
    .value = Next paragraph
ztts-key-play =
    .value = Play / pause / resume
ztts-key-return =
    .value = Go to reading position
ztts-key-options =
    .value = Player options
ztts-key-stop =
    .value = Stop reading everywhere
ztts-key-word-highlight =
    .value = Word highlight on / off
ztts-clear =
    .label = Clear
ztts-help-key-skip =
    .value = ?
    .help = Acts only while Read Aloud is open; otherwise the key pages and scrolls the reader as usual.
ztts-help-key-play =
    .value = ?
    .help = Works in every state: pauses or resumes an open session, and otherwise starts reading — from the selected text, where you last stopped, or from the visible page.
ztts-help-key-return =
    .value = ?
    .help = Acts only while Read Aloud is open; otherwise the key keeps its usual meaning in the reader.
ztts-help-key-options =
    .value = ?
    .help = Shows or hides the floating panel's provider, language and voice rows. Acts only while Read Aloud is open.
ztts-help-key-stop =
    .value = ?
    .help = Closes the player in every tab at once. Each tab keeps its place, and reading picks up there when you start it again. While no player is open the key keeps its usual meaning.
ztts-help-key-word-highlight =
    .value = ?
    .help = Turns the Word switch of the Highlight section on and off without leaving the document, for every tab, and it stays until changed again. Turning it off never leaves nothing highlighted: the sentence comes on. A voice without word timing keeps highlighting the sentence either way.
ztts-help-key-volume =
    .value = ?
    .help = Changes the Volume setting above by 10%, for every voice, within the sentence being spoken. Acts only while Read Aloud is open; otherwise the key keeps its usual meaning in the reader.
ztts-restore-shortcuts =
    .label = Restore default shortcuts


## Backup

ztts-heading-backup = Backup
ztts-backup-to-file =
    .value = To a file
ztts-backup-settings =
    .label = Backup settings…
ztts-restore-settings =
    .label = Restore settings…
ztts-export-positions =
    .label = Export reading positions…
ztts-import-positions =
    .label = Import reading positions…
ztts-help-positions =
    .value = ?
    .help = Where Read Aloud last stopped in each document, as its own file. Importing merges: a position is taken only where the file's is newer than this computer's. Settings backups never contain reading positions.


## WebDAV

ztts-heading-webdav = WebDAV
ztts-field-webdav-url =
    .value = WebDAV URL
ztts-field-username =
    .value = Username
ztts-field-password =
    .value = Password


## Sync

ztts-heading-sync = Sync
ztts-sync-positions =
    .label = Sync reading positions between computers
ztts-help-sync-positions =
    .value = ?
    .help = Keeps where Read Aloud last stopped in each document in the WebDAV folder above, and picks up what your other computers — and the OpenReader app on your phone — left there, so play resumes at the same sentence anywhere. Off, reading positions stay on this computer.
ztts-sync-settings =
    .label = Sync settings between computers
ztts-help-sync-settings =
    .value = ?
    .help = Keeps the settings of every computer sharing the folder above the same: a change here reaches the others a few seconds later, and theirs reach here, without restoring by hand. A few things stay on each computer — a voice server at a local or home-network address, the System voices switch, and this WebDAV connection. A provider that does not work on this computer stays off here, and the line below says why. Off, nothing changes on this computer unless you restore it yourself.
# The line under each switch (ui/sync-status-rows.ts): what the last sync did on this computer
ztts-positions-status-waiting = Reading positions sync: waiting for the first sync.
ztts-positions-status-none = Reading positions synced { $time }; nothing new for this computer.
ztts-positions-status-taken = Reading positions synced { $time }: { $count } taken from your other computers.
ztts-positions-status-last = Reading positions synced { $time }; the last one from another computer arrived { $when }.
ztts-positions-status-failed = Reading positions sync failed { $time }: { $detail }
# The toast when a place another device reached cannot be found in this copy of the document (resume falls back to this computer's own last sentence)
ztts-shared-position-unresolved = The place reached on your other device was not found in this copy; resuming from this computer's last sentence.
ztts-sync-status-waiting = Settings sync: waiting for the first sync.
ztts-sync-status-none = Settings synced { $time }; nothing new for this computer.
ztts-sync-status-applied = Settings synced { $time }: { $count } from { $from } applied here.
ztts-sync-status-last = Settings synced { $time }; the last change here was { $count } from { $from } at { $when }.
ztts-sync-status-failed = Settings sync failed { $time }: { $detail }
ztts-sync-status-deferred = { $count } more wait until the reading stops.
ztts-sync-status-held = { $provider } stays off on this computer: { $reason }
ztts-sync-other-computer = another computer


## Backup — this computer's copy on the server (ui/webdav-rows.ts)

ztts-backup-on-server =
    .value = This computer's copy on the server
ztts-field-this-computer =
    .value = This computer
ztts-help-this-computer =
    .value = ?
    .help = The name this computer's backup copy carries on the server, so each computer keeps its own and none overwrites another's. Renaming starts a fresh copy under the new name.
ztts-auto-upload =
    .label = Keep a backup of this computer's settings on the server
ztts-help-auto-upload =
    .value = ?
    .help = A few seconds after any setting changes, this computer's own copy on the server is refreshed, ready to restore by hand — here after a reset, or on another computer. A backup, not the sync: nothing changes on any computer unless you restore it yourself. Off, only the button below writes the copy.
ztts-upload-now =
    .label = Back up to the server now
ztts-restore-from-server =
    .label = Restore settings from server…


## About

ztts-heading-about = About
# The About section's first line (ui/about-rows.ts): `Version 1.11.7 · Date 2026-09-10 · Time 13:45:07 UTC+8`
ztts-about-version = Version { $version }
ztts-about-date = Date { $date }
ztts-about-time = Time { $time }
# Its second line: `Author Xujia Liu · Email xujialiuphd@gmail.com`
ztts-about-author = Author { $author }
ztts-about-email = Email { $email }
# The line under it, the repository: the link is named, not placed, so the
# markup's label named github takes the text between the tags wherever a
# language puts it
ztts-about-star = If you like Zotero-TTS, give it a ⭐ on <label data-l10n-name="github">GitHub</label> — it helps others find it.


## What TypeScript writes into the pane (issue #43)
#
# Two conventions. A line made of several sentences — a connection result,
# a restore's report — is put together through ztts-join (core/l10n.ts
# sentences): a space between the sentences in English, nothing in Chinese.
# A count that can pass a thousand — voices, reading positions, an item id —
# arrives as text, so it reads 1914, never 1,914; only the counts a plural
# rule reads (tabs, providers) arrive as numbers.

ztts-join = { $first } { $second }

## Connection results (ui/prefs-pane.ts testConnection, checkProvider; ui/provider-rows.ts)

ztts-connected = Connected.
ztts-connected-model = Connected. Model { $model } available.
ztts-connected-model-missing = Connected, but model "{ $model }" is not listed by this server.
ztts-voices-available = { $count } voices available.
ztts-synthesis-works = Synthesis works.
ztts-word-timestamps = Word timestamps available.
ztts-no-word-timestamps = No word timestamps: { $detail }.
ztts-no-word-timestamps-detail = the server did not return any
ztts-synthesis-failed = Connected, but synthesis failed: { $detail }
ztts-timestamp-check-failed = Connected, but the word-timestamp check failed: { $detail }
ztts-no-reply = No reply within { $seconds } s
ztts-no-audio = No audio within { $seconds } s
ztts-no-voice-list = No voice list within { $seconds } s
ztts-local-server-down = Local TTS server is not running at that address.
ztts-no-key = No API key set for this provider.
ztts-key-rejected = The server rejected the API key. ({ $detail })
ztts-cannot-connect = Cannot connect: { $detail }
ztts-connection-failed = Connection failed: { $detail }
# After a settings restore: the providers it turned on, checked (issue #21)
ztts-providers-checked =
    Checked { $count ->
        [one] { $count } provider
       *[other] { $count } providers
    }: all working.
ztts-providers-turned-off =
    Turned off { $named }: the restored settings do not work here — see the message beside { $count ->
        [one] it
       *[other] each
    }.
ztts-system-unsupported = System voices are available on Windows and macOS only; this build has no speech helper for Linux.

## The voice browser (ui/voice-browser-rows.ts)

# Zotero's two cloud tiers as entries of the player's first dropdown and the browser's first column (issue #111): Zotero's own words for them (reader.ftl reader-read-aloud-voice-tier-*) behind its name
ztts-tier-standard = Zotero Standard
ztts-tier-premium = Zotero Premium
# The System voices' entry in the player's first dropdown and the browser's first column (issue #110), like the pane's heading
ztts-provider-system = System
ztts-listing-voices = Listing voices…
ztts-no-voices = No voices. Enable a provider above.
ztts-no-providers-on = No provider is on: enable one above.
ztts-listing-failed = Listing voices failed: { $problems }
ztts-plugin-voices-problem = the plugin’s voices: { $detail }
ztts-fish-list-limited = Fish Audio limits its platform list to 1,000 voices; use Model IDs from Fish Audio discovery to add others.
ztts-fish-list-stale = Fish Audio’s voice list may be out of date: { $detail }
ztts-fish-list-stale-no-detail = Fish Audio’s voice list may be out of date.
# The status line: the voice as `<tier> | <language> | <label>`, the speed as `1.7×`
ztts-default-voice = Default voice: { $voice }
ztts-default-voice-speed = Default voice: { $voice } | { $speed }
ztts-default-speed = Default speed: { $speed }
ztts-no-default = No default voice or speed: Zotero keeps both per language
ztts-zotero-own-choice = Zotero’s own choice per language
ztts-not-listed-now = { $id } (not listed now)
ztts-status-not-a-favorite = { $line } — not a favorite, while only favorites are offered: Read Aloud cannot start with it
ztts-status-trouble = { $line } — { $problems }
ztts-default-cleared = Default cleared: { $label } is no longer a favorite, and only favorites are offered
ztts-sample-failed = Sample failed: { $detail }
ztts-sample-stopped = Sample failed: the audio arrived, but playback stopped: { $detail }
ztts-zotero-sample-unavailable = Zotero cannot play its own voices here
# The tooltips of a voice row's three buttons
ztts-play-sample = Play a sample
ztts-play-zotero-sample = Play Zotero’s own sample
ztts-favorite = Favorite
ztts-row-default = The default voice: Read Aloud starts with it. Click to clear it
ztts-row-pick = Click to make it the default voice
ztts-row-blocked = Only a favorite can be the default while “Offer only favorite voices” is on
# What an <audio> element's MediaError says; the engine's own message is kept beside it in parentheses
ztts-media-unknown = unknown error
ztts-media-code = media error { $code }
ztts-media-aborted = playback aborted
ztts-media-network = a network error
ztts-media-decode = decoding or output failed
ztts-media-format = format not supported

## The reading guard's dialog and the favorites-only refusal (ui/reading-guard.ts, ui/voice-list-switches.ts)

# $list is the tabs, one `  • <title>` per line; the blank line before the last sentence is kept
ztts-reading-tabs =
    Read Aloud is open in { $count ->
        [one] a tab
       *[other] { $count } tabs
    }:
    { $list }

    Close the player in { $count ->
        [one] that tab
       *[other] those tabs
    }, then try again.
# The same tabs, above the button that stops the reading there (issue #71): the cost is said before the press
ztts-reading-tabs-stop =
    Read Aloud is open in { $count ->
        [one] a tab
       *[other] { $count } tabs
    }:
    { $list }

    Stopping it there lets this change through; each tab keeps its place, and Read Aloud picks up there when you start it again. Or close the player in { $count ->
        [one] that tab
       *[other] those tabs
    } yourself, then try again.
ztts-stop-and-continue = Stop reading and continue
ztts-cancel = Cancel
ztts-ok = OK
# A tab whose item has no title
ztts-item = item { $id }
ztts-unmarked-default =
    { $name } is the default voice but not a favorite.

    While only favorites are offered, Read Aloud could not start with it. Mark it ♥, or make a favorite the default, then switch this on.

## The shortcut recorder (ui/shortcut-rows.ts, ui/shortcut-recorder.ts)

ztts-recording = Press the new keys… (Esc cancels)
ztts-key-not-set = Not set
ztts-key-invalid = { $text } (invalid)
ztts-key-conflict = Already used by "{ $action }".
ztts-key-needs-modifier-or-arrow = Add a modifier (Ctrl, Alt, Shift or Cmd) or use an arrow key: a bare key would type instead.
ztts-key-needs-modifier = Add a modifier (Ctrl, Alt, Shift or Cmd): a bare key would type instead.
# The actions as the conflict message names them
ztts-action-speed-reset = Reset speed
ztts-action-slower = Slower
ztts-action-faster = Faster
ztts-action-quieter = Quieter
ztts-action-louder = Louder
ztts-action-previous-sentence = Previous sentence
ztts-action-next-sentence = Next sentence
ztts-action-previous-paragraph = Previous paragraph
ztts-action-next-paragraph = Next paragraph
ztts-action-play = Play / pause / resume
ztts-action-return = Go to reading position
ztts-action-options = Player options
ztts-action-stop = Stop reading everywhere
ztts-action-word-highlight = Word highlight on / off
# The toast the volume keys show, where the speed's shows `1.3×`
ztts-volume-toast = Volume { $percent }%
# The stop key's toast (issue #71): how many players it closed
ztts-stopped-toast = Stopped Read Aloud in { $count ->
        [one] one tab
       *[other] { $count } tabs
    }
# The highlight key's toast (issues #67 and #114): what is highlighted now
ztts-highlight-toast-both = Highlight: word and sentence
ztts-highlight-toast-word = Highlight: word
ztts-highlight-toast-sentence = Highlight: sentence
# The word toast on a voice without word timing: the switch changed, the screen did not
ztts-highlight-toast-word-no-timing = Highlight: word (this voice has no word timing, so the sentence stays highlighted)
# The hint on Zotero's own Highlight current menulist, greyed while the plugin runs (ui/zotero-highlight-menu.ts, issue #114)
ztts-zotero-highlight-hint = Chosen in Zotero-TTS's settings, under Highlight

## Backup and Sync (ui/backup-rows.ts, ui/webdav-rows.ts)

# The file dialogs' titles
ztts-picker-backup = Backup Zotero-TTS settings
ztts-picker-restore = Restore Zotero-TTS settings
ztts-backup-saved = Saved to { $path }. The file holds every setting, the API keys, gateway headers and WebDAV password included — keep it private.
ztts-backup-failed = Backup failed: { $detail }
ztts-restore-confirm = Replace the current settings with the { $count } in { $path }?
ztts-restored = Restored { $count } settings from { $path }.
ztts-skipped = Skipped { $count }: { $keys }.
ztts-checking-providers = Checking the providers it turns on…
ztts-providers-uncheckable = The providers could not be checked: { $detail }
ztts-restore-failed = Restore failed: { $detail }
ztts-positions-saved = Saved { $count } reading positions to { $path }.
ztts-export-failed = Export failed: { $detail }
ztts-positions-merged = Merged { $count } reading positions from { $path }; { $taken } were newer and were taken.
ztts-import-failed = Import failed: { $detail }
ztts-webdav-testing = Testing…
ztts-webdav-uploading = Uploading…
ztts-webdav-looking = Looking…
ztts-webdav-connected = Connected to { $url }.
ztts-upload-failed = Upload failed: { $detail }
ztts-webdav-uploaded = Backed up { $count } settings to { $file }. The file holds every setting, the API keys, gateway headers and WebDAV password included — keep the folder private.
ztts-webdav-none = No settings backup on { $url } yet.
# The picker when the server holds several computers' files: its title, and one line per file
ztts-webdav-pick-title = Restore settings from which computer?
ztts-shared-file = shared file (before 1.11)
ztts-date-unknown = date unknown
ztts-settings-file-label = { $who } — { $when }
# The confirm before a restore from the server, with the file's machine and date when it carries them
ztts-webdav-restore-confirm = Replace the current settings with the { $count } on { $url }?
ztts-webdav-restore-confirm-machine = Replace the current settings with the { $count } of { $machine } on { $url }?
ztts-webdav-restore-confirm-saved = Replace the current settings with the { $count } on { $url }, saved { $time }?
ztts-webdav-restore-confirm-machine-saved = Replace the current settings with the { $count } of { $machine } on { $url }, saved { $time }?
ztts-webdav-machine-file = This computer's backup on the server is { $file }.

## The reader: the line shown when Read Aloud does not start with the remembered voice (read-aloud/read-aloud-memory.ts, issue #35)

ztts-substitute = Zotero-TTS: { $missing } is not offered here. Reading with { $instead } instead.
ztts-substitute-none = Zotero-TTS: { $missing } is not offered here, and no other voice of Zotero-TTS is. Zotero picks the voice.
ztts-substitute-paid = Zotero-TTS: { $missing } is not offered here, and no other voice of Zotero-TTS is. Zotero picks the voice; it may use credits.

## Auto-scroll

ztts-keep-following-visible =
    .label = Keep auto-scroll while the sentence is visible
ztts-help-keep-following-visible =
    .value = ?
    .help = On by default. In PDFs and EPUBs, manual scrolling keeps the current sentence where you put it, even at the edge. Following resumes when a later sentence is visible and you finish moving the page. While paused, the page stays put. Resuming playback always returns to the current sentence. Go to reading position and skip buttons also restore following. Turn this off to suspend following on any manual navigation until you resume playback, return or skip.

ztts-auto-scroll =
    .value = Auto-scroll
ztts-auto-scroll-sentence =
    .label = Center each sentence
ztts-auto-scroll-outside =
    .label = Scroll when outside the view
ztts-help-auto-scroll-sentence =
    .value = ?
    .help = Center the whole sentence vertically whenever a new sentence starts, even if it is already visible. Word highlights do not repeatedly recenter a fitting sentence. For PDFs and EPUBs; paginated EPUBs keep their pages. Go to reading position resumes following after you browse away.
ztts-help-auto-scroll-outside =
    .value = ?
    .help = Leave a fully visible sentence in place. Scroll to center it only when any part leaves the view. For PDFs and EPUBs; paginated EPUBs keep their pages. Sentences taller than the view start at their beginning, then follow the current word when available. Go to reading position resumes following after you browse away.

ztts-key-auto-scroll =
    .value = Auto-scroll mode
ztts-help-key-auto-scroll =
    .value = ?
    .help = Switch between Center each sentence and Scroll when outside the view. The choice applies to every PDF and EPUB and is saved. Works in a reader before or during playback; does not resume following after manual navigation.
ztts-action-auto-scroll = Auto-scroll mode
ztts-key-previous-voice =
    .value = Previous voice
ztts-key-next-voice =
    .value = Next voice
ztts-help-key-voice =
    .value = ?
    .help = Cycle through the player's current voice list. Voice, language and voice mode choices in the player switch the same way. The old voice continues until the new one is ready, then hands over at a word boundary or between sentences. While paused, the new voice prepares silently. Press Play to continue after the paused word if ready; otherwise the old voice resumes until the new one is ready. Without reliable word timing, the old voice finishes the sentence first. Only the latest choice takes effect. Preparation may use your provider's quota, even if you change your mind.
ztts-action-previous-voice = Previous voice
ztts-action-next-voice = Next voice
ztts-voice-preparing = Preparing voice: { $voice }
ztts-voice-failed = Could not switch to { $voice }. The previous voice is kept. Please try again.
ztts-voice-unavailable = The voice list is not ready. Open the player and try again.
ztts-auto-scroll-toast-sentence = Auto-scroll: center each sentence
ztts-auto-scroll-toast-outside = Auto-scroll: when outside the view
# The annotate keys (issue #145): Zotero's own H and U, bindable
ztts-key-highlight-sentence =
    .value = Highlight sentence
ztts-key-underline-sentence =
    .value = Underline sentence
ztts-help-key-annotate =
    .value = ?
    .help = While reading or paused, adds a highlight or underline annotation on the sentence being read, with its annotation popup open to add a comment. Early in a sentence, the one just finished is annotated instead. Pressing the other key while the popup is open switches between highlight and underline.
ztts-action-highlight-sentence = Highlight sentence
ztts-action-underline-sentence = Underline sentence

ztts-strip-angle-brackets =
    .label = Remove enclosing brackets when reading
ztts-bracket-pairs =
    .aria-label = Bracket pairs to remove
ztts-help-strip-angle-brackets =
    .value = ?
    .help = Remove the brackets wherever they enclose text, keeping the words inside. Separate pairs with spaces, for example <> [] () 【】. Turn this off to edit the list, then check it to validate and enable it. A bracket without its partner stays, and so do < and > written as comparisons, as in x < 5 and y > 3. Applies to all voices after stopping and reopening Read Aloud.
ztts-bracket-use-defaults = Use defaults
ztts-bracket-error-empty = Enter at least one bracket pair, separated by spaces. Use the default list <> [] instead?
ztts-bracket-error-entry = Invalid pair “{ $entry }”. Each pair must contain exactly two different punctuation or symbol characters. Use the default list <> [] instead?
ztts-bracket-error-duplicate = Duplicate pair “{ $entry }”. Enter each pair only once. Use the default list <> [] instead?


ztts-player-heading = Player
ztts-player-layout = Layout
ztts-player-bottom = Bottom bar
ztts-player-floating = Floating panel
ztts-player-top = Top bar
ztts-player-provider = Provider
ztts-player-locale = Language
ztts-player-voice = Voice
ztts-player-play = Play
ztts-player-pause = Pause
ztts-player-speed = Speed
ztts-player-volume = Volume
ztts-player-automatic = Following this document. Click to browse manually.
ztts-player-manual = Manual scrolling. Click to return to the spoken position and follow.
ztts-player-search = Search
ztts-player-empty = No matches
ztts-player-loading = Loading voices…
ztts-player-no-voices = No voices available. Enable a provider in Zotero-TTS settings.
ztts-player-favorite = Favorite
ztts-player-unfavorite = Remove favorite
ztts-player-retry = Retry
ztts-player-buffering = Buffering…
ztts-player-unavailable = Read Aloud is unavailable in this document.
# When the player cannot load in a document, Zotero's own player does not stand in (issue #134, ADR 0007)
ztts-player-failed = The Zotero-TTS player could not load here. To read aloud with Zotero's own player meanwhile, turn Zotero-TTS off under Tools → Plugins.
ztts-player-unavailable-choice = This voice or language is no longer available. Choose another one.
ztts-player-invalid-value = The selected value is not supported.
ztts-player-playback-error = Playback failed. Check your provider connection and try again.
ztts-player-quota-error = The provider has reached its limit or has insufficient credits.
ztts-player-favorite-guard = This change would remove a voice in use. Close the player in the affected tabs before changing it.

ztts-player-options = Options
ztts-player-previous-paragraph = Skip to Previous Paragraph
ztts-player-previous-sentence = Skip to Previous Sentence
ztts-player-next-sentence = Skip to Next Sentence
ztts-player-next-paragraph = Skip to Next Paragraph

ztts-playback-preparing = Preparing…
ztts-playback-failed = Unable to prepare audio. Try playing again.

ztts-action-player-layout = Player layout
ztts-key-player-layout =
    .value = Player layout
ztts-help-key-player-layout =
    .value = ?
    .help = Cycle Top bar → Bottom bar → Floating panel while the player is open. All players share the layout, and it is remembered after restart.
