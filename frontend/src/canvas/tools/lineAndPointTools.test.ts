import { beforeEach, describe, expect, test } from 'vitest'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useHistoryStore } from '../../state/historyStore'
import { useProjectStore } from '../../state/projectStore'
import { LineTool, PointTool } from './drawTools'
import type { Draft, PointerInfo, ToolContext } from './toolTypes'

function at(x: number, y: number, mods: Partial<PointerInfo> = {}): PointerInfo {
  return { world: { x, y }, shiftKey: false, altKey: false, ...mods }
}

// Simulates a browser click: pointerdown then pointerup at the same spot —
// the sequence CanvasController routes to onDown/onUp.
function click(tool: LineTool, x: number, y: number, ctx: ToolContext): void {
  tool.onDown(at(x, y), ctx)
  tool.onUp(at(x, y), ctx)
}

// Simulates a browser double-click at the end of a draw: the dblclick event
// is always preceded by its own two full clicks (down/up, down/up), then the
// dblclick handler fires. This is the real-event-sequence regression for
// PR #59 round 1 finding 1 (lines never committed in the browser).
function doubleClick(tool: LineTool, x: number, y: number, ctx: ToolContext): void {
  click(tool, x, y, ctx)
  click(tool, x, y, ctx)
  tool.onDoubleClick!(at(x, y), ctx)
}

let draft: Draft | null = null
const ctx: ToolContext = { scale: () => 1, setDraft: (d) => (draft = d) }

beforeEach(() => {
  draft = null
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
  test('clicks place vertices; the real double-click sequence (two clicks + dblclick) finishes and dispatches the add', () => {
    const tool = new LineTool()
    click(tool, 0, 0, ctx)
    click(tool, 100, 0, ctx)
    // The final vertex is placed by the double-click itself: its first click
    // commits (100, 100), its second commits a near-duplicate that
    // onDoubleClick strips before finishing.
    doubleClick(tool, 100, 100, ctx)

    const line = useProjectStore.getState().project.lines.at(-1)!
    expect(line.points).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ])
    expect(line.type).toBe('wall')
    expect(line.width).toBe(8)
    expect(useEditorStore.getState().selectedLineIds).toEqual([line.id])
    // One line/add command: the whole draw is a single undo step and the
    // Layers panel (which lists project.lines) sees it.
    expect(useHistoryStore.getState().past).toHaveLength(1)
    expect(draft).toBeNull()
  })

  test('press-drag-release commits the vertex at the RELEASE point (finding 2 regression)', () => {
    const tool = new LineTool()
    click(tool, 0, 0, ctx)
    // Press at (100, 0), drag to (140, 30), release there.
    tool.onDown(at(100, 0), ctx)
    tool.onMove(at(120, 15), ctx)
    tool.onMove(at(140, 30), ctx)
    tool.onUp(at(140, 30), ctx)
    // The preview and the committed vertex agree: the draft's committed part
    // ends at the release point, not the press point.
    expect(draft).toMatchObject({ kind: 'line' })
    expect((draft as { points: { x: number; y: number }[] }).points[1]).toEqual({ x: 140, y: 30 })

    // The next click continues from the release point.
    tool.onMove(at(200, 50), ctx)
    expect((draft as { points: { x: number; y: number }[] }).points).toEqual([
      { x: 0, y: 0 },
      { x: 140, y: 30 },
      { x: 200, y: 50 },
    ])
    doubleClick(tool, 200, 50, ctx)
    expect(useProjectStore.getState().project.lines.at(-1)!.points).toEqual([
      [0, 0],
      [140, 30],
      [200, 50],
    ])
  })

  test('the rubber band follows hover moves between clicks', () => {
    const tool = new LineTool()
    click(tool, 0, 0, ctx)
    // No button held: CanvasController routes hover pointermove to the tool.
    tool.onMove(at(80, 40), ctx)
    expect((draft as { points: { x: number; y: number }[] }).points).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 40 },
    ])
  })

  test('Enter (finish) commits the line as drawn, no dedupe', () => {
    const tool = new LineTool()
    click(tool, 0, 0, ctx)
    click(tool, 100, 0, ctx)
    click(tool, 100, 100, ctx)
    tool.finish!(ctx)
    const line = useProjectStore.getState().project.lines.at(-1)!
    expect(line.points).toEqual([
      [0, 0],
      [100, 0],
      [100, 100],
    ])
    expect(draft).toBeNull()
  })

  test('finish with fewer than 2 vertices discards silently', () => {
    const tool = new LineTool()
    click(tool, 0, 0, ctx)
    tool.finish!(ctx)
    expect(useProjectStore.getState().project.lines).toHaveLength(0)
    // finish with no draw in progress is a no-op, not a throw
    tool.finish!(ctx)
  })

  test('a double-click as the very first action is discarded', () => {
    const tool = new LineTool()
    doubleClick(tool, 0, 0, ctx)
    expect(useProjectStore.getState().project.lines).toHaveLength(0)
  })

  test('cancel discards an in-progress line', () => {
    const tool = new LineTool()
    click(tool, 0, 0, ctx)
    click(tool, 100, 0, ctx)
    tool.cancel(ctx)
    expect(draft).toBeNull()
    tool.finish!(ctx)
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
