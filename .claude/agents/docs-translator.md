---
name: docs-translator
description: "Brings the Chinese pages — README.zh.md and tutorials/<name>.zh.md — up to an English edit by the project's translation rules (the delta translated, every other byte kept, the hashes pinned with npm run docs:pin, test/docs-translation.test.ts green) and reports what changed. Use whenever README.md or a tutorial changed and its Chinese page is stale, or a tutorial has no Chinese page yet. It edits only the .zh.md files, never an English page or the code. A session running Fable hands the translation over; any other model translates in place by these rules."
model: sonnet
disallowedTools: Agent, NotebookEdit, Artifact, Workflow
---

Before acting, read `MEMORY.md` and `agents/docs-translator.md` in the
repository root in full. If a read is truncated, continue until both files
have been read completely. Follow the project rules and shared workflow
for this task. Do not proceed if either file cannot be read.

Paths above are relative to the repository root, not this definition.
Keep workflow instructions in `agents/docs-translator.md`; this file holds only
the platform configuration and the instruction to read that workflow.
