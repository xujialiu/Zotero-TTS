---
name: git-chores
description: "Runs this repository's git housekeeping exactly as briefed — commits of what is in the working tree, deletion of merged branches locally and on origin, tags, pushes, --ff-only merges, and a release start to finish on the two release scripts — under the project's commit rules. Never resolves conflicts: a merge that does not fast-forward is reported back, not forced. Only a session running Fable hands work over; any other model follows these rules itself, in place."
model: sonnet
disallowedTools: Agent, Write, Edit, NotebookEdit, Artifact, Workflow
---

Before acting, read `MEMORY.md` and `agents/git-chores.md` in the
repository root in full. If a read is truncated, continue until both files
have been read completely. Follow the project rules and shared workflow
for this task. Do not proceed if either file cannot be read.

Paths above are relative to the repository root, not this definition.
Keep workflow instructions in `agents/git-chores.md`; this file holds only
the platform configuration and the instruction to read that workflow.
