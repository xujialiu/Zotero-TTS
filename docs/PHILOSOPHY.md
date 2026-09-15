# Philosophy

**English** · [简体中文](PHILOSOPHY.zh.md)

**I build Zotero-TTS for the way I read, and step by step it is moving off
Zotero's Read Aloud.**

## Why it exists

I use Zotero-TTS every day to listen to papers and novels. Zotero 10's Read
Aloud makes design choices and trade-offs that do not suit me. The plugin
began by adding voices to it and now changes it wherever I want it to work
differently; step by step, it will stop depending on Read Aloud.

## The yardstick

- **My preference decides.** A feature is built because I want it.
- **Requests are welcome.** I build the ones I like that do not get in my
  way; when I will not build one, I say so and close it.
- **Bugs are fixed by severity, whoever hits them.** On a setup I cannot
  reproduce, I ask the reporter to confirm the fix.

## Rules

1. **Honest signals.** A voice that does not report word timings highlights
   by sentence; the plugin never invents timings. Network calls time out
   and report; they do not hang.
2. **Bring your own provider.** No vendor is required or hard-coded;
   "OpenAI" means any server that speaks that API. Keys go only to the
   provider they belong to and to the backups you choose.
3. **No silent spending.** The plugin never spends your money without you
   knowing.
4. **Uninstalling is safe.** Remove the plugin and Zotero keeps working.
5. **Every hook written down.** Where the plugin reaches into Zotero's
   internals, each hook is verified against Zotero's source, recorded in
   [notes/NOTES.md](../notes/NOTES.md) and pinned to one Zotero major.
6. **A setting must do something.** A setting that turns out to have no
   effect is removed, as the synthesis speed was.

## What stays out

- **My own analysis of the document.** Telling body text from headers,
  footers and citations, and following a paragraph across columns and
  pages, stays Zotero's: Zotero maintains it for more than Read Aloud, and
  redoing it would be a project of its own.
- **Features that fail silently when Zotero changes.**
