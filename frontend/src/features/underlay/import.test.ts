import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useProjectStore } from '../../state/projectStore'

vi.mock('../../api/assets', () => ({
  uploadAsset: vi.fn().mockResolvedValue({ digest: 'c'.repeat(64) }),
}))

import { uploadAsset } from '../../api/assets'
import { buildImportUnderlayCommand, importUnderlay, isAcceptedImage } from './import'

function pngFile(name = 'sketch.png'): File {
  return new File(['fake-png-bytes'], name, { type: 'image/png' })
}

beforeEach(() => {
  vi.clearAllMocks()
  useProjectStore.setState({ project: createDefaultProject() })
  useEditorStore.setState({ underlayLocked: true, underlaySelected: false })
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 200, height: 100, close: vi.fn() }),
  )
})

describe('isAcceptedImage', () => {
  test('accepts png/jpeg/webp, rejects everything else', () => {
    expect(isAcceptedImage(pngFile())).toBe(true)
    expect(isAcceptedImage(new File([], 'x.pdf', { type: 'application/pdf' }))).toBe(false)
  })
})

describe('buildImportUnderlayCommand', () => {
  test('uploads the file and places it fit-to-canvas, replacing any existing underlay', async () => {
    const project = {
      ...createDefaultProject(),
      underlay: { imageRef: 'a'.repeat(64), x: 1, y: 1, width: 1, height: 1 },
    }
    const cmd = await buildImportUnderlayCommand(pngFile(), project)
    expect(uploadAsset).toHaveBeenCalledWith(expect.any(File))
    expect(cmd.kind).toBe('underlay/set')
    expect(cmd.before).toBe(project.underlay)
    expect(cmd.after?.imageRef).toBe('c'.repeat(64))
  })
})

describe('importUnderlay', () => {
  test('dispatches the command and selects+unlocks the underlay', async () => {
    await importUnderlay(pngFile())
    expect(useProjectStore.getState().project.underlay?.imageRef).toBe('c'.repeat(64))
    expect(useEditorStore.getState().underlayLocked).toBe(false)
    expect(useEditorStore.getState().underlaySelected).toBe(true)
  })

  test('a non-image file is silently ignored', async () => {
    await importUnderlay(new File([], 'notes.txt', { type: 'text/plain' }))
    expect(useProjectStore.getState().project.underlay).toBeUndefined()
    expect(uploadAsset).not.toHaveBeenCalled()
  })
})
