import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createDefaultProject } from '../state/defaultProject'
import { createProject, getProject, updateProject } from './projects'

const project = createDefaultProject()

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response
}

describe('projects api client', () => {
  test('createProject POSTs name+data and returns the record', async () => {
    const record = { id: 'p1', name: 'Old Town', data: project, created_at: 't', updated_at: 't' }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(record))

    const result = await createProject('Old Town', project)

    expect(fetch).toHaveBeenCalledWith('/api/projects', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ name: 'Old Town', data: project })
    expect(result).toEqual(record)
  })

  test('getProject GETs by id', async () => {
    const record = { id: 'p1', name: 'Old Town', data: project, created_at: 't', updated_at: 't' }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(record))

    const result = await getProject('p1')

    expect(fetch).toHaveBeenCalledWith('/api/projects/p1', undefined)
    expect(result).toEqual(record)
  })

  test('updateProject PUTs data only', async () => {
    const record = { id: 'p1', name: 'Old Town', data: project, created_at: 't', updated_at: 't2' }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(record))

    await updateProject('p1', project)

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/p1',
      expect.objectContaining({ method: 'PUT' }),
    )
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ data: project })
  })

  test('a non-ok response throws ApiError', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ detail: 'nope' }, false, 404))
    await expect(getProject('missing')).rejects.toThrow()
  })
})
