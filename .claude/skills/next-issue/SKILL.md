---
name: next-issue
description: Find and claim the next GitHub issue(s) to work on, using the dependency frontier. Use when starting a work session, when asked "what's next", or when an issue just closed and you need the next one.
---

# next-issue

The issue board is dependency-wired (native GitHub blocked-by relations). An issue is workable when all its blockers are closed. Never start a blocked issue.

## Steps

1. Run `python3 scripts/issue_frontier.py` (add `--json` for machine-readable output). It lists open, unassigned issues with zero open blockers, sorted by milestone order then fan-out (how many issues each unblocks).
2. Pick from the top, applying these rules:
   - **Milestone order is priority order** (Phase 0 first; Street generator interleaves with Phases 1–2).
   - **Prefer high `unblocks`** — closing a gate issue (like the Phase 0 synthesis) is worth more than a leaf.
   - **At most one `needs-gpu` issue in flight at a time**, ever — there is one RTX 4090 and pipeline jobs saturate it. Check open PRs/assigned issues for in-flight GPU work before claiming another (`python3 scripts/issue_frontier.py --all` shows assignments).
   - Respect the `model:` label: if the issue says `model:opus` and you're a smaller model, report back instead of attempting it.
3. Claim it: `gh issue edit NN --add-assignee @me`.
4. Branch: `git checkout -b issue/NN-short-slug` from up-to-date `main`.
5. Hand off to the `work-issue` skill (or continue with it yourself).

If the frontier is empty, say so explicitly and list what's blocking it (usually a gate issue awaiting review or an unmerged PR).
