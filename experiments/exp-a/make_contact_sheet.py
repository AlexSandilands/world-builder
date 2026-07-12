#!/usr/bin/env python3
"""Assemble labelled contact sheets from runs/*/preview.jpg for RESULTS.md.

Usage:
    python3 make_contact_sheet.py --out sheets/adherence_sdxl.jpg \
        --cols 4 sdxl_st040_s1001 sdxl_st060_s1001 ...
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

RUNS_DIR = Path(__file__).parent / "runs"
CELL = 512
LABEL_H = 28


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--cols", type=int, default=4)
    parser.add_argument("run_ids", nargs="+")
    args = parser.parse_args()

    n = len(args.run_ids)
    cols = min(args.cols, n)
    rows = (n + cols - 1) // cols
    sheet = Image.new(
        "RGB", (cols * CELL, rows * (CELL + LABEL_H)), (250, 248, 240)
    )
    draw = ImageDraw.Draw(sheet)
    for i, run_id in enumerate(args.run_ids):
        img = Image.open(RUNS_DIR / run_id / "preview.jpg")
        img.thumbnail((CELL, CELL), Image.LANCZOS)
        x = (i % cols) * CELL
        y = (i // cols) * (CELL + LABEL_H)
        sheet.paste(img, (x, y))
        draw.text((x + 6, y + CELL + 6), run_id, fill=(20, 20, 20))
    out = Path(__file__).parent / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=88)
    print(f"wrote {out} ({n} cells)")


if __name__ == "__main__":
    main()
