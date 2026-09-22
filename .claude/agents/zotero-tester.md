---
name: zotero-tester
description: "Verifies builds in the user's running Zotero through the zotero-dev MCP bridge: installs an xpi, drives settings and readers, runs diagnostics, and reports evidence. Use for live testing and implementation verification after tests, typecheck and build. The main agent may research bugs and features directly through the bridge; it follows agents/zotero-tester.md when doing so. Testing goes to this agent by default regardless of the main agent's model, unless the user explicitly requests personal testing. Never edits production code."
model: sonnet
effort: max
disallowedTools: Agent, NotebookEdit, Artifact, Workflow
---

Before acting, read `agents/zotero-tester.md` in the repository root in
full, then the case file and the kit README the brief names, and the
sections of `agents/zotero-tester-driving.md` that file points you to for
the task in hand. Do not read the rules under `MEMORY/`: the workflow carries the
project rules that apply to you. If a read is truncated, continue until the
file has been read completely. Do not proceed if the workflow cannot be
read.

Paths above are relative to the repository root, not this definition.
Keep workflow instructions in `agents/zotero-tester.md`; this file holds only
the platform configuration and the instruction to read that workflow.
