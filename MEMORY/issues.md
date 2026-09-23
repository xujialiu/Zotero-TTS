# Issues — Zotero-TTS

The rules for GitHub issues: when one is due, how it is written, worked,
labeled and closed, and how its reporter is answered. Part of the project
rule book, whose core is `MEMORY/MEMORY.md`.

- **Issues** (settled 2026-08-29): a bug always gets a GitHub issue, even
  one fixed in ten minutes — the issue is the public record of a
  production incident, and NOTES.md still gets its entry. A feature gets
  one when it needs a design decision or spans more than one session
  (what used to be a README TODO step; issues have replaced it). **None
  is opened without the user's yes** (settled 2026-09-08): a session
  that finds one due — bug, feature or chore — proposes the title and
  the one-line why, and waits; the one opened unasked on 2026-09-08
  was deleted. Such an
  issue is written **before** the fix and holds the bug and its impact —
  what goes wrong, when, and what it costs the user — plus the evidence,
  the Zotero internals dug out and cited by file and line (`#6` is the
  shape). **It proposes no solution**: the fix is not known yet when the
  issue is written, and guessing at one there buries the problem under an
  approach nobody has weighed. The plan comes later, as the comment
  below. NOTES.md, afterwards, holds what was learned and what broke, and
  names the issue number. Neither copies the other.
- **Issue work starts with the list** (settled 2026-09-06): before opening
  one, and before touching one the user asks for, read every title with
  `gh issue list --state all` — closed as much as open, since a closed
  issue holds the evidence and the plan that already settled the same
  ground. When one looks related, open it, read it with its comments, and
  say so before doing anything else: the number, how it relates, and
  whether it makes a new issue a duplicate. A second issue over ground an
  old one covers splits the record in two, and the work then starts
  without the reasoning that was already written down.
- **An issue the user asks for is written from what they want, and its
  gaps are asked about before it is written** (settled 2026-09-09, issue
  #81): "提 issue" / "创建 issue" hands the session a requirement, not a
  subject to research — it reads the list as above, writes that
  requirement down, and stops there: no reading of the code for how it
  would be done, no approach, no files. Where the description leaves
  something the issue cannot state without guessing — what exactly a
  word of it points at, when the new behavior applies, what happens when
  the user undoes it by hand — the session asks before writing, in one
  round of concrete alternatives with the one it recommends marked;
  never as open questions parked in the issue for later. The body is the
  user's side of it and no more: what happens today, what that costs
  them, and what is asked, behavior by behavior. A product default their
  answers do not settle — a new switch off by default, so nothing
  changes for anyone who does not want it — the session picks itself,
  says so in one line when it hands the issue over, and says it can be
  overruled.
- Everything that leaves the plugin's behavior alone — docs, the settings
  pane's wording and layout, refactors, housekeeping — gets a `chore`
  issue instead, when the change is worth a public record: a couple of
  lines saying what and why, no evidence section, no NOTES.md entry. A
  one-line tweak still gets nothing. Labels are `bug`, `enhancement` and
  `chore`, plus exactly one severity label on every `bug` (settled
  2026-08-31): `severity: critical` — spends the user's money, loses
  data they cannot get back, or takes Zotero down (a crash, a hang, the
  plugin not starting); fixed before anything else and shipped as a
  patch release. `severity: major` — a documented feature does not do
  what it says in an ordinary setup, or a setting is silently changed;
  the next release. `severity: minor` — cosmetic, an edge case few will
  meet, or a diagnostic that reports wrongly; when convenient. It is
  decided from the impact on the user when the issue is written, never
  from the size of the fix, and moved when the evidence changes.
  `enhancement` and `chore` carry none; no other labels, no milestones.
- **An issue closes at the commit that finishes it** (settled 2026-09-23,
  issue #133): that commit carries the number in its subject
  (`fix: … (#5)`), and `gh issue close 5` runs right after it, the
  closing comment already up — not after the merge, the push or the
  release. The number in a subject only links the commit on GitHub; it
  closes nothing, so the close by hand is the only close.
- Open an issue because writing it clarifies the problem, not to defer
  it — on a public repo an issue left open is a promise to strangers, and
  a backlog of stale enhancements reads as an abandoned project.
- **The issue is the running log of the work** (settled 2026-08-30): when
  the research settles on a plan, that plan goes on the issue as a comment
  **before** any of it is implemented — the approach, the files it
  touches, the steps in order, and what was weighed and rejected, so the
  record holds the decision and not only its result. While the work runs,
  anything that departs from that plan gets a comment as it happens — a
  step that turned out wrong, a constraint found late, a change of
  approach — rather than a silent correction at the end. When it is
  finished, a closing comment summarizes the whole thing: what was
  actually built, how it was verified, and anything left open. It goes up
  before the commit that closes the issue, and it is about this change —
  NOTES.md still gets the durable Zotero knowledge, and neither copies the
  other.
- **Every issue research ends with a recommendation** (settled
  2026-09-08, issue #71): once an issue has been researched — a new one
  written, or an existing one read up for a session — the reply closes
  with the solution the session recommends, in the plain words of the
  rule in `MEMORY/MEMORY.md`: which option it would take and why, what the user gets,
  what it costs, and what is left for them to decide; an option it
  rejects gets a line. Findings alone hand the decision to someone who
  has not read the evidence. The recommendation is what the user says yes
  or no to; the plan comment on the issue, with the mechanism and the
  files, follows once they have.
- **An issue opened by someone outside the project gets a reply once its
  fix is released** (settled 2026-09-06, issue #50): a couple of plain
  lines that read like a person wrote them — thanks for the report or
  suggestion, it is done, the released version it is in, and a star if
  they like the plugin — in the reporter's language, posted once that
  version is actually released so they can install it. The issue itself
  closed at its commit (above), so the reply goes on the closed issue. It
  sits beside the closing summary, not instead of it, and nothing in it
  reads like a generated changelog.
- **One that was investigated gets two comments, in this order** (settled
  2026-09-07, issue #73): first the evidence, in the project's own shape —
  what goes wrong, what it costs, the measurements and the Zotero
  internals cited by file and line, no solution; then, as a comment of its
  own, the reply to the reporter: it opens `@<reporter> Thanks for the
  report, …`, says in plain words what was found, what to use meanwhile
  and the one thing still to confirm, and ends with "If you like the
  plugin, a star would mean a lot." The evidence is for the record and the
  next session, the reply is for a person, and the two never share a
  comment. The labels follow the cause, not the report: a fault that turns
  out to be the docs' is `chore`, whatever the title says. The closing
  reply above still follows once the fix is out.
- **Never hard-wrap an issue or comment body** (settled 2026-08-30):
  GitHub renders issue, PR and comment Markdown with `breaks: true`, so
  every single newline becomes a `<br>` and a paragraph wrapped at 80
  columns comes out as a ragged narrow column instead of reflowing with
  the window. One paragraph is one line, however long; blank lines
  separate blocks. This is the opposite of the repo's `.md` files, where
  the wrapping is right and stays.
