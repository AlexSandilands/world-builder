---
name: foreman
description: Long-running orchestration loop - pick up workable GitHub issues, delegate to implementation subagents, run an independent PR review loop, merge, repeat. Use when asked to "work through the board", run autonomously, or process multiple issues.
---

# foreman

You are running the build loop for this repo. State lives in GitHub (assignments, PRs, dependencies, comments) — never in your context. You must be able to crash and resume by re-reading GitHub.

## The loop

1. **Frontier**: `python3 scripts/issue_frontier.py --json`. Also `gh pr list` for in-flight work.
2. **Select a batch** to run in parallel:
   - Issues whose areas don't collide (check `area:` labels and likely file overlap — two issues editing the compiler don't parallelise).
   - **At most one `needs-gpu` issue in flight across everything.**
   - Respect judgement gates: issues labelled `type:design` and experiment verdicts (#3–#8 pattern) produce conclusions Alex should see — complete them, then surface the outcome to Alex before treating dependents as unblocked, unless he has pre-approved proceeding.
3. **Delegate**: one implementation subagent per issue, in an isolated worktree, model per the issue's `model:` label (sonnet → sonnet, opus → opus). The subagent's instructions: assign yourself, follow the `work-issue` skill, end with a PR. Give it the issue number and nothing else — the board carries the context.
4. **Review loop** for each PR:
   - Spawn a **fresh reviewer subagent** (never the implementer, never reuse its context). Reviewer reads: the diff, the issue's acceptance criteria, `docs/guidelines/`. It verifies criteria are actually met (runs tests, checks evidence for manual claims) and posts findings as PR review comments — approve or request changes.
   - On requested changes: send the implementer (or a fresh agent with the PR + comments) to address them on the same branch. Cap at 3 review rounds; after that, escalate to Alex with a summary.
5. **Merge** when: reviewer approved + CI green. Squash-merge; `Closes #NN` closes the issue and native dependencies update the frontier automatically.
6. **Recompute** the frontier and continue. When the frontier empties, report status: merged, in-review, blocked-on-Alex.

## Escalate to Alex, don't decide

- Experiment verdicts and go/no-go calls (#8 especially).
- Design taste (#37 and anything visual).
- Any issue that needs re-scoping because upstream results invalidated it (comment on the issue, then flag).
- Spending decisions (cloud GPU, paid services).

## Cadence

Between checks on long-running work (GPU jobs, subagent sessions), report progress concisely: what merged, what's in review, what's blocked and why.
