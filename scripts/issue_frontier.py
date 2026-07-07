#!/usr/bin/env python3
"""Print the workable issue frontier: open issues whose blockers are all closed.

Excludes issues that are assigned or already have an open issue/NN-* PR.
Sorted by milestone order, then by how many issues each one unblocks (fan-out).
Usage: issue_frontier.py [--json] [--all]  (--all includes assigned/in-PR issues)
"""
import json
import re
import subprocess
import sys

REPO = "AlexSandilands/world-builder"
MILESTONE_ORDER = [
    "Phase 0 — Pipeline validation",
    "Phase 1 — Authoring loop",
    "Street generator",
    "Phase 2 — Refinement loop",
    "Phase 3 — Presentation",
    "Phase 4 — Nice-to-haves",
]


def gh(args):
    try:
        r = subprocess.run(["gh"] + args, capture_output=True, text=True)
    except FileNotFoundError:
        print("The GitHub CLI (gh) is required but not installed.", file=sys.stderr)
        sys.exit(1)
    if r.returncode != 0:
        print(f"gh {' '.join(args)} failed:\n{r.stderr}", file=sys.stderr)
        sys.exit(1)
    return r.stdout


def issues_with_open_prs():
    prs = json.loads(gh(["pr", "list", "--repo", REPO, "--state", "open",
                         "--limit", "200", "--json", "headRefName"]))
    nums = set()
    for pr in prs:
        m = re.match(r"issue/(\d+)-", pr["headRefName"])
        if m:
            nums.add(int(m.group(1)))
    return nums


def main():
    as_json = "--json" in sys.argv
    include_taken = "--all" in sys.argv

    issues = json.loads(gh([
        "issue", "list", "--repo", REPO, "--state", "open", "--limit", "200",
        "--json", "number,title,labels,milestone,assignees",
    ]))
    in_pr = issues_with_open_prs()

    frontier = []
    for issue in issues:
        deps = json.loads(gh([
            "api", "--paginate",
            f"repos/{REPO}/issues/{issue['number']}/dependencies/blocked_by",
        ]) or "[]")
        if any(d["state"] == "open" for d in deps):
            continue
        blocking = json.loads(gh([
            "api", "--paginate",
            f"repos/{REPO}/issues/{issue['number']}/dependencies/blocking",
        ]) or "[]")
        labels = [l["name"] for l in issue["labels"]]
        frontier.append({
            "number": issue["number"],
            "title": issue["title"],
            "milestone": (issue.get("milestone") or {}).get("title", ""),
            "model": next((l.split(":")[1] for l in labels if l.startswith("model:")), None),
            "needs_gpu": "needs-gpu" in labels,
            "assignees": [a["login"] for a in issue["assignees"]],
            "has_open_pr": issue["number"] in in_pr,
            "unblocks": len([b for b in blocking if b["state"] == "open"]),
        })

    if not include_taken:
        frontier = [i for i in frontier if not i["assignees"] and not i["has_open_pr"]]

    def ms_rank(ms):
        return MILESTONE_ORDER.index(ms) if ms in MILESTONE_ORDER else 99

    frontier.sort(key=lambda i: (ms_rank(i["milestone"]), -i["unblocks"], i["number"]))

    if as_json:
        print(json.dumps(frontier, indent=2))
        return

    if not frontier:
        print("No workable issues (everything open is blocked, assigned, or in an open PR).")
        return
    print(f"{'#':>4} {'model':<7} {'gpu':<4} {'unblocks':<9} {'milestone':<32} title")
    for i in frontier:
        taken = []
        if i["assignees"]:
            taken.append(f"assigned: {','.join(i['assignees'])}")
        if i["has_open_pr"]:
            taken.append("open PR")
        print(f"{i['number']:>4} {i['model'] or '-':<7} {'gpu' if i['needs_gpu'] else '-':<4} "
              f"{i['unblocks']:<9} {i['milestone']:<32} {i['title']}"
              + (f"  [{'; '.join(taken)}]" if taken else ""))


if __name__ == "__main__":
    main()
