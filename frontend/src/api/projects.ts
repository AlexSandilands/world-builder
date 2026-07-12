import type { WorldBuilderProject } from '../generated/project'
import { apiJson } from './client'

// One function per orchestrator project endpoint (docs/guidelines/frontend.md).
// `data` is opaque to the orchestrator (ProjectRepo stores/returns any dict);
// the schema shape is this module's contract with callers, not the server's.
export type ProjectRecord = {
  id: string
  name: string
  data: WorldBuilderProject
  created_at: string
  updated_at: string
}

export function createProject(name: string, data: WorldBuilderProject): Promise<ProjectRecord> {
  return apiJson('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, data }),
  })
}

export function getProject(id: string): Promise<ProjectRecord> {
  return apiJson(`/api/projects/${id}`)
}

export function updateProject(id: string, data: WorldBuilderProject): Promise<ProjectRecord> {
  return apiJson(`/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data }),
  })
}
