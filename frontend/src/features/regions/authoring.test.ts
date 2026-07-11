import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import { beforeEach, describe, expect, test } from 'vitest'
import { BoxTool, LassoTool } from '../../canvas/tools/drawTools'
import type { ToolContext } from '../../canvas/tools/toolTypes'
import type { Region, WorldBuilderProject } from '../../generated/project'
import { replaceRegionCommand, stackingOrder } from '../../state/commands'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useHistoryStore } from '../../state/historyStore'
import { useProjectStore } from '../../state/projectStore'
import { areaOf, geometryCenter, rotateAbout } from './geometry'
import { isBelowMinSize } from './minSize'

// Acceptance criterion for #17: author the Phase 0 fixture city in the UI;
// the serialised project validates against schema v1. This drives the real
// draw tools and the inspector's command constructors — the exact code paths
// the pointer/panel UI invokes — for every region of
// schema/fixtures/valid/test-city.json. (Lines/points/labels are #18/#29;
// compile verification needs the semantic compiler, #12.)

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const fixture = JSON.parse(
  readFileSync(path.join(repoRoot, 'schema/fixtures/valid/test-city.json'), 'utf-8'),
) as WorldBuilderProject
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, 'schema/project.schema.json'), 'utf-8'),
) as object

const ctx: ToolContext = { scale: () => 1, setDraft: () => {} }

function drawGeometry(geometry: Region['geometry']): string {
  if (geometry.kind === 'polygon') {
    const lasso = new LassoTool()
    const [first, ...rest] = geometry.points
    lasso.onDown({ world: { x: first[0], y: first[1] }, shiftKey: false, altKey: false }, ctx)
    for (const [x, y] of rest) {
      lasso.onMove({ world: { x, y }, shiftKey: false, altKey: false }, ctx)
    }
    const last = geometry.points[geometry.points.length - 1]
    lasso.onUp({ world: { x: last[0], y: last[1] }, shiftKey: false, altKey: false }, ctx)
  } else {
    const tool = new BoxTool(geometry.kind)
    const [a, b] =
      geometry.kind === 'rect'
        ? [
            { x: geometry.x, y: geometry.y },
            { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
          ]
        : [
            { x: geometry.cx - geometry.rx, y: geometry.cy - geometry.ry },
            { x: geometry.cx + geometry.rx, y: geometry.cy + geometry.ry },
          ]
    tool.onDown({ world: a, shiftKey: false, altKey: false }, ctx)
    tool.onMove({ world: b, shiftKey: false, altKey: false }, ctx)
    tool.onUp({ world: b, shiftKey: false, altKey: false }, ctx)
  }
  return useEditorStore.getState().selectedRegionIds[0]
}

// The inspector's tagging path: each field commit is one dispatched command.
function tag(id: string, patch: Partial<Region>): void {
  for (const [key, value] of Object.entries(patch)) {
    const { project, dispatch } = useProjectStore.getState()
    const cmd = replaceRegionCommand(project, id, { [key]: value })
    if (cmd) dispatch(cmd)
  }
}

// The UI has no rotation control (not in #17 scope), so the fixture's one
// rotated rect is authored as its rotated outline via the lasso instead.
function authorFixtureRegion(source: Region): string {
  let geometry = source.geometry
  if (geometry.kind === 'rect' && geometry.rotation) {
    const c = geometryCenter(geometry)
    const g = geometry
    const corners = [
      { x: g.x, y: g.y },
      { x: g.x + g.width, y: g.y },
      { x: g.x + g.width, y: g.y + g.height },
      { x: g.x, y: g.y + g.height },
    ].map((p) => rotateAbout(p, c, g.rotation!))
    geometry = {
      kind: 'polygon',
      points: corners.map((p): [number, number] => [p.x, p.y]) as [
        [number, number],
        [number, number],
        [number, number],
        ...[number, number][],
      ],
    }
  }
  const id = drawGeometry(geometry)
  tag(id, { type: source.type, z: source.z })
  if (source.label) tag(id, { label: source.label })
  if (source.prompt) tag(id, { prompt: source.prompt })
  return id
}

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

describe('authoring the Phase 0 fixture city', () => {
  test('every fixture region is authorable through the tools + tagging commands', () => {
    for (const source of fixture.regions) authorFixtureRegion(source)
    const project = useProjectStore.getState().project

    expect(project.regions).toHaveLength(fixture.regions.length)
    project.regions.forEach((authored, i) => {
      const source = fixture.regions[i]
      expect(authored.type).toBe(source.type)
      expect(authored.z).toBe(source.z)
      expect(authored.label).toEqual(source.label)
      expect(authored.prompt).toEqual(source.prompt)
      if (source.geometry.kind === 'rect' && source.geometry.rotation) {
        expect(authored.geometry.kind).toBe('polygon')
        expect(areaOf(authored.geometry)).toBeCloseTo(areaOf(source.geometry), 4)
      } else {
        expect(authored.geometry).toEqual(source.geometry)
      }
    })

    // Effective stacking (what the compiler rasterises) matches the fixture.
    const authoredOrder = stackingOrder(project.regions).map((r) => project.regions.indexOf(r))
    const fixtureOrder = stackingOrder(fixture.regions).map((r) => fixture.regions.indexOf(r))
    expect(authoredOrder).toEqual(fixtureOrder)

    // No fixture region trips the minimum-size warning.
    for (const r of project.regions) {
      expect(isBelowMinSize(r.geometry, project.global)).toBe(false)
    }
  })

  test('the serialised project validates against schema v1', () => {
    for (const source of fixture.regions) authorFixtureRegion(source)
    const serialised = JSON.parse(JSON.stringify(useProjectStore.getState().project))
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    const validate = ajv.compile(schema)
    const valid = validate(serialised)
    expect(validate.errors, JSON.stringify(validate.errors, null, 2)).toBeNull()
    expect(valid).toBe(true)
  })

  test('the whole authoring session unwinds and replays through undo/redo', () => {
    for (const source of fixture.regions) authorFixtureRegion(source)
    const authored = useProjectStore.getState().project
    const steps = useHistoryStore.getState().past.length

    for (let i = 0; i < steps; i++) useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.regions).toHaveLength(0)

    for (let i = 0; i < steps; i++) useProjectStore.getState().redo()
    expect(useProjectStore.getState().project).toEqual(authored)
  })
})
