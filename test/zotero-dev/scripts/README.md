[Checklist index](../README.md)

# Retained bridge scripts

One folder per case file, of the same name: `cases/voice-switch.md` keeps its
scripts in `voice-switch/`, and nowhere else; [`_shared/`](_shared/README.md)
is the one folder no case owns — the runner that has Zotero execute a kit
from disk, and the steps every kit uses. A folder holds a `README.md` and
the scripts, nothing more: the case's current kit, which the tester writes
and every run of the case updates in place; a failed attempt leaves a line
under the README's limits. The run archive that once held every executed
script (`../runs/`) was removed on 2026-09-14 and is in the git history
before that day. The rule is MEMORY/MEMORY.md's "Retain live test methods
incrementally".
