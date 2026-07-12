import { beforeEach, describe, expect, test } from 'vitest'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useHistoryStore } from '../../state/historyStore'
import { useProjectStore } from '../../state/projectStore'
import { LineTool, PointTool } from './drawTools'
import type { PointerInfo, ToolContext } from './toolTypes'

const ctx: ToolContext = { scale: () => 1, setDraft: () => {} }

function at(x: number, y: number, mods: Partial<PointerInfo> = {}): PointerInfo {
  return { world: { x, y }, shiftKey: false, altKey: false, ...mods }
}

beforeEach(() => {
  useProjectStore.setState({ project: createDefaultProject() })
  useHistoryStore.getState().clear()
  useEditorStore.setState({
    tool: 'select',
    selectedRegionIds: [],
    selectedLineIds: [],
    selectedPointIds: [],
    linesVisible: true,
    linesLocked: false,
    pointsVisible: true,
    pointsLocked: false,
    drawLineType: 'wall',
    drawLineWidth: 8,
    drawPointType: 'landmark',
  })
})

describe('LineTool', () => {
  test('each click commits a vertex; double-click finishes with the drawn type/width', () => {
    const tool = new LineTool()
    tool.onDown(at(0, 0), ctx)
    tool.onDown(at(100, 0), ctx)
    tool.onDown(at(100, 100), ctx)
    // The double-click's own second onDown lands a near-duplicate vertex at
    // the same spot as the click before it; onDoubleClick strips it.
    tool.onDown(at(100, 100), ctx)
    tool.onDoubleClick!(at(100, 100), ctx)

    const line = useProjectStore.getState().project.lines.at(-1)!
    expect(line.points).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ])
    expect(line.type).toBe('wall')
    expect(line.width).toBe(8)
    expect(useEditorStore.getState().selectedLineIds).toEqual([line.id])
  })

  test('a 1-point line (double-click right after the first click) is discarded', () => {
    const tool = new LineTool()
    tool.onDown(at(0, 0), ctx)
    tool.onDown(at(0, 0), ctx)
    tool.onDoubleClick!(at(0, 0), ctx)
    expect(useProjectStore.getState().project.lines).toHaveLength(0)
  })

  test('cancel discards an in-progress line', () => {
    const tool = new LineTool()
    tool.onDown(at(0, 0), ctx)
    tool.onDown(at(100, 0), ctx)
    tool.cancel(ctx)
    tool.onDoubleClick!(at(100, 0), ctx)
    expect(useProjectStore.getState().project.lines).toHaveLength(0)
  })

  test('drawing is blocked while the lines layer is locked or hidden', () => {
    useEditorStore.setState({ linesLocked: true })
    expect(new LineTool().onDown(at(0, 0), ctx)).toBe(false)
    useEditorStore.setState({ linesLocked: false, linesVisible: false })
    expect(new LineTool().onDown(at(0, 0), ctx)).toBe(false)
  })
})

describe('PointTool', () => {
  test('a click places a point of the drawn type, selected', () => {
    const tool = new PointTool()
    expect(tool.onDown(at(50, 60))).toBe(true)
    const point = useProjectStore.getState().project.points.at(-1)!
    expect(point.position).toEqual([50, 60])
    expect(point.type).toBe('landmark')
    expect(useEditorStore.getState().selectedPointIds).toEqual([point.id])
  })

  test('placement is blocked while the points layer is locked or hidden', () => {
    useEditorStore.setState({ pointsLocked: true })
    expect(new PointTool().onDown(at(0, 0))).toBe(false)
    useEditorStore.setState({ pointsLocked: false, pointsVisible: false })
    expect(new PointTool().onDown(at(0, 0))).toBe(false)
  })
})
