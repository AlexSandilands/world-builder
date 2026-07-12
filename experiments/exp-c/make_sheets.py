#!/usr/bin/env python3
"""Contact sheets and full-resolution zoom crops for RESULTS.md.

    python3 make_sheets.py sheet --out sheets/denoise.jpg --cols 3 RUN_ID...
    python3 make_sheets.py crop --run RUN_ID --x 1500 --y 2000 --size 512 \
        --out crops/dn040_seam.jpg [--label TEXT]

`sheet` cells accept run ids (uses runs/<id>/preview.jpg) or image paths.
`crop` cuts from the git-ignored full-res stitched.png, so crops are true
100%-zoom evidence.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).parent
RUNS_DIR = HERE / "runs"
CELL = 512
LABEL_H = 28


def cmd_sheet(args: argparse.Namespace) -> None:
    n = len(args.cells)
    cols = min(args.cols, n)
    rows = (n + cols - 1) // cols
    sheet = Image.new("RGB", (cols * CELL, rows * (CELL + LABEL_H)), (250, 248, 240))
    draw = ImageDraw.Draw(sheet)
    for i, cell in enumerate(args.cells):
        path = Path(cell) if cell.endswith((".jpg", ".png")) else None
        img = Image.open(path if path else RUNS_DIR / cell / "preview.jpg")
        img.thumbnail((CELL, CELL), Image.LANCZOS)
        x, y = (i % cols) * CELL, (i // cols) * (CELL + LABEL_H)
        sheet.paste(img, (x, y))
        label = path.stem if path else cell
        draw.text((x + 6, y + CELL + 6), label, fill=(20, 20, 20))
    out = HERE / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=88)
    print(f"wrote {out} ({n} cells)")


def cmd_crop(args: argparse.Namespace) -> None:
    src = Image.open(RUNS_DIR / args.run / "stitched.png")
    box = (args.x, args.y, args.x + args.size, args.y + args.size)
    crop = src.crop(box)
    if args.label:
        draw = ImageDraw.Draw(crop)
        draw.rectangle((0, 0, crop.width, 18), fill=(250, 248, 240))
        draw.text((4, 3), args.label, fill=(20, 20, 20))
    out = HERE / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    crop.save(out, quality=92)
    print(f"wrote {out} from {args.run} @ {box}")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sheet = sub.add_parser("sheet")
    sheet.add_argument("--out", required=True)
    sheet.add_argument("--cols", type=int, default=3)
    sheet.add_argument("cells", nargs="+")
    crop = sub.add_parser("crop")
    crop.add_argument("--run", required=True)
    crop.add_argument("--x", type=int, required=True)
    crop.add_argument("--y", type=int, required=True)
    crop.add_argument("--size", type=int, default=512)
    crop.add_argument("--out", required=True)
    crop.add_argument("--label", default="")
    args = parser.parse_args()
    {"sheet": cmd_sheet, "crop": cmd_crop}[args.cmd](args)


if __name__ == "__main__":
    main()
