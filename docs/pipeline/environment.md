# Phase 0 environment

Reproducible environment for the Phase 0 bake-off (#3–#8): raw ComfyUI, driven
by its HTTP API, on the reference GPU. Every experiment and, later, every
generation the orchestrator produces traces back to the exact files below —
if a model file changes, its hash here must change with it.

## ComfyUI

- Repo: https://github.com/comfyanonymous/ComfyUI
- Pinned commit: `7747c342d4143f35e7c8031dddf3ee4455f10a2e`
- Install location (not in this git repo — see "Where things live" below): `/mnt/storage/comfyui`
- Python: 3.12.13, venv at `/mnt/storage/comfyui/.venv` (created with `uv venv`)
- Key packages: `torch==2.12.1+cu130`, `torchvision==0.27.1`, `torchaudio==2.11.0` (CUDA 13.0 wheels), plus `pip install -r requirements.txt` from the pinned commit.
- Launch: `cd /mnt/storage/comfyui && source .venv/bin/activate && python main.py --port <port>`. Never use ComfyUI's default port (8188) when multiple agents may share the machine — pick an unused one per session.

## GPU / driver

- GPU: NVIDIA GeForce RTX 4090, 24564 MiB VRAM
- Driver: 610.43.03
- CUDA (driver): 13.3 (UMD); PyTorch built against CUDA 13.0 wheels, confirmed working (`torch.cuda.is_available() == True`)
- Host: CachyOS, kernel `7.1.3-2-cachyos`
- Only one `needs-gpu` job runs at a time (single shared 4090) — see CLAUDE.md.

## Where things live

Model weights are large binaries and are **never committed to git**. They live
in ComfyUI's standard `models/` tree, outside this repository:

```
/mnt/storage/comfyui/models/
  checkpoints/    SDXL full checkpoints (unet+clip+vae)
  controlnet/     ControlNets for both SDXL and Flux
  diffusion_models/  Flux unet-only checkpoints (main + inpainting)
  text_encoders/  Flux's separate CLIP-L / T5-XXL text encoders
  vae/            Flux's separate VAE (SDXL's is baked into its checkpoint)
```

Anyone reproducing an experiment or a generation needs this same tree,
populated per the table below, at the pinned ComfyUI commit.

## Model files

All files were fetched from the ungated URLs listed; hashes are computed
locally after download (`sha256sum`) and every one has been verified to match
its source repo's LFS sha256 (`huggingface.co/api/models/<repo>/tree/main`),
so no download is truncated or drifted from its mirror. SDXL files are the vendor's own
first-party release. Flux weights are gated at the official
`black-forest-labs` HuggingFace repos and require an authenticated,
license-accepting HF account to fetch directly — this session had no HF
credentials available, so Flux assets below were pulled from ungated mirrors
instead (noted per-row). Anyone re-running Phase 0 experiments should treat
the hash column as the reproducibility anchor regardless of which mirror a
file came from.

| Purpose | File | Source | sha256 |
|---|---|---|---|
| SDXL checkpoint (illustrated-map base candidate) | `checkpoints/sd_xl_base_1.0.safetensors` | `stabilityai/stable-diffusion-xl-base-1.0` (official, ungated) | `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b` |
| SDXL inpainting checkpoint | `checkpoints/sd_xl_base_1.0_inpainting_0.1.safetensors` | community single-file repack of `diffusers/stable-diffusion-xl-1.0-inpainting-0.1` (official multi-file source is ungated; this is a merged single-file conversion for ComfyUI's `CheckpointLoaderSimple`) via `wangqyqq/sd_xl_base_1.0_inpainting_0.1.safetensors` | `fe1b97fe6544814eb6fc8ce53f04ad8d339ec6946b58b0afd566fcc47813fa8a` |
| SDXL ControlNet — scribble/lineart | `controlnet/xinsir_controlnet-scribble-sdxl-1.0.safetensors` | `xinsir/controlnet-scribble-sdxl-1.0` (ungated) | `b3e4ac47bc814019d50dc842f579301440deb6d8f09ee1b91a30f527ace1b852` |
| SDXL ControlNet — tile | `controlnet/xinsir_controlnet-tile-sdxl-1.0.safetensors` | `xinsir/controlnet-tile-sdxl-1.0` (ungated) | `9f23ba7be22bf8796c12565e00ea4b287acac982cdf384d368a8b18b6990e011` |
| SDXL ControlNet — union | `controlnet/xinsir_controlnet-union-sdxl-1.0-promax.safetensors` | `xinsir/controlnet-union-sdxl-1.0` (`diffusion_pytorch_model_promax.safetensors`, ungated) | `9fae2e50cb431bfcbe05822b59ec2228df545ef27f711dea8949e9f4ed9f7cdc` |
| Flux dev checkpoint (fp8-scaled, fits 24GB with headroom) | `diffusion_models/flux1-dev-fp8.safetensors` | official weights, repacked by the ComfyUI team at `Comfy-Org/flux1-dev` (ungated mirror; source `black-forest-labs/FLUX.1-dev` is gated) | `8e91b68084b53a7fc44ed2a3756d821e355ac1a7b6fe29be760c1db532f3d88a` |
| Flux inpainting checkpoint (Flux.1 Fill dev) | `diffusion_models/flux1-fill-dev.safetensors` | `Comfy-Org/flux1-dev` `split_files/diffusion_models/flux1-fill-dev.safetensors` (ungated mirror; source `black-forest-labs/FLUX.1-Fill-dev` is gated) | `03e289f530df51d014f48e675a9ffa2141bc003259bf5f25d75b957e920a41ca` |
| Flux text encoder — CLIP-L | `text_encoders/clip_l.safetensors` | `comfyanonymous/flux_text_encoders` (ComfyUI author's own ungated mirror) | `660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd` |
| Flux text encoder — T5-XXL (fp8 scaled) | `text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors` | `comfyanonymous/flux_text_encoders` (ungated) | `a498f0485dc9536735258018417c3fd7758dc3bccc0a645feaa472b34955557a` |
| Flux VAE | `vae/flux_ae.safetensors` | community mirror `foxmail/flux_vae` of `black-forest-labs/FLUX.1-dev`'s `ae.safetensors` (source is gated); file size (319.8 MB) matches the documented upstream VAE size | `afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38` |
| Flux ControlNet — union (canny/depth/pose/tile in one model) | `controlnet/flux1-dev-controlnet-union-instantx.safetensors` | `InstantX/FLUX.1-dev-Controlnet-Union` (ungated) | `2cd23f9da9f2f24d75ded22c0c2596782312aa0b88e05076b4b8621a0b1fa9d1` |

Regenerate the hash column with:

```
sha256sum /mnt/storage/comfyui/models/checkpoints/*.safetensors \
          /mnt/storage/comfyui/models/controlnet/*.safetensors \
          /mnt/storage/comfyui/models/diffusion_models/*.safetensors \
          /mnt/storage/comfyui/models/text_encoders/*.safetensors \
          /mnt/storage/comfyui/models/vae/*.safetensors
```

## Known gap: gated Flux weights

The canonical `black-forest-labs/FLUX.1-dev` and `FLUX.1-Fill-dev` repos
require an HF account that has accepted the FLUX non-commercial license and
an auth token; neither was available in this session. The ComfyUI-team
mirror (`Comfy-Org/flux1-dev`) redistributes the same weights ungated and is
what ComfyUI's own documentation points users to for local setup, so it was
used instead — the sha256 hashes above are still the authoritative
reproducibility anchor regardless of mirror. If a future session has HF
credentials and wants to re-fetch from the first-party gated repo directly,
confirm the hash matches this table; if it doesn't, treat that as a signal
the mirror drifted and update this table (and re-run any experiments that
depended on it).

## API smoke test

`experiments/api-smoketest/txt2img_smoketest.py` submits a trivial SDXL
txt2img workflow (checkpoint → CLIP encode → KSampler → VAE decode →
SaveImage) via ComfyUI's HTTP API (`POST /prompt`, poll `GET /history`,
`GET /view`) and saves the resulting image — the same request shape the
orchestrator will use later. Run instructions and results are in that
script's module docstring and the PR for issue #1.
