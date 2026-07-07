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
   - Respect judgement gates: issues labelled `type:design` and experiment verdicts (#3–#8 pattern) produce conclusions the user should see — complete them, then surface the outcome to the user before treating dependents as unblocked, unless they have pre-approved proceeding.
3. **Delegate**: one implementation subagent per issue, in an isolated worktree, model per the issue's `model:` label (sonnet → sonnet, opus → opus). The subagent's instructions: assign yourself, follow the `work-issue` skill, end with a PR. Give it the issue number and nothing else — the board carries the context.
4. **Review loop** for each PR:
   - Spawn a **fresh reviewer subagent** (never the implementer, never reuse its context). Reviewer reads: the diff, the issue's acceptance criteria, `docs/guidelines/`. It verifies criteria are actually met (runs tests, checks evidence for manual claims) and posts findings as a comment-type review (`gh pr review --comment`) ending with a verdict line: `VERDICT: approve` or `VERDICT: request-changes`. All agents share one GitHub account, so GitHub's native approve/request-changes states are unavailable on our own PRs — the verdict comment **is** the review state.
   - On requested changes: send the implementer (or a fresh agent with the PR + comments) to address them on the same branch. Cap at 3 review rounds; after that, escalate to the user with a summary.
5. **Merge** when: the latest reviewer verdict is `VERDICT: approve` + CI green. (Until #9 lands there is no CI — rely on the verdict plus the checks reported in the PR body.) Issues labelled `human-verify` additionally require the user's explicit go-ahead — see Manual verification checkpoints below. Squash-merge; `Closes #NN` closes the issue and native dependencies update the frontier automatically.
6. **Recompute** the frontier and continue. When the frontier empties, report status: merged, in-review, blocked-on-user.

## Manual verification checkpoints

Issues labelled `human-verify` (UI look-and-feel, generated-image quality) cannot be fully verified by agents — a reviewer can check the code, not whether it *feels* right. After `VERDICT: approve` on such a PR, do not merge. Instead:

1. **Make verification effortless.** Preferred: check out the PR branch in a worktree, start the app (`just dev`; before #9, whatever the PR documents), confirm it's actually serving, and give the user the URL plus a short checklist of what to look at, derived from the issue's acceptance criteria. For non-server outputs (generated maps, exports), give absolute file paths to the artifacts and the exact command to regenerate them. Only fall back to "commands for you to run" when you genuinely cannot run the server yourself.
2. **Post the same checklist as a PR comment** so the checkpoint survives session restarts.
3. **Don't block the loop.** While waiting, continue other non-conflicting issues. If several verifications pile up, present them as one batched summary (URL/paths + checklist each), not repeated interruptions.
4. The user's response is the verdict: approval → merge; problems → treat as requested changes and route back through the review loop.

Foreman may also flag an *unlabelled* issue for a checkpoint if the change turns out to be user-facing — say so explicitly when doing this.

## Escalate to the user, don't decide

- Experiment verdicts and go/no-go calls (#8 especially).
- Design taste (#37 and anything visual).
- Any issue that needs re-scoping because upstream results invalidated it (comment on the issue, then flag).
- Spending decisions (cloud GPU, paid services).

## Cadence

Between checks on long-running work (GPU jobs, subagent sessions), report progress concisely: what merged, what's in review, what's blocked and why.
