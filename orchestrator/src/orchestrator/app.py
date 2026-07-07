from fastapi import FastAPI

app = FastAPI(title="World Builder orchestrator")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
