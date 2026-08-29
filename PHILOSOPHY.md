# Philosophy

**Zotero TTS is an enhancer for Zotero's Read Aloud, not a replacement for it.**

## The idea

Zotero 10 reads documents aloud better than a plugin could. It analyzes
the document and skips citations, headers, footers, tables and equations;
it segments sentences and reads across columns and pages; it highlights
what is being read, keeps its place, and ships voices of its own. A plugin
that built a player of its own would have to redo all of that, worse, and
would leave you with two Read Alouds in one window.

So this plugin builds none of that. It adds voices to Read Aloud's Local
tier through the same interface Zotero's own remote voices use — next to
Zotero's Standard and Premium voices, not instead of them — and changes Read
Aloud's behavior only where Zotero offers nothing. Zotero reads; the plugin
speaks.

## Rules

1. **Zotero keeps doing the reading.** Segmentation, playback, prefetching,
   skipping, position and highlighting are Zotero's. The plugin's voices are
   ordinary entries in the player's Local tier, next to Zotero's Standard and
   Premium voices, which stay exactly as they are: the list grows, nothing on
   it is replaced.
2. **Add, never take away.** Everything the plugin changes is a setting
   whose alternative is Zotero's own behavior: the colors have a Restore
   button, the one-voice-everywhere memory has a switch, every shortcut can
   be cleared. Uninstall the plugin and Zotero is as it was.
3. **Honest signals.** A voice that does not report word timings highlights
   by sentence; the plugin never invents timings. Network calls time out
   and report; they do not hang.
4. **Bring your own provider.** No vendor is required or hard-coded.
   "OpenAI" means any server that speaks that API; keys stay on your machine.
5. **A thin hook, written down.** Read Aloud has no plugin API, so the
   plugin hooks internals: per reader tab, through the remote-voice
   interface and a few shadowed methods, pinned to one Zotero major. Each
   hook is verified against Zotero's source and recorded in
   [notes/NOTES.md](notes/NOTES.md). When Zotero offers an API, the hooks go.
6. **A setting must do something.** A setting that turns out to have no
   effect is removed (the synthesis speed was) or flagged in the README's
   TODO until it does (prefetch).

## When Zotero catches up

Every feature here is a stand-in for something Zotero does not offer yet.
When Zotero starts offering it — rebindable shortcuts, highlight colors,
one voice across documents, whatever comes next — the plugin's version is
removed in the following releases, not kept as a competing implementation.
The plugin is meant to shrink as Zotero grows; the voices may be the last
thing left.

## What stays out

- A second player, a reading list, a mini-reader.
- Replacing Zotero's voices or its document analysis.
- Features that duplicate what Read Aloud already does, and features that
  would fail silently when Zotero changes.

## The yardstick

A feature belongs here if it makes Read Aloud better while keeping it
Zotero's: more voices, more control over what it shows and how you drive
it, settings that follow you. A feature that needs Zotero to stop doing
something does not belong here; it belongs in a Zotero feature request.
