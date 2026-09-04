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
ztts-field-address =
    .value = Address
ztts-heading-system-voices = System voices
ztts-system-note = Windows only.
ztts-help-system-voices =
    .value = ?
    .help = Windows only for now — macOS and Linux are not supported yet. The plugin takes over the voices Windows itself installs, so they come with the voice browser, samples, favorites, the cache and word highlighting, like every other provider's.

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
