#!/usr/bin/env python3
"""Codegen-only compatibility shim for the frontend TS codegen step.

json-schema-to-typescript (pinned in frontend/package.json, currently at its
latest release) predates the draft 2020-12 `prefixItems` keyword: it has no
parser support for it at all (absent from its source and CHANGELOG as of
v15.0.4) and silently emits `never[]` for any tuple defined that way. This
rewrites closed `prefixItems` tuples (`items: false`) into the legacy
`items: [...]` array form the tool does understand, so `Vec2` etc. type as
`[number, number]` instead of `never[]`.

schema/project.schema.json itself is untouched; this only transforms the
copy piped into json2ts, at codegen time.
"""

import json
import sys


def rewrite(node: object) -> object:
    if isinstance(node, dict):
        if "prefixItems" in node and node.get("items") is False:
            node = dict(node)
            node["items"] = [rewrite(item) for item in node.pop("prefixItems")]
            return node
        return {key: rewrite(value) for key, value in node.items()}
    if isinstance(node, list):
        return [rewrite(item) for item in node]
    return node


def main() -> None:
    with open(sys.argv[1], encoding="utf-8") as f:
        schema = json.load(f)
    json.dump(rewrite(schema), sys.stdout)


if __name__ == "__main__":
    main()
