# AGENTS.md — Zotero-TTS

Before starting any task, read `MEMORY/MEMORY.md` from the repository root in full
and follow its instructions throughout the task. If a read is truncated,
continue reading until the entire file has been read.

## Agent definitions

Codex definitions are in `.codex/agents/*.toml`; Claude Code definitions are
in `.claude/agents/*.md`. Each definition points to its shared workflow in
`agents/`; read that workflow before performing the agent's work, including
when following it in the main session.

Keep this entry point thin. Edit shared project rules in `MEMORY/` — `MEMORY/MEMORY.md`
and the topic files it points to — and shared agent workflows in `agents/`.
