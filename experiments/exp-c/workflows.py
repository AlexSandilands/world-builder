"""ComfyUI API-format workflow builders for Experiment C (issue #5).

One workflow per tile: img2img over the upscaled Pass-1 crop, conditioned by
the xinsir tile ControlNet on the same crop, with the positive conditioning
built per prompt-injection strategy. The full upscaled base and the full-size
region masks are uploaded once per run; every workflow crops them in-graph
(ImageCrop) so each recorded workflow JSON stays self-describing about which
canvas window it rendered.

Model filenames must match docs/pipeline/environment.md (#1).
"""

from __future__ import annotations

from tiling import TileRegion

SDXL_CHECKPOINT = "sd_xl_base_1.0.safetensors"
TILE_CONTROLNET = "xinsir_controlnet-tile-sdxl-1.0.safetensors"

BASE_PROMPT = "hand-drawn top-down fantasy city map, ink and watercolour"
NEGATIVE_PROMPT = (
    "text, labels, lettering, words, numbers, watermark, signature, blurry, photograph, 3d render"
)

# Strategy participation thresholds (fraction of tile area). Concat is
# stingier: every region added dilutes all others in one CLIP encode.
MIN_FRACTION = {"concat": 0.05, "area": 0.02, "mask": 0.01}

STRATEGIES = ("global", "concat", "area", "mask")


def region_text(tr: TileRegion) -> str:
    return f"{BASE_PROMPT}, {tr.region.prompt}"


def _common_nodes(
    *,
    base_image: str,
    x: int,
    y: int,
    tile: int,
    seed: int,
    denoise: float,
    cn_strength: float,
    cn_end: float,
    filename_prefix: str,
) -> dict:
    return {
        "ckpt": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": SDXL_CHECKPOINT},
        },
        "neg": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE_PROMPT, "clip": ["ckpt", 1]},
        },
        "base_img": {
            "class_type": "LoadImage",
            "inputs": {"image": base_image},
        },
        "crop": {
            "class_type": "ImageCrop",
            "inputs": {
                "image": ["base_img", 0],
                "width": tile,
                "height": tile,
                "x": x,
                "y": y,
            },
        },
        "encode": {
            "class_type": "VAEEncode",
            "inputs": {"pixels": ["crop", 0], "vae": ["ckpt", 2]},
        },
        "cn": {
            "class_type": "ControlNetLoader",
            "inputs": {"control_net_name": TILE_CONTROLNET},
        },
        # "positive" is patched to the strategy's terminal node id by
        # build_tile_workflow.
        "cn_apply": {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["pos", 0],
                "negative": ["neg", 0],
                "control_net": ["cn", 0],
                "image": ["crop", 0],
                "strength": cn_strength,
                "start_percent": 0.0,
                "end_percent": cn_end,
            },
        },
        "sampler": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 30,
                "cfg": 7.0,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": denoise,
                "model": ["ckpt", 0],
                "positive": ["cn_apply", 0],
                "negative": ["cn_apply", 1],
                "latent_image": ["encode", 0],
            },
        },
        "decode": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["sampler", 0], "vae": ["ckpt", 2]},
        },
        "save": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": filename_prefix, "images": ["decode", 0]},
        },
    }


def _positive_global(nodes: dict, text: str) -> str:
    nodes["pos"] = {
        "class_type": "CLIPTextEncode",
        "inputs": {"text": text, "clip": ["ckpt", 1]},
    }
    return "pos"


def _positive_area(nodes: dict, regions: list[TileRegion]) -> str:
    """Exact area-weighted average of the per-region prompt embeddings via a
    ConditioningAverage fold: Average(to, from, s) = to*s + from*(1-s)."""
    total = sum(tr.fraction for tr in regions)
    acc = None
    cum = 0.0
    for i, tr in enumerate(regions):
        nodes[f"pos_r{i}"] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": region_text(tr), "clip": ["ckpt", 1]},
        }
        w = tr.fraction / total
        if acc is None:
            acc, cum = f"pos_r{i}", w
            continue
        nodes[f"pos_avg{i}"] = {
            "class_type": "ConditioningAverage",
            "inputs": {
                "conditioning_to": [acc, 0],
                "conditioning_from": [f"pos_r{i}", 0],
                "conditioning_to_strength": round(cum / (cum + w), 6),
            },
        }
        acc, cum = f"pos_avg{i}", cum + w
    assert acc is not None
    return acc


def _positive_mask(
    nodes: dict,
    regions: list[TileRegion],
    mask_images: dict[str, str],
    x: int,
    y: int,
    tile: int,
) -> str:
    """Per-region prompt attention-masked to that region's pixels inside the
    tile, combined additively. Region masks z-partition the canvas, so their
    union covers every pixel of the tile."""
    combined = None
    for i, tr in enumerate(regions):
        nodes[f"mask_img{i}"] = {
            "class_type": "LoadImage",
            "inputs": {"image": mask_images[tr.region.id]},
        }
        nodes[f"mask_crop{i}"] = {
            "class_type": "ImageCrop",
            "inputs": {
                "image": [f"mask_img{i}", 0],
                "width": tile,
                "height": tile,
                "x": x,
                "y": y,
            },
        }
        nodes[f"mask{i}"] = {
            "class_type": "ImageToMask",
            "inputs": {"image": [f"mask_crop{i}", 0], "channel": "red"},
        }
        nodes[f"pos_r{i}"] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": region_text(tr), "clip": ["ckpt", 1]},
        }
        nodes[f"pos_m{i}"] = {
            "class_type": "ConditioningSetMask",
            "inputs": {
                "conditioning": [f"pos_r{i}", 0],
                "mask": [f"mask{i}", 0],
                "strength": 1.0,
                "set_cond_area": "default",
            },
        }
        if combined is None:
            combined = f"pos_m{i}"
            continue
        nodes[f"pos_comb{i}"] = {
            "class_type": "ConditioningCombine",
            "inputs": {
                "conditioning_1": [combined, 0],
                "conditioning_2": [f"pos_m{i}", 0],
            },
        }
        combined = f"pos_comb{i}"
    assert combined is not None
    return combined


def build_tile_workflow(
    *,
    strategy: str,
    base_image: str,
    x: int,
    y: int,
    tile: int,
    regions: list[TileRegion],
    mask_images: dict[str, str],
    seed: int,
    denoise: float,
    cn_strength: float,
    cn_end: float,
    filename_prefix: str,
) -> dict:
    nodes = _common_nodes(
        base_image=base_image,
        x=x,
        y=y,
        tile=tile,
        seed=seed,
        denoise=denoise,
        cn_strength=cn_strength,
        cn_end=cn_end,
        filename_prefix=filename_prefix,
    )
    if strategy == "global":
        pos = _positive_global(nodes, BASE_PROMPT)
    elif strategy == "concat":
        parts = [BASE_PROMPT] + [tr.region.prompt for tr in regions]
        pos = _positive_global(nodes, ", ".join(parts))
    elif strategy == "area":
        pos = _positive_area(nodes, regions)
    elif strategy == "mask":
        pos = _positive_mask(nodes, regions, mask_images, x, y, tile)
    else:
        raise ValueError(f"unknown strategy {strategy!r}")
    nodes["cn_apply"]["inputs"]["positive"] = [pos, 0]
    return nodes
