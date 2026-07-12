import json
from pathlib import Path
from typing import Any

import pytest

from orchestrator.projects.migrations import (
    CURRENT_SCHEMA_VERSION,
    UnsupportedSchemaVersion,
    migrate_project,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
MINIMAL_V2 = REPO_ROOT / "schema" / "fixtures" / "valid" / "minimal.json"


def _load_minimal_v2() -> dict[str, Any]:
    with MINIMAL_V2.open(encoding="utf-8") as f:
        return json.load(f)


def test_v1_migrates_to_current_version_unchanged_otherwise() -> None:
    v2 = _load_minimal_v2()
    v1 = {**v2, "schemaVersion": 1}

    migrated = migrate_project(v1)

    assert migrated["schemaVersion"] == CURRENT_SCHEMA_VERSION == 2
    assert migrated == v2


def test_migration_does_not_mutate_input() -> None:
    v1 = {**_load_minimal_v2(), "schemaVersion": 1}
    original = dict(v1)

    migrate_project(v1)

    assert v1 == original


def test_current_version_is_a_no_op() -> None:
    v2 = _load_minimal_v2()
    assert migrate_project(v2) == v2


@pytest.mark.parametrize("version", [0, 3, "1", None])
def test_unsupported_version_raises(version: object) -> None:
    with pytest.raises(UnsupportedSchemaVersion):
        migrate_project({**_load_minimal_v2(), "schemaVersion": version})
