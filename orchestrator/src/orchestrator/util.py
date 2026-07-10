import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any


def new_id() -> str:
    return uuid.uuid4().hex


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def sha256_json(data: Any) -> str:
    """Hash of the canonical form of a JSON-able value: sorted keys, compact
    separators. Two payloads that are semantically identical but differ in key
    order or whitespace must hash the same for snapshot/reproducibility checks."""
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()
