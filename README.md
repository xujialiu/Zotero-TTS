<p align="center"><img src="assets/icon.png" width="80" alt="Zotero-TTS icon"></p>
<h1 align="center">Zotero-TTS</h1>

<p align="center"><em>Text-to-speech for Zotero 10: more voices, word-and-sentence highlighting in your colors, keyboard shortcuts.</em></p>

<p align="center">
  <a href="https://www.zotero.org"><img src="https://img.shields.io/badge/Zotero-10-green?style=flat-square&logo=zotero&logoColor=CC2936" alt="Zotero 10"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases/latest"><img src="https://img.shields.io/github/v/release/xujialiu/Zotero-TTS?style=flat-square&label=Release" alt="Latest release"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/releases"><img src="https://img.shields.io/github/downloads/xujialiu/Zotero-TTS/total?style=flat-square&label=Downloads" alt="Downloads"></a>
  <a href="https://github.com/xujialiu/Zotero-TTS/commits/main"><img src="https://img.shields.io/github/last-commit/xujialiu/Zotero-TTS?style=flat-square&label=Last%20commit" alt="Last commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=flat-square" alt="License"></a>
</p>

<p align="center"><b>English</b> · <a href="README.zh.md">简体中文</a></p>

<p align="center"><img src="assets/word-highlight.gif" width="720" alt="Read Aloud reading a paragraph: the word being read in blue, its sentence in yellow"></p>

<p align="center">If you like Zotero-TTS, give it a ⭐ on <a href="https://github.com/xujialiu/Zotero-TTS">GitHub</a> — it helps others find it.</p>

## What it adds

Zotero-TTS adds voices and a player to Zotero 10: each provider is an entry
of the player's first dropdown, and Zotero's own Standard and Premium are
two more, each behind a switch of its own. It
is built for the way its author reads —
[why, and where it is going](docs/PHILOSOPHY.md).

- 🗣️ **More voices in the Read Aloud player**, one entry per provider — Azure Speech, Cloudflare Workers AI, Speechify, Fish Audio, a [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) or a [Fish Speech](https://github.com/fishaudio/fish-speech) server on your machine, OpenAI, Xiaomi MiMo or any OpenAI-compatible server — with Zotero's own Standard and Premium beside them, each behind a switch. [→ Providers](#providers)
- 🎛️ **A player in three layouts** — a bottom bar, a top bar below the toolbar, or a floating panel. Change layout without interrupting playback. [→ Player](#player)
- 🔖 **Resume where you stopped** — close a document, open it again later, press `Shift+Space`, and Read Aloud starts at the sentence you left off on. [→ Resume where you stopped](#resume-where-you-stopped)
- 📄 **The whole sentence on screen** — while a PDF is read, a sentence that runs past the bottom of the window, onto the next page or into the next column is scrolled into view instead of left cut, and `Shift+Enter` brings it back the same way. [→ Reading](#reading)
- 📃 **No line lost at a page turn** — when a sentence runs onto the next page and Zotero would skip that page's first line, the line is read and highlighted like any other. [→ Reading](#reading)
- 🧵 **No sentence cut in two** — when Zotero breaks a paragraph in the middle of a sentence, the halves are read and highlighted as one sentence. [→ Reading](#reading)
- 🎧 **A voice browser** in the settings: every voice by provider and language, a play button for a short sample, hearts for favorites, and a switch to offer only the favorites. [→ Voice browser](#voice-browser)
- ✨ **Word *and* sentence highlighting**, each behind a switch of its own, in your own colors and opacities — for Zotero's voices too. [→ Highlight](#highlight)
- ⌨️ **Keyboard shortcuts** for speed, volume, jumping by sentence or paragraph, reading from the selection, the player's options panel, auto-scroll mode, the word highlight on or off, and stopping Read Aloud in every tab at once. All rebindable. [→ Shortcuts](#keyboard-shortcuts)
- 📌 **One voice and speed everywhere** — every document and every open tab, instead of Zotero's choice per language. [→ Reading](#reading)
- ⏱️ **The pauses are yours** — how long every voice waits between sentences and before a paragraph, shorter as you read faster. [→ Reading](#reading)
- 💾 **Backup and sync** — settings and reading positions as files, or through your own WebDAV folder, so your settings and bookmarks follow you between computers. [→ Backup and sync](#backup-and-sync)
- 🖥️ **Windows and macOS voices, spoken by the plugin** — the ones Read Aloud already lists, but with samples, favorites, the cache and, on Windows, word-by-word highlighting. [→ Providers](#providers)

## Install

1. Download `zotero-tts.xpi` from the [latest release](https://github.com/xujialiu/Zotero-TTS/releases/latest) — in Firefox, right-click → *Save Link As…*
2. **Tools → Plugins → ⚙ → Install Plugin From File…**, then restart Zotero.
3. Enable a provider in **Edit → Settings → Zotero-TTS**, then pick it in the player's first dropdown — **Kokoro**, **Azure** — and one of its voices, `af_bella`, `Ava Multilingual`.

<p align="center"><img src="assets/popup.png" width="640" alt="The Read Aloud player with a provider chosen in its first dropdown"></p>

## Providers

| Provider | What you need | Cost | Highlighting |
|---|---|---|---|
| **Azure Speech** | Speech resource key + region · [tutorial](tutorials/azure-speech-free-tier.md) | Free tier: 500,000 characters a month | word; sentence for the voices named *MAI-Voice-2* |
| **Cloudflare Workers AI** | Account ID + API token · [tutorial](tutorials/cloudflare-workers-ai.md) | 10,000 free Neurons a day: a few pages with an Aura voice, hours with MeloTTS | sentence |
| **Speechify** | An API key from platform.speechify.ai · 36 languages, no Mandarin | Free: 50,000 characters a month, about fifteen pages; then $10 a month for a million | word |
| **Fish Audio** | An API key from fish.audio · official voices, your own clones, and Model IDs, with a switch for each source · [tutorial](tutorials/fish-audio.md) | Free with its free model: no cap, no guarantee; the paid one $15 per million bytes of text, three per Chinese character | word |
| **Kokoro-FastAPI** | A server on your machine or LAN · [tutorial](tutorials/kokoro-fastapi.md) | Free; CPU works, a GPU is faster | word |
| **Fish Speech** | A [fish-speech](https://github.com/fishaudio/fish-speech) server on a 24 GB GPU, with voices cloned from your own recordings · [tutorial](tutorials/fish-speech-server.md) | Free | sentence |
| **OpenAI** | An API key from platform.openai.com | Billed per character | sentence |
| **Xiaomi MiMo** | An API key from platform.xiaomimimo.com | Free for a limited time | sentence |
| **OpenAI Compatible** | The address of any server that speaks OpenAI's API, and a key if it wants one: a self-hosted [Chatterbox](tutorials/chatterbox-tts-server.md), a hosted service, a proxy of OpenAI | The server's own price; self-hosted servers are free | sentence |
| **System voices** | Nothing — Windows and macOS | Free, offline | word on Windows, sentence on macOS |
| **Zotero Standard / Premium** | A Zotero account signed in under Edit → Settings → Sync; a switch each in the **Zotero** section, both on to begin with | Zotero's own credits, shown and bought in the player | word |

The player's first dropdown lists every enabled provider that has voices
right now, and Zotero's own **Zotero Standard** and **Zotero Premium**
while their switches are on, sorted by name.

- **The entries** are Azure, Cloudflare, Fish Audio, Fish Speech, Kokoro,
  OpenAI, OpenAI Compatible, Speechify, System, Xiaomi MiMo, Zotero
  Premium and Zotero Standard; the voices under them carry their own
  names.
- **Each entry remembers its own last voice** per language: Kokoro → Fish
  → Kokoro brings the Kokoro voice back.
- **A provider with nothing to offer** — switched off, its server down,
  no favorite of its own while only favorites are offered — is not
  listed until it has voices again.
- **When the entry you are on stops offering voices**, the player moves
  to the provider of the remembered voice, else of the default voice,
  else to the first entry.
- **Switching provider or language while paused** takes effect at once;
  press play and the sentence starts over in the new voice. A voice
  picked while paused waits for play and carries on from the paused word.
- **Zotero's own first-run window and its *Manage voices* window** keep
  filing every plugin voice under Local.
- **Enable**, at the end of every provider section, runs the connection
  check first: a provider that does not answer never switches on.
- **Zotero's own Standard and Premium** have a switch each in the
  **Zotero** section, both on to begin with. Switch one off and that tier
  leaves the player's first dropdown, the voice browser and the language
  list; nothing Zotero remembers is lost, and switching it back on brings
  its last voice back. Enable checks that a Zotero account is signed in
  and that Zotero lists voices in that tier; Test connection reports the
  voices and the credits left.
- **Test connection** probes without switching anything on.
- While a provider is on its fields are locked — **Disable** to edit them.
- API keys, gateway headers and the WebDAV password are masked. Like every
  plugin setting they are stored in Zotero's preferences in plain text, and
  they go into the settings backup file.

<details>
<summary><b>OpenAI, Xiaomi MiMo and OpenAI Compatible: how to fill the settings in</b></summary>

- **OpenAI** and **Xiaomi MiMo** each have a section of their own: the
  API key, the **Model**, and **Voices** to list voice ids yourself,
  comma-separated — left empty, the service's own voices are offered.
  Their addresses are fixed.
- **OpenAI Compatible** is for any other server that speaks OpenAI's API:
  a [Chatterbox](tutorials/chatterbox-tts-server.md) of your own, a hosted
  service, a proxy or mirror of OpenAI. **Address** is the server, with or
  without `/v1`; the **API key** may stay empty for a server that has
  none; **Model** is the name the server expects, and **Test connection**
  lists the models it has; **Voices** left empty takes the server's own
  list. One server at a time.
- All three highlight by sentence: none of them reports word timings.
- For Kokoro use the **Kokoro-FastAPI** section instead: that is what gets
  you word-level highlighting.
- Settings saved when the three were one section with a **Server**
  dropdown move into their sections on the first start: the server that
  was chosen keeps its switch, the other two start off, and a settings
  backup from that time restores the same way.

</details>

<details>
<summary><b>Cloudflare Tunnel and other gateways</b></summary>

Put the gateway's headers in **Extra headers** — of the OpenAI Compatible
section, or of the **Kokoro-FastAPI** one — as `Name: value` pairs separated by `;`,
for example `CF-Access-Client-Id: …; CF-Access-Client-Secret: …`.
They go out with every request. [Tutorial](tutorials/remote-access-cloudflare.md).

</details>

<details>
<summary><b>System voices</b></summary>

Read Aloud already lists the voices Windows and macOS install, under
**Local**, but bare: no sample, no favorite, no cache, no word highlight.

**Enable** in the *System voices* section gives them all of that:

- They come back under a **System** entry of the player's first dropdown —
  `Microsoft David`, `Samantha` and so on — the same voices, now with the
  voice browser, samples, favorites and the cache behind them.
- Word-by-word highlighting on Windows. On macOS the highlight stays on the
  sentence, and every sentence takes about half a second to start.
- Zotero's own copies leave the player, so nothing is listed twice, and a
  voice you had already picked keeps playing.
- At speed these voices sound a little different from before.
- On Windows you may see one `powershell.exe` while Zotero is open; Linux
  is not supported.

</details>

## Resume where you stopped

Close a document in the middle of listening, quit Zotero, come back days
later, press `Shift+Space` — Read Aloud goes on from the sentence you
stopped at. Zotero on its own does not keep that place; the plugin keeps it
for every document you have listened to.

- Reading resumes at the **start** of that sentence, never half way into it.
- Nothing is drawn in the document and nothing is added to your annotations.
- A document you have never listened to starts from the page you are
  looking at.
- Positions stay on this computer until you switch on *Sync reading
  positions between computers* ([Backup and sync](#backup-and-sync)); then
  they follow you: stop on one, press `Shift+Space` on another, and reading
  continues at that sentence.

## Settings

### Player

- **Use plugin player** is on by default. Click the red headphones icon
  in the reader to open the player and start reading; click again to stop
  and close it. Switch the setting off to use Zotero's original player.
- **Bottom bar, Top bar, Floating panel** are available in Settings and
  from the player's layout button. Bars reserve space only in the document
  area; the floating panel can be dragged. The top bar is the default when
  no layout has been saved; existing choices are kept.
- **Provider, language, voice, speed and volume** use the same choices as
  the voice browser and keyboard shortcuts. Hearts on the left mark the
  same favorites as Settings.
- **Floating controls** include four sentence/paragraph skip buttons around
  Play/Pause. **Options** at the upper left, or **Shift+O**, hides or shows
  the provider, language and voice rows; **Layout** is at the upper right.
  Each opening follows *Open the player expanded* in Reading settings.
- **Floating menus** open below their button when they fit, above otherwise.
  If neither side fits, the larger side gets a shorter, scrollable menu.
  Language and voice search boxes stay visible while choices scroll in all
  three layouts.
- **Speed controls** in the player, Settings and keyboard shortcuts change
  by 0.05×, within the existing 0.5×–3× range.
- **A / M** shows whether this document is following the narration.
  Scrolling by hand shows **M**, even while the current sentence remains
  visible. A later visible sentence restores **A** when following resumes.
- **Click A to stay in manual mode** through later sentences. Click **M**,
  press **Shift+Enter**, skip a sentence or paragraph, or resume playback
  to return to the spoken position and restore **A**. Pausing alone keeps
  A/M unchanged; returning or skipping while paused does not start playback.
  Other documents keep their own following state.
- **Theme and controls** follow the reader's appearance. Loading and
  playback errors appear in the player; an error can be opened for details
  and a retry.

Everything is under **Edit → Settings → Zotero-TTS**.

### Highlight

<p align="center"><img src="assets/settings-highlight.png" width="520" alt="The Highlight group"></p>

- *Sentence* and *Word* are two switches, both on to begin with: the word
  being spoken in its color, its sentence in the sentence color under it.
  One off leaves only the other; the last one on cannot be turned off.
- A color and an opacity for each — for Zotero's own voices too. The
  default is a blue word on a yellow sentence, both at 70 %; *Restore
  default colors* brings it all back, the switches included.
- The preview is painted in your reader's theme.
- Zotero's own **Highlight current** setting (Settings → General → Read
  Aloud) follows this choice and is greyed out while Zotero-TTS is
  installed; there is no paragraph level.
- A voice without word timing highlights the sentence whatever the
  switches say.

### Keyboard shortcuts

<p align="center"><img src="assets/settings-shortcuts.png" width="440" alt="The Keyboard shortcuts group"></p>

**`Shift+Space` is the only key you need** — one key, whatever the reader is
doing:

- Text selected: reading starts there.
- Nothing selected, a document you have listened to before: reading picks up
  at [the sentence you stopped on](#resume-where-you-stopped).
- Nothing selected, a document you have never listened to: reading starts
  from the page you are looking at.
- Read Aloud already playing: it pauses; pressed again it goes on from the
  same sentence — or from the selection, if you made one while it was
  paused.

- **Waiting for playback** shows “Preparing…” until audio starts, including
  when resuming or moving to another sentence. Fast starts and configured
  sentence pauses do not flash a notice. A voice-switching notice takes
  priority while a new voice is being prepared.

- **Player position — `Shift+P`** cycles Top bar → Bottom bar → Floating
  panel while the plugin player is open, playing or paused. All players
  share the position, and it is remembered after restart. Holding the key
  switches only once; typing in a text field leaves the position alone.
- **Faster / slower — `Shift+C` / `Shift+X`** support holding the key to
  repeat at your system's keyboard rate, in 0.05× steps within 0.5×–3×.
- **Custom keys** — record another binding, clear it, or restore defaults
  in Keyboard shortcuts. Held speed changes also work with custom keys.

**`Shift+S` stops Read Aloud everywhere** — every tab's player closes at
once, a short message says how many, and each tab keeps its place for the
next time. While no player is open the key keeps its usual meaning.

**`Shift+W` turns the word highlight on and off** without leaving the
document — the *Word* switch of the [Highlight](#highlight) section. It
takes effect on the sentence being spoken, in every tab, and stays until
you change it again; a short message says what is highlighted now. Turning
it off never leaves the page bare: the sentence comes on. A voice without
word timing keeps highlighting the sentence either way, and the message
says so.

- **Previous / next voice** — `Shift+,` / `Shift+.` cycle through the
  player's current voice list, wrapping at either end. Choosing a voice,
  language or voice mode in the player uses the same switching behavior.
- **While playing**, the old voice continues until the new one is ready,
  then hands over at a word boundary, or between sentences when necessary.
  A short message names the voice.
- **While paused**, the new voice prepares silently. Press Play to continue
  with it after the paused word if it is ready; otherwise the old voice
  resumes until the new one is ready. Without reliable word alignment,
  the old voice finishes the sentence before switching.
- **While a voice is preparing**, another selection cancels the previous
  request and only the latest choice takes effect. A failed preparation
  keeps the original voice and shows a message. Skipping, changing speed
  or closing the player cancels the pending switch. Preparation may use
  your provider's quota even if you change your mind.

### Voice browser

<p align="center"><img src="assets/settings-voices.png" width="700" alt="The voice browser: provider, language and voice columns"></p>

Every voice Read Aloud can use, in the player's own three steps —
provider (or Zotero's Standard / Premium), language, voice.

- **▶** plays a short sample, **♥** marks a favorite.
- A click on a row makes that voice the **default**: what Read Aloud starts
  with, in every document.
- **Speed** is the player's own slider (0.5×–3×); **Volume** is how loud
  Read Aloud plays, 100% being Zotero's own level.

<details>
<summary><b>Favorites, samples, the default voice</b></summary>

- **Every enabled provider has a column** — `(0)` while it lists nothing —
  and **Zotero Standard** and **Zotero Premium** are Zotero's own, each
  while its switch is on; multilingual voices sit under "Multiple
  languages", first in the language column.
- **▶** — a sample in the voice's own language: your voices cost one short
  request, Zotero's own cost nothing.
- *Offer only favorite voices* trims the Read Aloud player to the marked
  ones **for every provider** — a provider you marked nothing in leaves
  the player's first dropdown, Zotero's own two included. With nothing
  marked at all, or when none of the
  marked voices is listed any more, everything is offered again. While the
  switch is on, only a favorite can be the default, and the switch stays
  off while the default is not one. Favorites travel with the settings
  backup.
- The hearts show in the player's own voice list too: with *Offer only
  favorite voices* off, a marked voice carries a ♥ in the dropdown and the
  rest do not, so a favorite is findable without giving up every other
  voice. A marker, not a button — hearts are set here — and it is gone
  while the switch is on, where every listed voice is one.
- A click on the default row clears the default, back to Zotero's own
  per-language choice. Pick another voice in any tab's player while the
  settings are open and the highlight moves there.
- The **Speed** slider plays the samples at that speed, and releasing it
  makes that the speed Read Aloud starts with — at once in a document that
  is playing. Changing the speed costs nothing and leaves the pitch alone.
- **Volume** (0–100%) applies to every voice, Zotero's Standard and
  Premium included, and to the samples; a change lands on the sentence
  being spoken, in every open tab. `Shift+↑` / `Shift+↓` move the same
  number while Read Aloud is open.
- **Changes during reading** — settings that leave every current reading
  session unaffected can be changed immediately. A change affecting a
  session is refused and names its tab. Close the affected player, then
  try again; paused and background tabs count too. Playback is never
  stopped automatically.
- **Voice lists** update without interrupting or replaying the current
  sentence. A voice in use cannot be removed from the list or have its
  provider disabled or reconfigured during that reading session.
- **Restore and sync** — a settings backup is restored completely or
  refused completely if it would affect reading. Background settings sync
  applies unaffected changes and holds affected changes until those
  reading sessions end.

</details>

### Reading

<details>
<summary><b>Expanded player, one voice everywhere, pauses, prefetch, cache, the whole sentence on screen, a page's first line, a sentence split in two</b></summary>

- *Open the player expanded* — show the floating panel's provider, language
  and voice rows whenever it opens; with Zotero's original player, show its
  options panel. Off by default. Options or Shift+O changes this opening
  only. Changes to the setting apply at the next opening.

- *Use one voice everywhere* — one voice for every document and every open
  tab, whatever the document's language. Off, Zotero remembers a voice per
  document language.
- *Use one speed everywhere* — one speed for every document and every open
  tab, set from the player's slider, the shortcuts or the settings slider.
  Off, Zotero keeps a speed per document language.
- *Pause between sentences* — how long every voice waits before the next
  sentence, whatever its provider, at 1× speed; reading faster shortens it in
  step. On at 0 by default, so every voice runs sentence to sentence. Off,
  each voice pauses as Zotero sets it.
- *Extra pause between paragraphs* — added on top where a paragraph
  begins, at 1× speed, shortened in step with the speed. On at 200 ms by
  default. Off, Zotero's own pause, the same at every speed.
- *Remove enclosing brackets when reading* — on by default for every voice,
  with `<> []` as the default pairs. `<Hello> [World].` is read as
  `Hello World.`, keeping outside punctuation and spacing. Turn it off
  to edit the pairs, separated by spaces, then check it to validate and
  enable. Invalid input offers a choice to use the defaults or keep editing.
  Ordinary words outside the groups keep the original text unchanged.
  The document is unchanged. Stop and reopen Read Aloud after a change.
- *Prefetch upcoming sentences* — the ones ahead are synthesized while the
  current one plays, so playback never waits for the server. It needs the
  cache below, and keeps it switched on.
- *Cache synthesized audio* — skipping back or reopening a document costs no
  new request. In memory (64 MB); a Zotero restart empties it.
- *Auto-scroll* — for PDFs and EPUBs, choose *Center each sentence* (the default) or
  *Scroll when outside the view* in the Highlight settings.
  Press `Shift+A` to switch modes; the current mode appears briefly.
  The first centers the whole sentence when it starts; the second leaves
  fully visible sentences in place and centers them only when clipped.
  Word highlighting does not move a fitting sentence word by word.
  Sentences taller than the view start at their beginning, then follow
  the current word when real word timing is available; without it, only
  the beginning can be located reliably. Paginated EPUBs keep their pages.
  Document boundaries may limit centering.
- *Browse while listening* — by default, manual scrolling or page navigation
  keeps the current sentence where you put it, even if part is outside the
  view. Moving that same sentence back into view does not recenter it.
  Following resumes when a later sentence is visible and you finish moving
  the page. If later sentences stay outside the view, the page stays put.
  Normal playback without manual browsing still brings clipped text into view.
  Turn off *Keep auto-scroll while the sentence is visible* to suspend
  following as soon as you scroll or navigate and resume only on request.
- *Pause and return* — while paused, the page stays where you leave it.
  Resuming playback immediately centers the current sentence and restores
  following, even if you have browsed away. *Go to reading position*
  (default `Shift+Enter`) and the player's skip buttons also locate the
  sentence and restore following, including while paused.
  Paginated EPUBs navigate to the sentence's page; document boundaries and
  sentences taller than the view may limit centering.
  Changing either auto-scroll setting does not interrupt audio or override
  manual sentence placement. Automatic scrolling, zoom and window changes
  do not by themselves turn following off. Both settings are saved, backed
  up and synchronized with your other settings.
- *Read a page's first line when Zotero would skip it* — a sentence that
  runs onto the next page can lose that page's first line: Zotero reads
  straight past it, and the join sounds like a sentence. On, the line is
  read and highlighted like any other. Off if a page header is ever read
  aloud; a change applies to documents opened from then on.
- *Read a sentence Zotero split in two as one* — Zotero sometimes breaks a
  paragraph in the middle of a sentence and reads the halves as two
  sentences, with a pause between them. On, the halves are read and
  highlighted as one. Off if two paragraphs are ever read as one; a change
  applies to documents opened from then on.

</details>

### Backup and sync

**WebDAV** — one folder of your own, used by the sync and by the server
backup below.

- Enter the folder's address, your user name and password, and press *Test
  connection*.

<details>
<summary><b>WebDAV URL examples</b></summary>

The URL is a folder, created on the first upload. Nextcloud:
`https://cloud.example.com/remote.php/dav/files/<user>/zotero-tts/`;
Jianguoyun: `https://dav.jianguoyun.com/dav/zotero-tts/` with an app
password.

</details>

**Sync** — what follows you between computers on its own, both ways.

- *Sync reading positions between computers:* stop listening on one
  computer, press `Shift+Space` on another, and reading goes on from that
  sentence. Every computer sharing the folder and the same library stays in
  step, and turning it on loses no bookmark, whichever computer it came from.
- *Sync settings between computers:* a change on one computer reaches the
  others within seconds, and theirs reach it, with nothing to restore. Off
  by default.
- *What stays on each computer:* a voice server at a local or home-network
  address, the *System voices* switch, and the WebDAV connection itself.
- *Two computers change the same setting:* the later change wins.
- A provider the sync brings a change to, but that cannot work on that
  computer, stays off there and says why.

**Backup** — one-way copies, restored by hand.

- *Backup settings…* and *Restore settings…* keep every setting as one
  file; *Export reading positions…* and *Import reading positions…* carry
  the bookmarks as another. Restoring settings replaces them all; importing
  positions only takes the newer ones.
- *Keep a backup of this computer's settings on the server* refreshes this
  computer's own copy in the WebDAV folder a few seconds after any change;
  *Back up to the server now* writes it by hand, and *Restore settings from
  server…* brings any computer's copy back. A backup, not the sync: nothing
  changes anywhere until you restore it.
- A provider that cannot work on the computer you restore to stays off and
  says why.
- Restoring a backup counts as changing every setting in it, so with the
  sync on it reaches your other computers too.

## Troubleshooting

<details>
<summary><b>Common problems</b></summary>

- **"Cannot reach Kokoro at http://localhost:8880. Is the server running?"**
  (or *Cannot reach Fish Speech at …*): the server is down or listening at
  another address — the line names the one it tried; `docker ps` should
  list the server; see its tutorial.
- **Voices play but nothing is highlighted word by word.** Set *Settings →
  General → Read Aloud → Highlight current* to **Word**, and use a voice
  that reports word timings: Kokoro, Speechify, Fish Audio, or an Azure voice without
  *MAI-Voice-2* in its name (those highlight by sentence).
- **With an Azure voice named *Dragon Latest*, the word highlight jumps
  to the paragraph's last word about ten seconds in** and stays there
  until the next paragraph. It is the voice, not the plugin: Azure's other
  voices — *Dragon HD Flash*, Multilingual, the plain ones — track every
  word.
- **"An unknown error occurred" part-way through a document** with an
  OpenAI-compatible server: the server failed on one segment; check its log.
- **The plugin's voices are missing after a Zotero update.** An update can
  take them out until the plugin catches up; Zotero's own keep working.
  Open an
  [issue](https://github.com/xujialiu/Zotero-TTS/issues) with the Zotero
  version.

</details>

## Compatibility

- Zotero 10 on the desktop, any 10.x build, source builds included. In use
  on Windows and macOS; Linux should be the same, but is untested.

## Development

```
npm install
npm test          # vitest, also builds build/zotero-tts.xpi
npm run typecheck
npm run build
```

[notes/NOTES.md](notes/NOTES.md) records the Zotero internals the plugin relies on and
every incident so far.

## Acknowledgments

- Developed with the help of
  [introfini/mcp-server-zotero-dev](https://github.com/introfini/mcp-server-zotero-dev),
  the MCP bridge that drives Zotero from the outside.

## License

[AGPL-3.0](LICENSE), the same license as Zotero itself. Not affiliated with Zotero.

## Buy me a coffee

<a href="https://buymeacoffee.com/xujialiu"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="60" alt="Buy me a coffee"></a>
