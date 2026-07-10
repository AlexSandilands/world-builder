"""ComfyUI API-format workflow builders for Experiment A (issue #3).

Both graphs condition on the hand-authored line-art control from
experiments/assets/ (#2). The asset is black-on-parchment; both ControlNets
(xinsir scribble for SDXL, InstantX union in canny mode for Flux) are trained
on white-on-black control images, so each graph inverts in-workflow — the
recorded workflow JSON stays fully self-describing.

Model filenames must match docs/pipeline/environment.md (#1).
"""

from __future__ import annotations

SDXL_CHECKPOINT = "sd_xl_base_1.0.safetensors"
SDXL_CONTROLNET = "xinsir_controlnet-scribble-sdxl-1.0.safetensors"
FLUX_UNET = "flux1-dev-fp8.safetensors"
FLUX_CONTROLNET = "flux1-dev-controlnet-union-instantx.safetensors"
FLUX_CLIP_L = "clip_l.safetensors"
FLUX_T5 = "t5xxl_fp8_e4m3fn_scaled.safetensors"
FLUX_VAE = "flux_ae.safetensors"

WIDTH = 2048
HEIGHT = 2048


def build_sdxl_workflow(
    *,
    control_image: str,
    positive: str,
    negative: str,
    seed: int,
    strength: float,
    end_percent: float = 1.0,
    filename_prefix: str = "expA_sdxl",
) -> dict:
    return {
        "ckpt": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": SDXL_CHECKPOINT},
        },
        "pos": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["ckpt", 1]},
        },
        "neg": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["ckpt", 1]},
        },
        "control_img": {
            "class_type": "LoadImage",
            "inputs": {"image": control_image},
        },
        "control_inv": {
            "class_type": "ImageInvert",
            "inputs": {"image": ["control_img", 0]},
        },
        "cn": {
            "class_type": "ControlNetLoader",
            "inputs": {"control_net_name": SDXL_CONTROLNET},
        },
        "cn_apply": {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["pos", 0],
                "negative": ["neg", 0],
                "control_net": ["cn", 0],
                "image": ["control_inv", 0],
                "strength": strength,
                "start_percent": 0.0,
                "end_percent": end_percent,
            },
        },
        "latent": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1},
        },
        "sampler": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 30,
                "cfg": 7.0,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["ckpt", 0],
                "positive": ["cn_apply", 0],
                "negative": ["cn_apply", 1],
                "latent_image": ["latent", 0],
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


def build_flux_workflow(
    *,
    control_image: str,
    positive: str,
    seed: int,
    strength: float,
    end_percent: float = 0.8,
    filename_prefix: str = "expA_flux",
) -> dict:
    # Flux dev runs at cfg 1.0, so the "negative" branch is zeroed conditioning
    # (required as a graph input, has no steering effect). end_percent < 1.0
    # is InstantX guidance: full-length union-canny control degrades texture.
    return {
        "unet": {
            "class_type": "UNETLoader",
            "inputs": {"unet_name": FLUX_UNET, "weight_dtype": "fp8_e4m3fn"},
        },
        "clip": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": FLUX_CLIP_L,
                "clip_name2": FLUX_T5,
                "type": "flux",
            },
        },
        "vae": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": FLUX_VAE},
        },
        "pos_text": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["clip", 0]},
        },
        "pos": {
            "class_type": "FluxGuidance",
            "inputs": {"conditioning": ["pos_text", 0], "guidance": 3.5},
        },
        "neg": {
            "class_type": "ConditioningZeroOut",
            "inputs": {"conditioning": ["pos_text", 0]},
        },
        "control_img": {
            "class_type": "LoadImage",
            "inputs": {"image": control_image},
        },
        "control_inv": {
            "class_type": "ImageInvert",
            "inputs": {"image": ["control_img", 0]},
        },
        "cn": {
            "class_type": "ControlNetLoader",
            "inputs": {"control_net_name": FLUX_CONTROLNET},
        },
        "cn_type": {
            "class_type": "SetUnionControlNetType",
            "inputs": {
                "control_net": ["cn", 0],
                "type": "canny/lineart/anime_lineart/mlsd",
            },
        },
        "cn_apply": {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["pos", 0],
                "negative": ["neg", 0],
                "control_net": ["cn_type", 0],
                "image": ["control_inv", 0],
                "strength": strength,
                "start_percent": 0.0,
                "end_percent": end_percent,
                "vae": ["vae", 0],
            },
        },
        "latent": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {"width": WIDTH, "height": HEIGHT, "batch_size": 1},
        },
        "sampler": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 20,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["unet", 0],
                "positive": ["cn_apply", 0],
                "negative": ["cn_apply", 1],
                "latent_image": ["latent", 0],
            },
        },
        "decode": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["sampler", 0], "vae": ["vae", 0]},
        },
        "save": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": filename_prefix, "images": ["decode", 0]},
        },
    }
