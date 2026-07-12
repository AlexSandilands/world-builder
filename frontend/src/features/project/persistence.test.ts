import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Underlay } from '../../generated/project'
import { createDefaultProject } from '../../state/defaultProject'
import { useProjectStore } from '../../state/projectStore'

// jsdom in this test environment doesn't implement Storage; a minimal
// in-memory stand-in is enough to exercise persistence.ts's real read/write
// path (it isn't itself under test — the module under test is).
function fakeLocalStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => Array.from(data.keys())[index] ?? null,
    get length() {
      return data.size
    },
  }
}
vi.stubGlobal('localStorage', fakeLocalStorage())

vi.mock('../../api/projects', () => ({
  createProject: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
}))

import { createProject, getProject, updateProject } from '../../api/projects'
import { _resetForTests, loadPersistedProject, saveProject } from './persistence'

const UNDERLAY: Underlay = { imageRef: 'a'.repeat(64), x: 1, y: 2, width: 300, height: 200 }

beforeEach(() => {
  vi.clearAllMocks()
  _resetForTests()
  window.localStorage.clear()
  useProjectStore.setState({ project: createDefaultProject() })
})

describe('saveProject', () => {
  test('creates a project on first save and remembers its id', async () => {
    vi.mocked(createProject).mockResolvedValue({
      id: 'p1',
      name: 'Untitled city',
      data: createDefaultProject(),
      created_at: 't',
      updated_at: 't',
    })

    await saveProject()

    expect(createProject).toHaveBeenCalledWith('Untitled city', expect.anything())
    expect(window.localStorage.getItem('world-builder:projectId')).toBe('p1')
  })

  test('updates the same project on a subsequent save', async () => {
    vi.mocked(createProject).mockResolvedValue({
      id: 'p1',
      name: 'Untitled city',
      data: createDefaultProject(),
      created_at: 't',
      updated_at: 't',
    })
    await saveProject()
    await saveProject()

    expect(createProject).toHaveBeenCalledTimes(1)
    expect(updateProject).toHaveBeenCalledWith('p1', expect.anything())
  })
})

describe('loadPersistedProject — the underlay reload round trip (issue #30)', () => {
  test('with no stored id, leaves the default project in place', async () => {
    const loaded = await loadPersistedProject()
    expect(loaded).toBe(false)
    expect(getProject).not.toHaveBeenCalled()
  })

  test('restores the saved project, including the underlay and its transform, by id', async () => {
    window.localStorage.setItem('world-builder:projectId', 'p1')
    const saved = { ...createDefaultProject(), underlay: UNDERLAY }
    vi.mocked(getProject).mockResolvedValue({
      id: 'p1',
      name: saved.meta.name,
      data: saved,
      created_at: 't',
      updated_at: 't',
    })

    const loaded = await loadPersistedProject()

    expect(loaded).toBe(true)
    expect(useProjectStore.getState().project.underlay).toEqual(UNDERLAY)
  })

  test('a stale/missing id fails soft and keeps the default project', async () => {
    window.localStorage.setItem('world-builder:projectId', 'gone')
    vi.mocked(getProject).mockRejectedValue(new Error('404'))

    const loaded = await loadPersistedProject()

    expect(loaded).toBe(false)
    expect(useProjectStore.getState().project.underlay).toBeUndefined()
  })
})
