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

ztts-field-server =
    .value = Server
ztts-server-other =
    .label = Other OpenAI-compatible server
ztts-field-api-key =
    .value = API key
ztts-field-base-url =
    .value = Base URL
ztts-field-model =
    .value = Model
ztts-field-voices =
    .value = Voices
ztts-openai-voices-input =
    .placeholder = auto-detect
ztts-field-extra-headers =
    .value = Extra headers
ztts-help-extra-headers =
    .value = ?
    .help = Only for a server reached remotely through Cloudflare Access: its service token as two headers, CF-Access-Client-Id: …; CF-Access-Client-Secret: … (see the Cloudflare tutorial in the README). Otherwise leave empty.
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

ztts-switch-enable = Enable
ztts-switch-disable = Disable
ztts-switch-checking = Checking…
ztts-switch-testing = Testing…


## Voice browser

ztts-heading-voice-browser = Voice browser
ztts-favorites-only =
    .label = Offer only favorite voices in the Read Aloud player
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
    .label = Extra pause between paragraphs
ztts-pause-ms =
    .value = ms
ztts-help-sentence-pause =
    .value = ?
    .help = How long every voice waits before the next sentence, at 1× speed; reading faster shortens it in step. Off: each voice pauses as Zotero sets it, which differs from voice to voice and does not shorten with the speed.
ztts-help-paragraph-pause =
    .value = ?
    .help = Added on top of the sentence pause where a paragraph begins, at 1× speed; reading faster shortens it in step. Off: Zotero's own extra, the same for every voice at every speed.
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
ztts-highlight-word =
    .value = Word
ztts-highlight-sentence =
    .value = Sentence
ztts-highlight-opacity =
    .value = Opacity (%)
ztts-sentence-under-word =
    .label = While highlighting words, keep the sentence highlighted too
# The preview's two sample lines. The spans are the markup's own elements,
# matched by data-l10n-name: the tag in gray, and the pieces
# ui/highlight-rows.ts paints — the sentence, and the word with the sentence
# before and after it.
ztts-preview-sentence-line = <span data-l10n-name="tag">Sentence mode</span>The first sentence has been read. <span data-l10n-name="active">Read Aloud is now on this sentence.</span> The next one follows.
ztts-preview-word-line = <span data-l10n-name="tag">Word mode</span>The first sentence has been read. <span data-l10n-name="before">Read Aloud is now on </span><span data-l10n-name="word">this</span><span data-l10n-name="after"> word.</span> The next one follows.
ztts-restore-colors =
    .label = Restore default colors


## Keyboard shortcuts

ztts-heading-shortcuts = Keyboard shortcuts
ztts-key-speed-reset =
    .value = Reset speed to 1.0×
ztts-key-slower =
    .value = Slower (−0.1×)
ztts-key-faster =
    .value = Faster (+0.1×)
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
    .help = Opens and closes the player's options panel — the speed slider, the tier, the language and the voice. Acts only while Read Aloud is open; otherwise the key keeps its usual meaning in the reader.
ztts-help-key-stop =
    .value = ?
    .help = Closes the Read Aloud player in every tab at once. Each tab keeps its place, and Read Aloud picks up there when you start it again. While no player is open the key keeps its usual meaning.
ztts-help-key-word-highlight =
    .value = ?
    .help = Switches the Read Aloud highlight between the word being spoken and the whole sentence — the same choice as Zotero's own Highlight current setting, for every tab, and it stays until changed again. A voice without word timing keeps highlighting the sentence either way.
ztts-help-key-volume =
    .value = ?
    .help = Changes the Volume setting above by 10%, for every voice, within the sentence being spoken. Acts only while Read Aloud is open; otherwise the key keeps its usual meaning in the reader.
ztts-restore-shortcuts =
    .label = Restore default shortcuts


## Backup

ztts-heading-backup = Backup
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


## Sync

ztts-heading-sync = Sync
ztts-field-webdav-url =
    .value = WebDAV URL
ztts-field-username =
    .value = Username
ztts-field-password =
    .value = Password
ztts-field-this-computer =
    .value = This computer
ztts-help-this-computer =
    .value = ?
    .help = The name this computer's settings file carries on the server, so each computer keeps its own and none overwrites another's. Renaming starts a fresh file under the new name.
ztts-sync-positions =
    .label = Sync reading positions between computers
ztts-help-sync-positions =
    .value = ?
    .help = Keeps where Read Aloud last stopped in each document in the WebDAV folder above, and picks up what your other computers left there — so play resumes at the same sentence anywhere. Off, reading positions stay on this computer.
ztts-auto-upload =
    .label = Keep this computer's settings uploaded automatically
ztts-help-auto-upload =
    .value = ?
    .help = A few seconds after any setting changes, this computer's file on the server is refreshed — nothing to remember before switching machines. Upload only: settings from another computer are never applied unless you restore them yourself.
ztts-upload-now =
    .label = Upload settings now
ztts-restore-from-server =
    .label = Restore settings from server…


## Build

ztts-heading-build = Build
# The Build line's three fields (ui/build-rows.ts): `Version 1.11.0 · Date 2026-09-06 · Author Xujia Liu`
ztts-build-version = Version { $version }
ztts-build-date = Date { $date }
ztts-build-author = Author { $author }
# The line under it, the repository: the link is named, not placed, so the
# markup's label named github takes the text between the tags wherever a
# language puts it
ztts-build-star = If you like Zotero-TTS, give it a ⭐ on <label data-l10n-name="github">GitHub</label> — it helps others find it.


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
ztts-not-tested = Not tested: { $reason }
# The Base URL of a hosted preset on another host (core/server-presets.ts addressHintText)
ztts-address-typo = { $host } looks like a typo of { $known }.
ztts-address-different = { $host } is not { $known }: a mirror or a proxy?
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

## The ? beside the Server dropdown, one note per preset (core/server-presets.ts)

ztts-preset-note-openai = Key and model from platform.openai.com; Voices may stay empty (OpenAI's own) or list newer ones. Extra headers are not needed for api.openai.com.
ztts-preset-note-chatterbox = Chatterbox has no key, ignores the model and publishes its own voices: only the address matters, plus Extra headers behind a gateway.
ztts-preset-note-mimo = Key from platform.xiaomimimo.com; free for now. Voices may stay empty for MiMo's built-in voices (Chinese and English) or list your own. Sentences are highlighted, not words: MiMo reports no word timings. Extra headers are not needed for api.xiaomimimo.com.
ztts-preset-note-other = Fill in what the server wants; Test connection says which of these it uses.

## The voice browser (ui/voice-browser-rows.ts)

# Zotero's own words for its three tiers (reader.ftl reader-read-aloud-voice-tier-*)
ztts-tier-standard = Standard
ztts-tier-premium = Premium
ztts-tier-local = Local
ztts-listing-voices = Listing voices…
ztts-no-voices = No voices. Enable a provider above.
ztts-listing-failed = Listing voices failed: { $problems }
ztts-plugin-voices-problem = the plugin’s voices: { $detail }
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
# The highlight key's toast (issue #67): the level it set, in Zotero's own words for it
ztts-highlight-toast-word = Highlight: word
ztts-highlight-toast-sentence = Highlight: sentence
# The word toast on a voice without word timing: the setting changed, the screen did not
ztts-highlight-toast-word-no-timing = Highlight: word (this voice has no word timing, so the sentence stays highlighted)

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
ztts-webdav-uploaded = Uploaded { $count } settings to { $file }. The file holds every setting, the API keys, gateway headers and WebDAV password included — keep the folder private.
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
ztts-webdav-machine-file = This computer's settings upload as { $file }.

## The reader: the line shown when Read Aloud does not start with the remembered voice (read-aloud/read-aloud-memory.ts, issue #35)

ztts-substitute = Zotero-TTS: { $missing } is not offered here. Reading with { $instead } instead.
ztts-substitute-none = Zotero-TTS: { $missing } is not offered here, and no Local voice is. Zotero picks the voice.
ztts-substitute-paid = Zotero-TTS: { $missing } is not offered here, and no Local voice is. Zotero picks the voice; it may use credits.
