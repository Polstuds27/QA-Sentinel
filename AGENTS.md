# AGENTS.md — QA Sentinel

Empty project scaffold (verified: folder has no files, no manifest, no `.git`). There are no build, test, lint, or deploy commands — do not invent any until a toolchain lands.

## Scope

- Working directory is `QA Sentinel/`. Parent `Desktop/` is unrelated clutter (~50 sibling project folders, `.lnk`/`.exe`/`.pbix` files, empty root `git init` with no commits) — ignore it and never run commands at Desktop level.
- This folder has no nested `.git`; parent Desktop git is empty with ~70 untracked entries. Run git commands only inside `QA Sentinel/` once it is initialized, never at Desktop root.

## Shell

- `shell` runs PowerShell on `win32`. Unix-isms fail (`head` does not exist). Chain with `;`, quote paths with spaces.
- Prefer `read`/`glob`/`grep` over `cat`/`sed`/`find`/`ls`.
