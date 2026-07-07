---
name: work-issue
description: The contract for implementing a single GitHub issue end-to-end - context gathering, implementation, verification against acceptance criteria, PR. Use whenever working an issue from the board.
---

# work-issue

Every issue on this board is written to be independently workable: it carries context, scope, acceptance criteria, and its blockers' numbers. Work it like this:

## 1. Gather context

- `gh issue view NN` — read Context, Scope, **Acceptance criteria** (these are the definition of done), and Blocked by.
- Read the *outcomes* of the blockers: experiment issues produce `experiments/*/RESULTS.md`; design issues produce docs. These files are the handoff — do not re-derive or contradict them. Pipeline settings always come from `docs/pipeline/DECISIONS.md`, never invented (that file exists once #8 closes; until then `docs/pipeline/README.md` states the interim rule).
- Read the docs routed by CLAUDE.md's "Read before working" table for the area you're touching.
- Check the issue for comments — re-scoping after Phase 0 lands as comments.

## 2. Implement

- On branch `issue/NN-slug`. Follow `docs/guidelines/general.md` plus the area guideline. 500 LoC cap, comment policy, schema-via-codegen.
- If the issue turns out to be mis-scoped or its assumptions are stale (an experiment invalidated something), **stop and comment on the issue** with what you found rather than silently deviating.

## 3. Verify

- Walk the acceptance criteria one by one. Each gets an automated test where feasible; anything verified manually (GPU output quality, visual checks) gets evidence in the PR body — commands run, results, screenshots/crops for image work.
- `just lint` and `just test` green. Bootstrap caveat: until #9 merges there is no justfile or CI — state that in the PR body and report the equivalent checks you ran manually. For `needs-gpu` issues, run the real pipeline locally and report wall-clock times where the issue sets latency targets.

## 4. PR

- Title mirrors the issue title. Body: `Closes #NN`, then the acceptance criteria as a checklist with evidence per item.
- The PR will be reviewed by a separate agent against the same criteria and guidelines (see `foreman`); respond to review comments on the same branch.
- Do not merge your own PR unless explicitly told the session has merge authority.
