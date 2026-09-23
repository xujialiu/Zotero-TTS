# Agents — Zotero-TTS

Who does which work, the main session or an agent; how agents are defined;
and how the main session waits on them. Part of the project rule book,
whose core is `MEMORY/MEMORY.md`.

- **Agent definitions** (settled 2026-09-12): `agents/<name>.md` holds each
  agent's shared workflow. Its entry points are `.codex/agents/<name>.toml`
  and `.claude/agents/<name>.md`; both must require reading the shared
  workflow before acting, and the workflow says which rules under `MEMORY/`
  are read too: `docs-translator`'s entry points require `MEMORY/MEMORY.md`
  and its workflow `MEMORY/docs.md`; `zotero-tester`'s read nothing under
  `MEMORY/` (settled 2026-09-14 — the rule book, then one 12k-token file,
  was on every one of the tester's calls and mostly not its business). The
  rules the tester needs are carried in `agents/zotero-tester.md` under
  "The rules you carry", sourced from `MEMORY/`.
  Keep paired names, descriptions and workflow references consistent when
  adding, renaming or removing an agent. Edit a shared workflow only once.
  Preserve platform-specific configuration and tool restrictions: Codex
  uses `gpt-6-luna` at maximum reasoning effort, while Claude keeps its
  native `opus`/`sonnet` models — `zotero-tester`'s Claude definition is
  `model: sonnet` with `effort: max` since 2026-09-15, by the user's
  request after two Sonnet runs verified issue #110 (the frontmatter's
  `effort` takes low / medium / high / xhigh / max). An explicit model or reasoning-effort
  override requires the user's request. Check both entry points and their
  shared targets before finishing; do not leave synchronization for later.
- **Delegation is decided per agent** (settled 2026-08-28, gated
  2026-08-28, widened 2026-08-30, split 2026-09-04, a third agent
  2026-09-06, a model per agent 2026-09-08, a Codex default 2026-09-11,
  Astra delegation 2026-09-12):
  `gpt-6-luna` at maximum reasoning effort is the default for every
  Codex-spawned agent, including named definitions and generic
  `general-purpose` workers and reviewers. The Codex definitions pin
  `model = "gpt-6-luna"` and `model_reasoning_effort = "max"`. An
  explicit model or reasoning-effort override is allowed only when the
  user asks for it. Claude definitions keep their native `opus`/`sonnet`
  models because Luna is unavailable in Claude Code; those values must not
  be copied into Codex definitions. Who hands work to them is decided
  agent by agent. Astra (`gpt-6-astra`) follows the same delegation rules
  as Fable for translation: it goes to `docs-translator`.
  **Research and testing have different drivers** (settled 2026-09-14):
  when researching a bug or feature, the main agent may call the zotero-dev
  MCP tools directly, without a separate request from the user. Read
  `agents/zotero-tester.md` first and follow its research, evidence and
  restoration rules. Live testing and verification of an implementation
  go to `zotero-tester` by default, regardless of the main agent's model,
  subject to the explicit-user-request and release-specific exceptions below.
  `docs-translator` is handed over by a Fable or Astra
  session; every other model translates itself, here, in place.
  **Explicit requests to drive Zotero personally override delegation**
  (settled 2026-09-13): when the user asks the main session to use
  zotero-dev itself, the main session runs the bridge directly and does
  not call `zotero-tester`, regardless of model. Read and follow
  `agents/zotero-tester.md` first; the same investigation, verification,
  evidence and restoration rules still apply.
  **A blocked tester keeps ownership** (settled 2026-09-15, issue #108):
  a usage limit, tool failure, interruption or delay leaves live testing
  with `zotero-tester`. Report the blocker, continue independent work,
  and resume the tester when possible. If it remains blocked, report
  that to the user. "Continue", "finish the tests" and approval to merge
  or push after testing preserve this assignment; they do not authorize
  the main session to take over. Personal testing requires the user's
  explicit request to change the driver. Keep the configured agent model
  too unless the user explicitly requests a model change. The main session
  incorrectly took over after the tester exhausted its quota in #108;
  the user required the tester to complete verification itself.
  Git housekeeping and releases are always performed by the main session. The agent files stay the rule book either way: read
  the agent's shared workflow before doing its work by hand, and only then — a
  session that delegates never reads it, since the brief's shape is in
  `MEMORY/` and a rulebook is 6k tokens on every later call.
- **Wait when agents are the only remaining work** (settled 2026-09-12):
  when delegated work is running and no independent task remains, stop
  active work and wait for an agent result or new user input. Use a
  long blocking agent wait; do not repeatedly poll agent status or files,
  rerun checks, or send repetitive progress updates merely to stay active.
  **Be patient: elapsed time alone is not a reason to check, send another
  status request, hurry the agent, or interrupt it.** Repeated short waits
  and status requests waste tokens without advancing the work. Let the
  agent finish; interrupt only for a concrete safety concern, a changed
  requirement, or the user's request. Resume only when a result, a question,
  or new input requires action.
- **A definition can go missing** (issue #27). Agent definitions
  under `.claude/agents/` are read when a session starts, and one is
  dropped silently — "not found", no error anywhere — when its
  `description:` is unquoted and contains `: ` while the file has CRLF
  line endings, which `core.autocrlf` gives every fresh Orca worktree
  (issue #27): keep the descriptions quoted and the files LF
  (`.gitattributes`). One added mid-session is "not found" until the
  next session. Either way, use `general-purpose` with the default model
  and reasoning effort stated above, and paste the named agent's rules into
  the prompt. A different model or effort requires the user's explicit
  request.
