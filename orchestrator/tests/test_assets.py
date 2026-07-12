import hashlib
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from orchestrator.app import create_app
from orchestrator.assets.routes import MAX_ASSET_BYTES, sniff_image_content_type
from orchestrator.config import Settings

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
WEBP_MAGIC = b"RIFF\x00\x00\x00\x00WEBP"


def _app(tmp_path: Path) -> FastAPI:
    settings = Settings(
        db_path=str(tmp_path / "projects.db"),
        comfy_url="http://127.0.0.1:1",
        comfy_ws_url="ws://127.0.0.1:1",
        blob_root=str(tmp_path / "blobs"),
    )
    return create_app(settings=settings)


def test_upload_then_get_round_trips_bytes_and_sniffed_content_type(tmp_path: Path) -> None:
    data = PNG_MAGIC + b"rest-of-a-fake-png"
    with TestClient(_app(tmp_path)) as client:
        uploaded = client.post("/api/assets", content=data, headers={"content-type": "image/png"})
        assert uploaded.status_code == 201
        digest = uploaded.json()["digest"]
        assert digest == hashlib.sha256(data).hexdigest()

        fetched = client.get(f"/api/assets/{digest}")
        assert fetched.status_code == 200
        assert fetched.content == data
        assert fetched.headers["content-type"] == "image/png"


def test_upload_dedupes_identical_bytes(tmp_path: Path) -> None:
    data = JPEG_MAGIC + b"same-bytes"
    with TestClient(_app(tmp_path)) as client:
        first = client.post("/api/assets", content=data, headers={"content-type": "image/jpeg"})
        second = client.post("/api/assets", content=data, headers={"content-type": "image/jpeg"})
        assert first.json()["digest"] == second.json()["digest"]


def test_rejects_disallowed_content_type(tmp_path: Path) -> None:
    with TestClient(_app(tmp_path)) as client:
        resp = client.post(
            "/api/assets", content=b"whatever", headers={"content-type": "application/pdf"}
        )
        assert resp.status_code == 415


def test_rejects_empty_upload(tmp_path: Path) -> None:
    with TestClient(_app(tmp_path)) as client:
        resp = client.post("/api/assets", content=b"", headers={"content-type": "image/png"})
        assert resp.status_code == 400


def test_rejects_oversized_content_length_without_buffering_body(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A declared Content-Length over the limit must 413 before the body is
    ever read — patching Request.body to fail proves the handler never calls
    it, even though the actual bytes sent here are small."""

    async def _fail_if_buffered(self: Request) -> bytes:
        raise AssertionError("body() must not be called when Content-Length exceeds the limit")

    monkeypatch.setattr(Request, "body", _fail_if_buffered)
    with TestClient(_app(tmp_path)) as client:
        resp = client.post(
            "/api/assets",
            content=b"x" * 100,
            headers={
                "content-type": "image/png",
                "content-length": str(MAX_ASSET_BYTES + 1),
            },
        )
        assert resp.status_code == 413


def test_rejects_body_exceeding_limit_when_content_length_understates_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Streaming backstop: a body that actually exceeds the limit is still
    rejected even if Content-Length under-reports (or is absent)."""
    monkeypatch.setattr("orchestrator.assets.routes.MAX_ASSET_BYTES", 16)
    with TestClient(_app(tmp_path)) as client:
        resp = client.post(
            "/api/assets",
            content=PNG_MAGIC + b"way more than sixteen bytes of data",
            headers={"content-type": "image/png"},
        )
        assert resp.status_code == 413


def test_get_missing_asset_404s(tmp_path: Path) -> None:
    with TestClient(_app(tmp_path)) as client:
        resp = client.get("/api/assets/" + "0" * 64)
        assert resp.status_code == 404


def test_assets_store_is_isolated_from_history_blob_store(tmp_path: Path) -> None:
    """A digest uploaded as an asset must not be reachable via the history
    blob endpoint (or vice versa) — the whole point of the separate root."""
    data = PNG_MAGIC + b"isolated"
    with TestClient(_app(tmp_path)) as client:
        digest = client.post(
            "/api/assets", content=data, headers={"content-type": "image/png"}
        ).json()["digest"]
        assert client.get(f"/api/blobs/{digest}").status_code == 404


def test_sniff_image_content_type() -> None:
    assert sniff_image_content_type(PNG_MAGIC + b"x") == "image/png"
    assert sniff_image_content_type(JPEG_MAGIC + b"x") == "image/jpeg"
    assert sniff_image_content_type(WEBP_MAGIC) == "image/webp"
    assert sniff_image_content_type(b"RIFF\x00\x00\x00\x00WAVEfmt ") == "application/octet-stream"
    assert sniff_image_content_type(b"not an image") == "application/octet-stream"
