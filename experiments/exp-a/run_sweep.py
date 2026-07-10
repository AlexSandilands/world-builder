#!/usr/bin/env python3
"""Experiment A sweep driver (issue #3): SDXL vs Flux Pass 1 bake-off.

Drives a local ComfyUI over HTTP (same POST /prompt, poll /history,
GET /view shape as the future orchestrator). Two phases:

  adherence — both model families x control strengths x seeds, dense
              line-art control, the issue's global style prompt.
  scale     — scale-plausibility knobs on top of a pinned strength/seed:
              prompt-wording variants x control density (dense vs sparse).

Every run is recorded under runs/<run_id>/: the exact API workflow JSON,
manifest (seed, strength, prompts, sha256 of every model file and of the
control image, wall-clock), full-resolution output.png and a 1024px
preview.jpg. Re-running skips any run whose manifest already exists, so an
interrupted sweep resumes.

Usage:
    python3 run_sweep.py --port 8203 --phase all
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

from PIL import Image

import workflows

ASSETS = Path(__file__).parent.parent / "assets"
RUNS_DIR = Path(__file__).parent / "runs"

CONTROL_IMAGES = {"dense": "lineart_dense.png", "sparse": "lineart_sparse.png"}

BASE_PROMPT = "hand-drawn top-down fantasy city map, ink and watercolour"
NEGATIVE_PROMPT = (
    "text, labels, lettering, words, numbers, watermark, signature, "
    "blurry, photograph, 3d render"
)
# Scale-knob wordings: does prompt language shift apparent building size?
PROMPT_VARIANTS = {
    "base": BASE_PROMPT,
    "tiny": BASE_PROMPT
    + ", seen from high above, hundreds of tiny densely packed rooftops, "
    "vast city sprawl",
    "large": BASE_PROMPT + ", detailed large buildings, close aerial view",
}

ADHERENCE_STRENGTHS = [0.4, 0.6, 0.8, 1.0]
ADHERENCE_SEEDS = [1001, 2002]

MODEL_DIRS = {
    "checkpoints": ["sd_xl_base_1.0.safetensors"],
    "controlnet": [
        "xinsir_controlnet-scribble-sdxl-1.0.safetensors",
        "flux1-dev-controlnet-union-instantx.safetensors",
    ],
    "diffusion_models": ["flux1-dev-fp8.safetensors"],
    "text_encoders": ["clip_l.safetensors", "t5xxl_fp8_e4m3fn_scaled.safetensors"],
    "vae": ["flux_ae.safetensors"],
}
COMFY_MODELS_ROOT = Path("/mnt/storage/comfyui/models")

SDXL_FILES = [
    "checkpoints/sd_xl_base_1.0.safetensors",
    "controlnet/xinsir_controlnet-scribble-sdxl-1.0.safetensors",
]
FLUX_FILES = [
    "diffusion_models/flux1-dev-fp8.safetensors",
    "controlnet/flux1-dev-controlnet-union-instantx.safetensors",
    "text_encoders/clip_l.safetensors",
    "text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors",
    "vae/flux_ae.safetensors",
]

_hash_cache: dict[str, str] = {}


def sha256_file(path: Path) -> str:
    key = str(path)
    if key not in _hash_cache:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1 << 24), b""):
                h.update(chunk)
        _hash_cache[key] = h.hexdigest()
    return _hash_cache[key]


def upload_control_image(base_url: str, name: str) -> None:
    path = ASSETS / name
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


def submit(base_url: str, workflow: dict, client_id: str) -> str:
    payload = json.dumps({"prompt": workflow, "client_id": client_id}).encode()
    req = urllib.request.Request(
        f"{base_url}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        body = json.load(resp)
    if body.get("node_errors"):
        raise RuntimeError(f"workflow rejected: {body['node_errors']}")
    return body["prompt_id"]


def poll_history(base_url: str, prompt_id: str, timeout_s: int = 1200) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        with urllib.request.urlopen(f"{base_url}/history/{prompt_id}") as resp:
            history = json.load(resp)
        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(
                    f"prompt {prompt_id} failed: "
                    f"{json.dumps(status.get('messages', []))[:2000]}"
                )
            return entry
        time.sleep(3)
    raise TimeoutError(f"prompt {prompt_id} did not complete within {timeout_s}s")


def fetch_image(base_url: str, image_ref: dict) -> bytes:
    params = urllib.parse.urlencode(
        {
            "filename": image_ref["filename"],
            "subfolder": image_ref.get("subfolder", ""),
            "type": image_ref.get("type", "output"),
        }
    )
    with urllib.request.urlopen(f"{base_url}/view?{params}") as resp:
        return resp.read()


def build_run(
    run_id: str,
    model: str,
    *,
    seed: int,
    strength: float,
    prompt_variant: str,
    control_variant: str,
    end_percent: float | None = None,
) -> dict:
    control = CONTROL_IMAGES[control_variant]
    positive = PROMPT_VARIANTS[prompt_variant]
    if end_percent is None:
        end_percent = 1.0 if model == "sdxl" else 0.8
    if model == "sdxl":
        workflow = workflows.build_sdxl_workflow(
            control_image=control,
            positive=positive,
            negative=NEGATIVE_PROMPT,
            seed=seed,
            strength=strength,
            end_percent=end_percent,
            filename_prefix=run_id,
        )
        model_files = SDXL_FILES
    else:
        workflow = workflows.build_flux_workflow(
            control_image=control,
            positive=positive,
            seed=seed,
            strength=strength,
            end_percent=end_percent,
            filename_prefix=run_id,
        )
        model_files = FLUX_FILES
    return {
        "run_id": run_id,
        "model_family": model,
        "seed": seed,
        "control_strength": strength,
        "control_end_percent": end_percent,
        "prompt_variant": prompt_variant,
        "positive_prompt": positive,
        "negative_prompt": NEGATIVE_PROMPT if model == "sdxl" else None,
        "control_variant": control_variant,
        "control_image": control,
        "workflow": workflow,
        "model_files": model_files,
    }


def plan_runs(phase: str) -> list[dict]:
    runs = []
    if phase in ("adherence", "all"):
        for model in ("sdxl", "flux"):
            for strength in ADHERENCE_STRENGTHS:
                for seed in ADHERENCE_SEEDS:
                    run_id = f"{model}_st{int(strength * 100):03d}_s{seed}"
                    runs.append(
                        build_run(
                            run_id,
                            model,
                            seed=seed,
                            strength=strength,
                            prompt_variant="base",
                            control_variant="dense",
                        )
                    )
    if phase in ("scale", "all"):
        # Strength pinned per family to the adherence sweep's working range.
        for model, strength in (("sdxl", 0.8), ("flux", 0.6)):
            for prompt_variant in PROMPT_VARIANTS:
                for control_variant in ("dense", "sparse"):
                    if prompt_variant != "base" and control_variant == "sparse":
                        continue  # density knob measured on base wording only
                    run_id = (
                        f"{model}_scale_{prompt_variant}_{control_variant}"
                        f"_st{int(strength * 100):03d}_s1001"
                    )
                    if prompt_variant == "base" and control_variant == "dense":
                        continue  # identical to an adherence run
                    runs.append(
                        build_run(
                            run_id,
                            model,
                            seed=1001,
                            strength=strength,
                            prompt_variant=prompt_variant,
                            control_variant=control_variant,
                        )
                    )
    if phase in ("followup", "all"):
        # Probes motivated by the adherence sweep: Flux union-canny collapses
        # to a flat embossed relief by strength 0.6, so search below it and
        # with earlier cutoffs; SDXL inverts the dense grid into water/fields
        # at >=0.6, so try releasing the control early instead of weakening it.
        followups = [
            ("flux", 0.2, 0.8),
            ("flux", 0.3, 0.8),
            ("flux", 0.4, 0.5),
            ("flux", 0.6, 0.4),
            ("sdxl", 0.8, 0.5),
            ("sdxl", 1.0, 0.4),
        ]
        for model, strength, end in followups:
            run_id = (
                f"{model}_st{int(strength * 100):03d}_end{int(end * 100):03d}_s1001"
            )
            runs.append(
                build_run(
                    run_id,
                    model,
                    seed=1001,
                    strength=strength,
                    prompt_variant="base",
                    control_variant="dense",
                    end_percent=end,
                )
            )
    return runs


def execute_run(base_url: str, run: dict) -> None:
    run_dir = RUNS_DIR / run["run_id"]
    manifest_path = run_dir / "manifest.json"
    if manifest_path.exists():
        print(f"skip (done): {run['run_id']}")
        return
    run_dir.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    prompt_id = submit(base_url, run["workflow"], str(uuid.uuid4()))
    result = poll_history(base_url, prompt_id)
    wall_s = round(time.time() - t0, 1)

    images = result.get("outputs", {}).get("save", {}).get("images", [])
    if not images:
        raise RuntimeError(f"{run['run_id']}: no image produced")
    png = fetch_image(base_url, images[0])
    (run_dir / "output.png").write_bytes(png)

    preview = Image.open(io.BytesIO(png)).convert("RGB")
    preview.thumbnail((1024, 1024), Image.LANCZOS)
    preview.save(run_dir / "preview.jpg", quality=90)

    manifest = {
        k: run[k]
        for k in (
            "run_id",
            "model_family",
            "seed",
            "control_strength",
            "control_end_percent",
            "prompt_variant",
            "positive_prompt",
            "negative_prompt",
            "control_variant",
            "control_image",
        )
    }
    manifest["control_image_sha256"] = sha256_file(ASSETS / run["control_image"])
    manifest["model_file_sha256"] = {
        rel: sha256_file(COMFY_MODELS_ROOT / rel) for rel in run["model_files"]
    }
    manifest["output_sha256"] = hashlib.sha256(png).hexdigest()
    manifest["wall_clock_s"] = wall_s
    manifest["resolution"] = [workflows.WIDTH, workflows.HEIGHT]
    (run_dir / "workflow.json").write_text(json.dumps(run["workflow"], indent=2) + "\n")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"done: {run['run_id']} ({wall_s}s)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--phase", choices=["adherence", "scale", "all"], default="all")
    args = parser.parse_args()
    base_url = f"http://{args.host}:{args.port}"

    for name in CONTROL_IMAGES.values():
        upload_control_image(base_url, name)

    runs = plan_runs(args.phase)
    print(f"{len(runs)} runs planned")
    for run in runs:
        execute_run(base_url, run)


if __name__ == "__main__":
    main()
