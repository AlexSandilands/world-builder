import os

import uvicorn


def main() -> None:
    """Entry point for `uv run orchestrator`; respects ORCH_PORT for parallel worktrees."""
    port = int(os.environ.get("ORCH_PORT", "8000"))
    uvicorn.run("orchestrator.app:app", host="127.0.0.1", port=port, reload=True)
