import { createProject, getProject, updateProject } from '../../api/projects'
import { useProjectStore } from '../../state/projectStore'

// Minimal save/load plumbing: enough to round-trip the whole project
// (including the underlay) through the orchestrator across a page reload.
// The full project-management UI (list/open/rename/autosave) is #19's scope
// — this is the load-bearing primitive it will build on, not a substitute.
const STORAGE_KEY = 'world-builder:projectId'

let currentProjectId: string | null = null

function readStoredId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage unavailable (private browsing, disabled) — saving still works
    // for the rest of this session, it just won't survive a reload.
  }
}

// Test-only: constructors don't reset module state between test files that
// share a module graph.
export function _resetForTests(): void {
  currentProjectId = null
}

export async function loadPersistedProject(): Promise<boolean> {
  const id = readStoredId()
  if (!id) return false
  try {
    const record = await getProject(id)
    currentProjectId = record.id
    useProjectStore.getState().setProject(record.data)
    return true
  } catch {
    // Stale/missing id (deleted project, different orchestrator instance) —
    // fall back to the in-memory default rather than blocking the app.
    return false
  }
}

export async function saveProject(): Promise<void> {
  const project = useProjectStore.getState().project
  if (currentProjectId) {
    await updateProject(currentProjectId, project)
    return
  }
  const record = await createProject(project.meta.name, project)
  currentProjectId = record.id
  writeStoredId(record.id)
}
