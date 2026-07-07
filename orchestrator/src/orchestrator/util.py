import uuid
from datetime import UTC, datetime


def new_id() -> str:
    return uuid.uuid4().hex


def now_iso() -> str:
    return datetime.now(UTC).isoformat()
