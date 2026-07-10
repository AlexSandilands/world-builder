-- Finalises the generations skeleton from 001 into the full reproducibility
-- record (VISION.md success criterion 5, issue #15): every field needed to
-- resubmit an identical workflow to ComfyUI is captured verbatim here rather
-- than re-derived, so "reproduce" byte-matches without recompiling anything.
-- inputs/outputs are name -> sha256 blob hash maps; bytes live in the
-- content-addressed blob store on disk, never in this table.
DROP TABLE generations;

CREATE TABLE generations (
    id                    TEXT PRIMARY KEY,
    job_id                TEXT REFERENCES jobs(id) ON DELETE SET NULL,
    project_id            TEXT REFERENCES projects(id) ON DELETE SET NULL,
    parent_id             TEXT REFERENCES generations(id) ON DELETE SET NULL,
    prompt_id             TEXT,
    project_snapshot_hash TEXT,
    workflow              TEXT NOT NULL DEFAULT '{}',
    inputs                TEXT NOT NULL DEFAULT '{}',
    outputs               TEXT NOT NULL DEFAULT '{}',
    seeds                 TEXT NOT NULL DEFAULT '{}',
    settings              TEXT NOT NULL DEFAULT '{}',
    model_hashes          TEXT NOT NULL DEFAULT '{}',
    environment           TEXT NOT NULL DEFAULT '{}',
    created_at            TEXT NOT NULL
);

CREATE INDEX idx_generations_job ON generations(job_id);
CREATE INDEX idx_generations_project ON generations(project_id);
CREATE INDEX idx_generations_parent ON generations(parent_id);
