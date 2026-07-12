from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Request, Response
from pydantic import BaseModel

from ..history.blobs import BlobStore

router = APIRouter(prefix="/api/assets", tags=["assets"])

# Raw-body upload (not multipart) keeps this dependency-free; the frontend
# sends the file bytes directly with its Content-Type header.
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_ASSET_BYTES = 32 * 1024 * 1024  # headroom for a hand-scanned sketch photo

# Sniffed from magic bytes, not trusted from the client, so GET serves a
# content-type the browser can actually decode regardless of what the
# uploader claimed.
_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"RIFF", "image/webp"),  # narrowed below: RIFF also covers WAV/AVI
)


def sniff_image_content_type(data: bytes) -> str:
    for magic, content_type in _MAGIC:
        if not data.startswith(magic):
            continue
        if content_type == "image/webp" and data[8:12] != b"WEBP":
            continue
        return content_type
    return "application/octet-stream"


class AssetRef(BaseModel):
    digest: str


def _store(request: Request) -> BlobStore:
    return request.app.state.assets


@router.post("", response_model=AssetRef, status_code=201)
async def upload_asset(request: Request) -> AssetRef:
    content_type = request.headers.get("content-type")
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail=f"unsupported content type {content_type!r}")
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="empty upload")
    if len(data) > MAX_ASSET_BYTES:
        raise HTTPException(status_code=413, detail="asset too large")
    digest = await _store(request).put(data)
    return AssetRef(digest=digest)


@router.get("/{digest}")
async def get_asset(
    digest: Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")], request: Request
) -> Response:
    try:
        data = await _store(request).get(digest)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="asset not found") from None
    return Response(content=data, media_type=sniff_image_content_type(data))
