import { beforeEach, describe, expect, test } from 'vitest'
import type { Point } from '../../generated/project'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useHistoryStore } from '../../state/historyStore'
import { useProjectStore } from '../../state/projectStore'
import { PointInteraction } from './interaction'

const ctx = { scale: () => 1, setDraft: () => {} }

function down(x: number, y: number, mods: { shiftKey?: boolean; altKey?: boolean } = {}) {
  return { world: { x, y }, shiftKey: false, altKey: false, ...mods }
}

const CATHEDRAL: Point = { id: 'cathedral', type: 'landmark', position: [100, 100] }

function points(): Point[] {
  return useProjectStore.getState().project.points
}

beforeEach(() => {
  useProjectStore.setState({ project: { ...createDefaultProject(), points: [CATHEDRAL] } })
  useHistoryStore.getState().clear()
  useEditorStore.setState({
    selectedPointIds: [],
    selectedRegionIds: [],
    selectedLineIds: [],
    pointsVisible: true,
    pointsLocked: false,
  })
})

describe('PointInteraction', () => {
  test('declines when locked, hidden, or missing the marker', () => {
    useEditorStore.setState({ pointsLocked: true })
    expect(new PointInteraction().onDown(down(100, 100), ctx)).toBe(false)
    useEditorStore.setState({ pointsLocked: false, pointsVisible: false })
    expect(new PointInteraction().onDown(down(100, 100), ctx)).toBe(false)
    useEditorStore.setState({ pointsVisible: true })
    expect(new PointInteraction().onDown(down(900, 900), ctx)).toBe(false)
  })

  test('a click on the marker selects it', () => {
    const tool = new PointInteraction()
    expect(tool.onDown(down(102, 100), ctx)).toBe(true)
    tool.onUp()
    expect(useEditorStore.getState().selectedPointIds).toEqual(['cathedral'])
  })

  test('shift-click toggles membership', () => {
    const tool = new PointInteraction()
    tool.onDown(down(100, 100), ctx)
    tool.onUp()
    tool.onDown(down(100, 100, { shiftKey: true }), ctx)
    tool.onUp()
    expect(useEditorStore.getState().selectedPointIds).toEqual([])
  })

  test('dragging translates the point as one undo step', () => {
    const tool = new PointInteraction()
    tool.onDown(down(100, 100), ctx)
    tool.onMove(down(120, 90), ctx)
    tool.onUp()
    expect(points()[0].position).toEqual([120, 90])
    expect(useHistoryStore.getState().past).toHaveLength(1)

    useProjectStore.getState().undo()
    expect(points()[0].position).toEqual([100, 100])
  })

  test('cancel reverts an in-flight drag without recording history', () => {
    const tool = new PointInteraction()
    tool.onDown(down(100, 100), ctx)
    tool.onMove(down(200, 200), ctx)
    tool.cancel()
    expect(points()[0].position).toEqual([100, 100])
    expect(useHistoryStore.getState().past).toHaveLength(0)
  })

  test('a click without movement does not record a command', () => {
    const tool = new PointInteraction()
    tool.onDown(down(100, 100), ctx)
    tool.onUp()
    expect(useHistoryStore.getState().past).toHaveLength(0)
  })
})
