from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from orchestrator.app import create_app
from orchestrator.config import Settings


def _app(tmp_path: Path) -> FastAPI:
    settings = Settings(
        db_path=str(tmp_path / "projects.db"),
        comfy_url="http://127.0.0.1:1",
        comfy_ws_url="ws://127.0.0.1:1",
    )
    return create_app(settings=settings)


def test_project_round_trip(tmp_path: Path) -> None:
    data = {"regions": [{"id": "r1", "type": "district"}], "canvas": {"w": 100}}
    with TestClient(_app(tmp_path)) as client:
        created = client.post("/api/projects", json={"name": "Old Town", "data": data})
        assert created.status_code == 201
        project_id = created.json()["id"]
        assert created.json()["name"] == "Old Town"
        assert created.json()["data"] == data

        listed = client.get("/api/projects")
        assert listed.status_code == 200
        assert any(row["id"] == project_id for row in listed.json())

        fetched = client.get(f"/api/projects/{project_id}")
        assert fetched.status_code == 200
        assert fetched.json()["data"] == data

        updated = client.put(f"/api/projects/{project_id}", json={"data": {"regions": []}})
        assert updated.status_code == 200
        assert updated.json()["name"] == "Old Town"
        assert updated.json()["data"] == {"regions": []}

        assert client.delete(f"/api/projects/{project_id}").status_code == 204
        assert client.get(f"/api/projects/{project_id}").status_code == 404


def test_get_missing_project(tmp_path: Path) -> None:
    with TestClient(_app(tmp_path)) as client:
        assert client.get("/api/projects/nope").status_code == 404
