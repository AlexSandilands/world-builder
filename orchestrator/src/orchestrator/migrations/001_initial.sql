CREATE TABLE projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE jobs (
    id         TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL,
    state      TEXT NOT NULL,
    spec       TEXT NOT NULL DEFAULT '{}',
    checkpoint TEXT NOT NULL DEFAULT '{}',
    error      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_jobs_state ON jobs(state);

-- History skeleton: one row per ComfyUI submission a job makes. The full
-- reproducibility schema (inputs, seeds, model hashes, blob refs) is finalised
-- in the history issue; this is the minimal chassis jobs write to today.
CREATE TABLE generations (
    id         TEXT PRIMARY KEY,
    job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    prompt_id  TEXT,
    outputs    TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX idx_generations_job ON generations(job_id);
