---
description: Bump the extension version on the current branch (no push, no tag)
argument-hint: <major|minor|patch>
allowed-tools: Bash(npm version:*), Bash(git add:*), Bash(git commit:*), Bash(git status:*), Bash(git rev-parse:*), Bash(node:*)
---

## Context
- Current branch: !`git rev-parse --abbrev-ref HEAD`
- Current version: !`node -p "require('./package.json').version"`
- Working tree: !`git status --short`

## Task
Bump the Loadster browser extension version by **$1** (`major`, `minor`, or `patch`), following
the release rules in `README.md`.

Rules — follow exactly:
1. Validate `$1` is one of `major`, `minor`, `patch`. If missing or invalid, stop and tell the user the valid options. Do not proceed.
2. Operate on the **current branch** shown above. Do **not** switch branches.
3. The version lives only in `package.json` (Vite injects it into both manifests at build time) — there are no manifest files to edit.
4. Run `npm version $1 --no-git-tag-version` (the flag prevents an auto-created git tag; tags are only cut from `master` after the PR merges).
5. Stage and commit **only** `package.json` and `package-lock.json` with the message `Bump version to <new-version>`.
6. Do **NOT** push, and do **NOT** create or push any git tag. Stop after the local commit.
7. Report the old version, the new version, and the new commit hash.
