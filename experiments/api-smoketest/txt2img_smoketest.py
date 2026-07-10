#!/usr/bin/env python3
"""Verifies the ComfyUI HTTP API end-to-end: submit a trivial SDXL txt2img
workflow, poll for completion, and save the resulting image.

The orchestrator (not yet built) will drive ComfyUI the same way this
script does: POST /prompt, poll /history, GET /view. Nothing here is
pipeline-decision-bearing (no ControlNet, no tiling) — that belongs to
docs/pipeline/DECISIONS.md once #8 lands. This only proves the API path
works end-to-end (issue #1 acceptance criterion).

Usage:
    python3 txt2img_smoketest.py [--host 127.0.0.1] [--port 8189]

Requires a running ComfyUI instance with sd_xl_base_1.0.safetensors in
models/checkpoints/.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

CHECKPOINT = "sd_xl_base_1.0.safetensors"
OUTPUT_DIR = Path(__file__).parent / "output"


def build_workflow(seed: int) -> dict:
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 20,
                "cfg": 7.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0],
            },
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT},
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "top-down illustrated fantasy city map, parchment style",
                "clip": ["4", 1],
            },
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "text, watermark, blurry", "clip": ["4", 1]},
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "issue1_smoketest", "images": ["8", 0]},
        },
    }


def submit(base_url: str, workflow: dict, client_id: str) -> str:
    payload = json.dumps({"prompt": workflow, "client_id": client_id}).encode()
    req = urllib.request.Request(
        f"{base_url}/prompt", data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        body = json.load(resp)
    if body.get("node_errors"):
        raise RuntimeError(f"workflow rejected: {body['node_errors']}")
    return body["prompt_id"]


def poll_history(base_url: str, prompt_id: str, timeout_s: int = 300) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        with urllib.request.urlopen(f"{base_url}/history/{prompt_id}") as resp:
            history = json.load(resp)
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(2)
    raise TimeoutError(f"prompt {prompt_id} did not complete within {timeout_s}s")


def fetch_image(base_url: str, image_ref: dict, dest: Path) -> None:
    params = urllib.parse.urlencode(
        {
            "filename": image_ref["filename"],
            "subfolder": image_ref.get("subfolder", ""),
            "type": image_ref.get("type", "output"),
        }
    )
    with urllib.request.urlopen(f"{base_url}/view?{params}") as resp:
        dest.write_bytes(resp.read())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8189)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    base_url = f"http://{args.host}:{args.port}"
    client_id = str(uuid.uuid4())
    workflow = build_workflow(args.seed)

    print(f"submitting workflow to {base_url} ...")
    prompt_id = submit(base_url, workflow, client_id)
    print(f"prompt_id={prompt_id}, polling ...")
    result = poll_history(base_url, prompt_id)

    outputs = result.get("outputs", {})
    images = outputs.get("9", {}).get("images", [])
    if not images:
        raise RuntimeError(f"no images produced; full result: {json.dumps(result)[:2000]}")

    OUTPUT_DIR.mkdir(exist_ok=True)
    dest = OUTPUT_DIR / images[0]["filename"]
    fetch_image(base_url, images[0], dest)
    print(f"OK: saved {dest} ({dest.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
