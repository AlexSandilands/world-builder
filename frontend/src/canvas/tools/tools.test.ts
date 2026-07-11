import { beforeEach, describe, expect, test } from 'vitest'
import type { Region } from '../../generated/project'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useHistoryStore } from '../../state/historyStore'
import { useProjectStore } from '../../state/projectStore'
import { deleteRegionVertex } from '../../features/regions/actions'
import { BoxTool, LassoTool } from './drawTools'
import { SelectTool } from './selectTool'
import type { PointerInfo, ToolContext } from './toolTypes'

// Drives the real tool implementations headlessly (world coordinates, scale
// 1) — the same code paths the canvas pointer events invoke.

const ctx: ToolContext = { scale: () => 1, setDraft: () => {} }

function at(x: number, y: number, mods: Partial<PointerInfo> = {}): PointerInfo {
  return { world: { x, y }, shiftKey: false, altKey: false, ...mods }
}

function addRegion(region: Region): void {
  useProjectStore.getState().dispatch({ kind: 'region/add', region })
}

function regions(): Region[] {
  return useProjectStore.getState().project.regions
}

const squareAt = (id: string, x: number, y: number, z = 0): Region => ({
  id,
  type: 'water',
  z,
  geometry: {
    kind: 'polygon',
    points: [
      [x, y],
      [x + 100, y],
      [x + 100, y + 100],
      [x, y + 100],
    ],
  },
})

beforeEach(() => {
  useProjectStore.setState({ project: createDefaultProject() })
  useHistoryStore.getState().clear()
  useEditorStore.setState({
    tool: 'select',
    selectedRegionIds: [],
    regionsVisible: true,
    regionsLocked: false,
    drawType: 'residential-dense',
  })
})

describe('draw tools', () => {
  test('lasso creates a simplified polygon on top, tagged with the draw type', () => {
    addRegion(squareAt('under', 0, 0, 3))
    const lasso = new LassoTool()
    lasso.onDown(at(200, 200), ctx)
    for (const [x, y] of [
      [250, 200],
      [300, 200],
      [300, 300],
      [200, 300],
    ]) {
      lasso.onMove(at(x, y), ctx)
    }
    lasso.onUp(at(200, 300), ctx)

    const region = regions().at(-1)!
    expect(region.geometry).toEqual({
      kind: 'polygon',
      points: [
        [200, 200],
        [300, 200],
        [300, 300],
        [200, 300],
      ],
    })
    expect(region.type).toBe('residential-dense')
    expect(region.z).toBe(4)
    expect(useEditorStore.getState().selectedRegionIds).toEqual([region.id])
  })

  test('a sub-3-point lasso is discarded', () => {
    const lasso = new LassoTool()
    lasso.onDown(at(10, 10), ctx)
    lasso.onUp(at(10, 10), ctx)
    expect(regions()).toHaveLength(0)
  })

  test('rect and ellipse tools commit from a drag box', () => {
    const rect = new BoxTool('rect')
    rect.onDown(at(700, 1020), ctx)
    rect.onUp(at(900, 1160), ctx)
    expect(regions().at(-1)!.geometry).toEqual({
      kind: 'rect',
      x: 700,
      y: 1020,
      width: 200,
      height: 140,
    })

    const ellipse = new BoxTool('ellipse')
    ellipse.onDown(at(630, 280), ctx)
    ellipse.onUp(at(890, 480), ctx)
    expect(regions().at(-1)!.geometry).toEqual({
      kind: 'ellipse',
      cx: 760,
      cy: 380,
      rx: 130,
      ry: 100,
    })
  })

  test('a click-sized drag draws nothing', () => {
    const rect = new BoxTool('rect')
    rect.onDown(at(10, 10), ctx)
    rect.onUp(at(12, 11), ctx)
    expect(regions()).toHaveLength(0)
  })

  test('drawing is blocked while the regions layer is locked or hidden', () => {
    useEditorStore.setState({ regionsLocked: true })
    const rect = new BoxTool('rect')
    expect(rect.onDown(at(0, 0), ctx)).toBe(false)
    useEditorStore.setState({ regionsLocked: false, regionsVisible: false })
    expect(rect.onDown(at(0, 0), ctx)).toBe(false)
  })
})

describe('select tool', () => {
  test('click selects topmost by stacking order; empty click clears', () => {
    addRegion(squareAt('bottom', 0, 0, 0))
    addRegion(squareAt('top', 50, 50, 5))
    const select = new SelectTool()
    expect(select.onDown(at(75, 75), ctx)).toBe(true)
    select.onUp()
    expect(useEditorStore.getState().selectedRegionIds).toEqual(['top'])

    // Empty canvas begins a marquee; a press with no drag clears the selection.
    expect(select.onDown(at(500, 500), ctx)).toBe(true)
    select.onUp()
    expect(useEditorStore.getState().selectedRegionIds).toEqual([])
  })

  test('marquee drag selects every region it intersects', () => {
    addRegion(squareAt('a', 0, 0))
    addRegion(squareAt('b', 200, 0))
    addRegion(squareAt('far', 1000, 1000))
    const select = new SelectTool()
    expect(select.onDown(at(-10, -10), ctx)).toBe(true)
    select.onMove(at(320, 120), ctx)
    select.onUp(at(320, 120), ctx)
    expect([...useEditorStore.getState().selectedRegionIds].sort()).toEqual(['a', 'b'])
  })

  test('shift marquee adds to the existing selection', () => {
    addRegion(squareAt('a', 0, 0))
    addRegion(squareAt('b', 200, 0))
    useEditorStore.getState().select(['a'])
    const select = new SelectTool()
    select.onDown(at(150, -10, { shiftKey: true }), ctx)
    select.onMove(at(320, 120), ctx)
    select.onUp(at(320, 120), ctx)
    expect([...useEditorStore.getState().selectedRegionIds].sort()).toEqual(['a', 'b'])
  })

  test('deleteRegionVertex drops a vertex as a single undo step', () => {
    addRegion({
      id: 'p',
      type: 'water',
      z: 0,
      geometry: {
        kind: 'polygon',
        points: [
          [0, 0],
          [100, 0],
          [50, 5],
          [100, 100],
          [0, 100],
        ],
      },
    })
    deleteRegionVertex('p', 2)
    const geometry = regions()[0].geometry
    expect(geometry.kind === 'polygon' && geometry.points).toHaveLength(4)
    expect(useHistoryStore.getState().past).toHaveLength(2) // add + delete-vertex

    useProjectStore.getState().undo()
    const restored = regions()[0].geometry
    expect(restored.kind === 'polygon' && restored.points).toHaveLength(5)
  })

  test('shift-click toggles membership in a multi-selection', () => {
    addRegion(squareAt('a', 0, 0))
    addRegion(squareAt('b', 200, 0))
    const select = new SelectTool()
    select.onDown(at(50, 50), ctx)
    select.onUp()
    select.onDown(at(250, 50, { shiftKey: true }), ctx)
    select.onUp()
    expect(useEditorStore.getState().selectedRegionIds).toEqual(['a', 'b'])
    select.onDown(at(250, 50, { shiftKey: true }), ctx)
    select.onUp()
    expect(useEditorStore.getState().selectedRegionIds).toEqual(['a'])
  })

  test('dragging a multi-selection translates every member as one undo step', () => {
    addRegion(squareAt('a', 0, 0))
    addRegion(squareAt('b', 200, 0))
    useEditorStore.getState().select(['a', 'b'])
    const select = new SelectTool()
    select.onDown(at(50, 50), ctx)
    select.onMove(at(80, 90), ctx)
    select.onUp()

    expect(regions()[0].geometry).toMatchObject({ points: expect.arrayContaining([[30, 40]]) })
    expect(regions()[1].geometry).toMatchObject({ points: expect.arrayContaining([[230, 40]]) })
    expect(useHistoryStore.getState().past).toHaveLength(3) // 2 adds + 1 move

    useProjectStore.getState().undo()
    expect(regions()[0].geometry).toMatchObject({ points: expect.arrayContaining([[0, 0]]) })
    expect(regions()[1].geometry).toMatchObject({ points: expect.arrayContaining([[200, 0]]) })
  })

  test('vertex drag snaps to a nearby vertex of another region', () => {
    addRegion(squareAt('a', 0, 0))
    addRegion(squareAt('b', 200, 0))
    useEditorStore.getState().select(['a'])
    const select = new SelectTool()
    // Vertex 1 of `a` is at (100, 0); drag it to ~5px from b's (200, 0).
    select.onDown(at(100, 0), ctx)
    select.onMove(at(196, 3), ctx)
    select.onUp()
    expect(regions()[0].geometry).toMatchObject({ points: expect.arrayContaining([[200, 0]]) })
  })

  test('alt-click deletes a vertex; double-click on an edge inserts one', () => {
    addRegion({
      id: 'p',
      type: 'water',
      z: 0,
      geometry: {
        kind: 'polygon',
        points: [
          [0, 0],
          [100, 0],
          [50, 5],
          [100, 100],
          [0, 100],
        ],
      },
    })
    useEditorStore.getState().select(['p'])
    const select = new SelectTool()
    select.onDown(at(50, 5, { altKey: true }), ctx)
    select.onUp()
    let geometry = regions()[0].geometry
    expect(geometry.kind === 'polygon' && geometry.points).toHaveLength(4)

    select.onDoubleClick!(at(50, -2), ctx)
    geometry = regions()[0].geometry
    expect(geometry.kind === 'polygon' && geometry.points).toHaveLength(5)
    expect(geometry.kind === 'polygon' && geometry.points[1]).toEqual([50, -2])
  })

  test('a locked regions layer is not selectable or editable', () => {
    addRegion(squareAt('a', 0, 0))
    useEditorStore.setState({ regionsLocked: true })
    const select = new SelectTool()
    expect(select.onDown(at(50, 50), ctx)).toBe(false)
    expect(useEditorStore.getState().selectedRegionIds).toEqual([])
  })

  test('cancel reverts an in-flight drag without recording history', () => {
    addRegion(squareAt('a', 0, 0))
    useEditorStore.getState().select(['a'])
    const select = new SelectTool()
    select.onDown(at(50, 50), ctx)
    select.onMove(at(90, 90), ctx)
    select.cancel()
    expect(regions()[0].geometry).toMatchObject({ points: expect.arrayContaining([[0, 0]]) })
    expect(useHistoryStore.getState().past).toHaveLength(1) // just the add
  })
})
