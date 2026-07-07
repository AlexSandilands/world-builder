"""Round-trip tests for schema/project.schema.json: every valid/ fixture
parses into the generated Pydantic model and re-serialises byte-for-byte
equal (as JSON structure); every invalid/ fixture is rejected by both the
generated model and the raw JSON Schema.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from orchestrator.generated.project import WorldBuilderProject

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = REPO_ROOT / "schema" / "project.schema.json"
VALID_DIR = REPO_ROOT / "schema" / "fixtures" / "valid"
INVALID_DIR = REPO_ROOT / "schema" / "fixtures" / "invalid"


def _load(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return json.load(f)  # type: ignore[no-any-return]


def _raw_schema() -> dict[str, Any]:
    return _load(SCHEMA_PATH)


VALID_FIXTURES = sorted(VALID_DIR.glob("*.json"))
INVALID_FIXTURES = sorted(INVALID_DIR.glob("*.json"))


def test_fixture_dirs_are_non_empty() -> None:
    assert VALID_FIXTURES, "no valid fixtures found"
    assert INVALID_FIXTURES, "no invalid fixtures found"


@pytest.mark.parametrize("path", VALID_FIXTURES, ids=lambda p: p.name)
def test_valid_fixture_round_trips_through_pydantic(path: Path) -> None:
    original = _load(path)

    project = WorldBuilderProject.model_validate(original)
    round_tripped = json.loads(project.model_dump_json(by_alias=True, exclude_unset=True))

    assert round_tripped == original


@pytest.mark.parametrize("path", VALID_FIXTURES, ids=lambda p: p.name)
def test_valid_fixture_passes_raw_json_schema(path: Path) -> None:
    validator = Draft202012Validator(_raw_schema())
    validator.validate(_load(path))


@pytest.mark.parametrize("path", INVALID_FIXTURES, ids=lambda p: p.name)
def test_invalid_fixture_rejected_by_pydantic(path: Path) -> None:
    with pytest.raises(ValidationError):
        WorldBuilderProject.model_validate(_load(path))


@pytest.mark.parametrize("path", INVALID_FIXTURES, ids=lambda p: p.name)
def test_invalid_fixture_rejected_by_raw_json_schema(path: Path) -> None:
    validator = Draft202012Validator(_raw_schema())
    assert not validator.is_valid(_load(path))


def test_raw_schema_is_self_consistent() -> None:
    Draft202012Validator.check_schema(_raw_schema())
