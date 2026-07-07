import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    db_path: str
    comfy_url: str
    comfy_ws_url: str


def _ws_url(http_url: str) -> str:
    if http_url.startswith("https://"):
        return "wss://" + http_url[len("https://") :]
    if http_url.startswith("http://"):
        return "ws://" + http_url[len("http://") :]
    return http_url


def load_settings() -> Settings:
    db_path = os.environ.get("ORCH_DB", "orchestrator.db")
    comfy_url = os.environ.get("COMFY_URL", "http://127.0.0.1:8188").rstrip("/")
    return Settings(db_path=db_path, comfy_url=comfy_url, comfy_ws_url=_ws_url(comfy_url))
