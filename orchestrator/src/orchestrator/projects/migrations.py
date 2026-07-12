from collections.abc import Callable
from typing import Any

# schema/project.schema.json only describes the current version; documents at
# an older version must be migrated to it before validation. Forward-only, per
# docs/schema/project-v1.md.
CURRENT_SCHEMA_VERSION = 2


class UnsupportedSchemaVersion(Exception):
    def __init__(self, version: object) -> None:
        super().__init__(f"unsupported schemaVersion: {version!r}")
        self.version = version


def _v1_to_v2(data: dict[str, Any]) -> dict[str, Any]:
    # v2 added the optional `underlay` field; a v1 document is already a
    # structurally valid v2 document, so the migration is the version bump.
    return {**data, "schemaVersion": 2}


# Version -> migration to the next version. Applied repeatedly until the
# document reaches CURRENT_SCHEMA_VERSION.
_STEPS: dict[int, Callable[[dict[str, Any]], dict[str, Any]]] = {1: _v1_to_v2}


def migrate_project(data: dict[str, Any]) -> dict[str, Any]:
    """Migrate a project document to CURRENT_SCHEMA_VERSION. Pure: returns a
    new dict, never mutates `data`. Raises UnsupportedSchemaVersion for a
    version this orchestrator has no migration path for (too old with a
    missing step, or newer than this build knows)."""
    version = data.get("schemaVersion")
    result = data
    while version != CURRENT_SCHEMA_VERSION:
        step = _STEPS.get(version) if isinstance(version, int) else None
        if step is None:
            raise UnsupportedSchemaVersion(version)
        result = step(result)
        version = result.get("schemaVersion")
    return result
