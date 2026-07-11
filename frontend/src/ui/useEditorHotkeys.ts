import { useEffect } from 'react'
import { deleteSelectedRegions, reorderSelectedRegions } from '../features/regions/actions'
import type { ToolId } from '../state/editorStore'
import { useEditorStore } from '../state/editorStore'
import { useProjectStore } from '../state/projectStore'

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select',
  h: 'hand',
  l: 'lasso',
  r: 'rect',
  e: 'ellipse',
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable)
  )
}

export function useEditorHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const key = e.key.toLowerCase()

      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) useProjectStore.getState().redo()
        else useProjectStore.getState().undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault()
        useProjectStore.getState().redo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      if (key === 'delete' || key === 'backspace') {
        e.preventDefault()
        deleteSelectedRegions()
        return
      }
      if (key === 'escape') {
        useEditorStore.getState().clearSelection()
        return
      }
      if (key === 'pageup' || key === ']') {
        e.preventDefault()
        reorderSelectedRegions('raise')
        return
      }
      if (key === 'pagedown' || key === '[') {
        e.preventDefault()
        reorderSelectedRegions('lower')
        return
      }
      const tool = TOOL_KEYS[key]
      if (tool) useEditorStore.getState().setTool(tool)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
