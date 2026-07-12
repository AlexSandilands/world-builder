import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { assetUrl, uploadAsset } from './assets'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('assets api client', () => {
  test('uploadAsset sends the raw file body with its content-type', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ digest: 'd'.repeat(64) }),
    } as Response)
    const file = new File(['bytes'], 'sketch.png', { type: 'image/png' })

    const result = await uploadAsset(file)

    expect(fetch).toHaveBeenCalledWith(
      '/api/assets',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: file,
      }),
    )
    expect(result).toEqual({ digest: 'd'.repeat(64) })
  })

  test('assetUrl builds the digest GET path', () => {
    expect(assetUrl('e'.repeat(64))).toBe(`/api/assets/${'e'.repeat(64)}`)
  })
})
