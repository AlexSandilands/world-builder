#!/usr/bin/env python3
"""Experiment C driver (issue #5): Pass-2 tiled detail pass.

Upscales the Experiment A winner (sdxl_st080_end050_s1001, the operating
point signed off in experiments/exp-a/RESULTS.md), tiles it at 1024px, runs
img2img + xinsir tile ControlNet per tile over ComfyUI's HTTP API, and
stitches with feathered blending. Phases:

  denoise — global prompt, fixed overlap; sweep KSampler denoise.
  overlap — chosen denoise; sweep overlap/feather width.
  blend   — chosen denoise+overlap; per-tile prompt-injection strategies
            (concat / area-weighted / masked attention).
  followup — masked injection with more authority: higher denoise and a
            weakened tile ControlNet, plus a seed-matched global control.
  scale8k — chosen settings applied again on the best blend run's 4096
            output, to 8192 (the realistic progressive 2x-per-pass path).

Every run lands in runs/<run_id>/: manifest.json (all knobs, per-tile region
fractions, sha256 of models + source image, seam-disagreement metric,
wall-clock), workflows.json (the exact API workflow of every tile), 1024px
preview.jpg. Full-res stitched.png and per-tile fetches (work/) are
git-ignored; the run is exactly regenerable from workflows.json. Interrupted
runs resume: fetched tiles are checkpointed under work/<run_id>/.

Usage:
    python3 run_tiles.py --port 8205 --phase denoise
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import numpy as np
import tiling
import workflows
from PIL import Image

HERE = Path(__file__).parent
RUNS_DIR = HERE / "runs"
WORK_DIR = HERE / "work"

EXP_A_WINNER = HERE.parent / "exp-a" / "runs" / "sdxl_st080_end050_s1001"
EXP_A_WINNER_SHA256 = "a0507d499d4d10ed3a414e5d6dfeef5b528b3943d43739457f1c3f3c11845b57"

MODEL_FILES = [
    "checkpoints/sd_xl_base_1.0.safetensors",
    "controlnet/xinsir_controlnet-tile-sdxl-1.0.safetensors",
]
COMFY_MODELS_ROOT = Path("/mnt/storage/comfyui/models")

SEED_BASE = 1001  # per-tile seed = SEED_BASE + tile index, decorrelates texture
CN_STRENGTH = 0.6
CN_END = 1.0

DENOISE_SWEEP = [0.2, 0.3, 0.4, 0.5, 0.65, 0.8]
OVERLAP_SWEEP = [64, 128, 384]

# Pinned after the denoise/overlap phases (see RESULTS.md for the reasoning);
# manifests record the actual values, so these are bookkeeping not truth.
CHOSEN_DENOISE = 0.5
CHOSEN_OVERLAP = 256
BLEND_WINNER = "dn050_ov256_mask"

_hash_cache: dict[str, str] = {}


def sha256_file(path: Path) -> str:
    key = str(path)
    if key not in _hash_cache:
        _hash_cache[key] = hashlib.sha256(path.read_bytes()).hexdigest()
    return _hash_cache[key]


def upload_image(base_url: str, path: Path, name: str) -> None:
    boundary = uuid.uuid4().hex
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="image"; filename="{name}"\r\n'
        "Content-Type: image/png\r\n\r\n".encode()
    )
    body.write(path.read_bytes())
    body.write(f"\r\n--{boundary}\r\n".encode())
    body.write(b'Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue')
    body.write(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        f"{base_url}/upload/image",
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req) as resp:
        if resp.status != 200:
            raise RuntimeError(f"upload of {name} failed: HTTP {resp.status}")


def submit(base_url: str, workflow: dict) -> str:
    payload = json.dumps({"prompt": workflow, "client_id": uuid.uuid4().hex}).encode()
    req = urllib.request.Request(
        f"{base_url}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.load(resp)
    if body.get("node_errors"):
        raise RuntimeError(f"workflow rejected: {body['node_errors']}")
    return body["prompt_id"]


def poll_history(base_url: str, prompt_id: str, timeout_s: int = 300) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        with urllib.request.urlopen(f"{base_url}/history/{prompt_id}", timeout=30) as resp:
            history = json.load(resp)
        if prompt_id in history:
            entry = history[prompt_id]
            if entry.get("status", {}).get("status_str") == "error":
                raise RuntimeError(
                    f"prompt {prompt_id} failed: "
                    f"{json.dumps(entry['status'].get('messages', []))[:2000]}"
                )
            return entry
        time.sleep(1)
    raise TimeoutError(f"prompt {prompt_id} did not complete within {timeout_s}s")


def fetch_image(base_url: str, image_ref: dict) -> bytes:
    params = urllib.parse.urlencode(
        {
            "filename": image_ref["filename"],
            "subfolder": image_ref.get("subfolder", ""),
            "type": image_ref.get("type", "output"),
        }
    )
    with urllib.request.urlopen(f"{base_url}/view?{params}", timeout=60) as resp:
        return resp.read()


def render_tile(base_url: str, workflow: dict) -> bytes:
    """Submit and fetch one tile, retrying once on a poll timeout — the
    machine is shared, and a stalled poll has been observed while the prompt
    itself completed fine. Fixed seeds + ComfyUI node caching make the
    resubmit cheap and deterministic."""
    last_error: Exception | None = None
    for _ in range(2):
        prompt_id = submit(base_url, workflow)
        try:
            result = poll_history(base_url, prompt_id)
        except TimeoutError as err:
            last_error = err
            continue
        images = result.get("outputs", {}).get("save", {}).get("images", [])
        if not images:
            raise RuntimeError(f"prompt {prompt_id}: no image produced")
        return fetch_image(base_url, images[0])
    raise TimeoutError(f"tile failed twice: {last_error}")


class Session:
    """Caches per-canvas-size prepared inputs: the upscaled source upload,
    the region index map, and the region mask uploads."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.regions = tiling.load_regions()
        self._index_maps: dict[int, np.ndarray] = {}
        self._uploaded: set[str] = set()
        WORK_DIR.mkdir(exist_ok=True)

    def index_map(self, size: int) -> np.ndarray:
        if size not in self._index_maps:
            self._index_maps[size] = tiling.rasterize_index_map(size)
        return self._index_maps[size]

    def prepare_source(self, source_png: Path, size: int) -> tuple[str, str]:
        """Upscale source to size x size (Lanczos), upload, return
        (upload name, sha256 of the uploaded upscale)."""
        name = f"expC_{source_png.parent.name}_{size}.png"
        path = WORK_DIR / name
        if not path.exists():
            img = Image.open(source_png).convert("RGB")
            img = img.resize((size, size), Image.LANCZOS)
            img.save(path)
        if name not in self._uploaded:
            upload_image(self.base_url, path, name)
            self._uploaded.add(name)
        return name, sha256_file(path)

    def prepare_masks(self, size: int, needed: set[str]) -> dict[str, str]:
        index_map = self.index_map(size)
        by_id = {r.id: r for r in self.regions}
        names = {}
        for region_id in sorted(needed):
            name = f"expC_mask_{region_id}_{size}.png"
            path = WORK_DIR / name
            if not path.exists():
                tiling.region_mask_png(index_map, by_id[region_id].index, path)
            if name not in self._uploaded:
                upload_image(self.base_url, path, name)
                self._uploaded.add(name)
            names[region_id] = name
        return names


def plan_runs(phase: str) -> list[dict]:
    def spec(run_id: str, **kw) -> dict:
        base = {
            "run_id": run_id,
            "strategy": "global",
            "denoise": CHOSEN_DENOISE,
            "overlap": CHOSEN_OVERLAP,
            "size": 4096,
            "source": "expA",
            "cn_strength": CN_STRENGTH,
            "cn_end": CN_END,
        }
        base.update(kw)
        return base

    runs = []
    if phase in ("denoise", "all"):
        for d in DENOISE_SWEEP:
            runs.append(spec(f"dn{int(d * 100):03d}_ov256_global", denoise=d, overlap=256))
    if phase in ("overlap", "all"):
        for ov in OVERLAP_SWEEP:
            runs.append(spec(f"dn{int(CHOSEN_DENOISE * 100):03d}_ov{ov:03d}_global", overlap=ov))
    if phase in ("blend", "all"):
        for strategy in ("concat", "area", "mask"):
            runs.append(
                spec(
                    f"dn{int(CHOSEN_DENOISE * 100):03d}_ov{CHOSEN_OVERLAP:03d}_{strategy}",
                    strategy=strategy,
                )
            )
    if phase in ("followup", "all"):
        # dn050 injection is pinned down by the base content (tile CN + low
        # denoise): probe how much re-authoring headroom masked prompts have
        # when denoise rises and when the tile control weakens.
        runs.append(spec("dn065_ov256_mask", strategy="mask", denoise=0.65))
        runs.append(spec("dn080_ov256_mask", strategy="mask", denoise=0.8))
        runs.append(spec("dn065_cn030_mask", strategy="mask", denoise=0.65, cn_strength=0.3))
        # Seed-matched control so the cn030 comparison isolates conditioning.
        runs.append(spec("dn065_cn030_global", strategy="global", denoise=0.65, cn_strength=0.3))
    if phase in ("scale8k", "all"):
        runs.append(
            spec(
                f"scale8k_{BLEND_WINNER.rsplit('_', 1)[-1]}",
                strategy=BLEND_WINNER.rsplit("_", 1)[-1],
                size=8192,
                source=f"run:{BLEND_WINNER}",
            )
        )
    return runs


def resolve_source(source: str) -> tuple[Path, str]:
    if source == "expA":
        png = EXP_A_WINNER / "output.png"
        if not png.exists():
            raise FileNotFoundError(
                f"{png} missing (git-ignored); regenerate via exp-a/run_sweep.py"
            )
        sha = sha256_file(png)
        if sha != EXP_A_WINNER_SHA256:
            raise RuntimeError(f"exp-a winner hash drifted: {sha}")
        return png, sha
    run_id = source.removeprefix("run:")
    png = RUNS_DIR / run_id / "stitched.png"
    if not png.exists():
        raise FileNotFoundError(f"{png} missing; run {run_id} first")
    return png, sha256_file(png)


def execute_run(session: Session, run: dict) -> None:
    run_dir = RUNS_DIR / run["run_id"]
    if (run_dir / "manifest.json").exists():
        print(f"skip (done): {run['run_id']}")
        return
    run_dir.mkdir(parents=True, exist_ok=True)
    tile_work = WORK_DIR / run["run_id"]
    tile_work.mkdir(exist_ok=True)

    t0 = time.time()
    source_png, source_sha = resolve_source(run["source"])
    base_name, upscaled_sha = session.prepare_source(source_png, run["size"])
    index_map = session.index_map(run["size"])
    grid = tiling.tile_grid(run["size"], tiling.TILE, run["overlap"])
    min_fraction = workflows.MIN_FRACTION.get(run["strategy"], 0.0)

    tile_stats = {}
    mask_names: dict[str, str] = {}
    for x, y in grid:
        tile_stats[(x, y)] = tiling.tile_regions(
            index_map, session.regions, x, y, tiling.TILE, min_fraction
        )
    if run["strategy"] == "mask":
        needed = {tr.region.id for stats in tile_stats.values() for tr in stats}
        mask_names = session.prepare_masks(run["size"], needed)

    tiles: dict[tuple[int, int], np.ndarray] = {}
    tile_workflows = {}
    for i, (x, y) in enumerate(grid):
        tile_id = f"x{x}_y{y}"
        wf = workflows.build_tile_workflow(
            strategy=run["strategy"],
            base_image=base_name,
            x=x,
            y=y,
            tile=tiling.TILE,
            regions=tile_stats[(x, y)],
            mask_images=mask_names,
            seed=SEED_BASE + i,
            denoise=run["denoise"],
            cn_strength=run["cn_strength"],
            cn_end=run["cn_end"],
            filename_prefix=f"{run['run_id']}_{tile_id}",
        )
        tile_workflows[tile_id] = wf
        cached = tile_work / f"{tile_id}.png"
        if cached.exists():
            tiles[(x, y)] = np.asarray(Image.open(cached).convert("RGB"))
            continue
        png = render_tile(session.base_url, wf)
        cached.write_bytes(png)
        tiles[(x, y)] = np.asarray(Image.open(io.BytesIO(png)).convert("RGB"))
        print(f"  tile {i + 1}/{len(grid)} {tile_id}", flush=True)

    seam = tiling.overlap_disagreement(tiles, tiling.TILE)
    stitched = tiling.stitch(run["size"], tiles, tiling.TILE, feather=run["overlap"])
    out = Image.fromarray(stitched)
    out.save(run_dir / "stitched.png")
    preview = out.copy()
    preview.thumbnail((1024, 1024), Image.LANCZOS)
    preview.save(run_dir / "preview.jpg", quality=90)

    manifest = {
        **{k: run[k] for k in sorted(run)},
        "tile": tiling.TILE,
        "feather": run["overlap"],
        "sampler": {"steps": 30, "cfg": 7.0, "name": "dpmpp_2m", "scheduler": "karras"},
        "seed_base": SEED_BASE,
        "grid": [f"x{x}_y{y}" for x, y in grid],
        "min_region_fraction": min_fraction,
        "tile_regions": {
            f"x{x}_y{y}": [
                {"id": tr.region.id, "type": tr.region.type, "fraction": tr.fraction}
                for tr in stats
            ]
            for (x, y), stats in tile_stats.items()
        },
        "source_image": str(source_png.relative_to(HERE.parent)),
        "source_sha256": source_sha,
        "upscaled_sha256": upscaled_sha,
        "region_manifest_sha256": sha256_file(tiling.MANIFEST_PATH),
        "model_file_sha256": {rel: sha256_file(COMFY_MODELS_ROOT / rel) for rel in MODEL_FILES},
        "overlap_disagreement": seam,
        "stitched_sha256": sha256_file(run_dir / "stitched.png"),
        "wall_clock_s": round(time.time() - t0, 1),
    }
    (run_dir / "workflows.json").write_text(json.dumps(tile_workflows, indent=2) + "\n")
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        f"done: {run['run_id']} ({manifest['wall_clock_s']}s, "
        f"{len(grid)} tiles, seam mean {seam['mean']})"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument(
        "--phase",
        choices=["denoise", "overlap", "blend", "followup", "scale8k", "all"],
        required=True,
    )
    args = parser.parse_args()
    session = Session(f"http://{args.host}:{args.port}")
    runs = plan_runs(args.phase)
    print(f"{len(runs)} runs planned")
    for run in runs:
        execute_run(session, run)


if __name__ == "__main__":
    main()
