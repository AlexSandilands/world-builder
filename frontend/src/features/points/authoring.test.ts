import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import { beforeEach, describe, expect, test } from 'vitest'
import { PointTool } from '../../canvas/tools/drawTools'
import type { Point, WorldBuilderProject } from '../../generated/project'
import { replacePointCommand } from '../../state/commands'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useHistoryStore } from '../../state/historyStore'
import { useProjectStore } from '../../state/projectStore'

// Acceptance criterion for #18: the fixture city's landmarks (points)
// authorable in the UI; the serialised project validates against schema v2.
// Drives the real PointTool (a single onDown places a point — the exact code
// path the canvas pointer event invokes) and the inspector's command
// constructor, for every point of schema/fixtures/valid/test-city.json.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const fixture = JSON.parse(
  readFileSync(path.join(repoRoot, 'schema/fixtures/valid/test-city.json'), 'utf-8'),
) as WorldBuilderProject
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, 'schema/project.schema.json'), 'utf-8'),
) as object

function tag(id: string, patch: Partial<Point>): void {
  const { project, dispatch } = useProjectStore.getState()
  const cmd = replacePointCommand(project, id, patch)
  if (cmd) dispatch(cmd)
}

function authorFixturePoint(source: Point): string {
  const tool = new PointTool()
  const [x, y] = source.position
  tool.onDown({ world: { x, y }, shiftKey: false, altKey: false })
  const id = useEditorStore.getState().selectedPointIds[0]
  tag(id, { type: source.type })
  if (source.label) tag(id, { label: source.label })
  if (source.sizeHint) tag(id, { sizeHint: source.sizeHint })
  return id
}

beforeEach(() => {
  useProjectStore.setState({ project: createDefaultProject() })
  useHistoryStore.getState().clear()
  useEditorStore.setState({
    tool: 'select',
    selectedPointIds: [],
    selectedRegionIds: [],
    selectedLineIds: [],
    pointsVisible: true,
    pointsLocked: false,
  })
})

describe('authoring the Phase 0 fixture city — points', () => {
  test('every fixture point is authorable through the tool + tagging commands', () => {
    for (const source of fixture.points) authorFixturePoint(source)
    const project = useProjectStore.getState().project

    expect(project.points).toHaveLength(fixture.points.length)
    project.points.forEach((authored, i) => {
      const source = fixture.points[i]
      expect(authored.type).toBe(source.type)
      expect(authored.label).toEqual(source.label)
      expect(authored.sizeHint).toEqual(source.sizeHint)
      expect(authored.position).toEqual(source.position)
    })
  })

  test('the serialised project validates against schema v2', () => {
    for (const source of fixture.points) authorFixturePoint(source)
    const serialised = JSON.parse(JSON.stringify(useProjectStore.getState().project))
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    const validate = ajv.compile(schema)
    const valid = validate(serialised)
    expect(validate.errors, JSON.stringify(validate.errors, null, 2)).toBeNull()
    expect(valid).toBe(true)
  })

  test('the whole authoring session unwinds and replays through undo/redo', () => {
    for (const source of fixture.points) authorFixturePoint(source)
    const authored = useProjectStore.getState().project
    const steps = useHistoryStore.getState().past.length

    for (let i = 0; i < steps; i++) useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.points).toHaveLength(0)

    for (let i = 0; i < steps; i++) useProjectStore.getState().redo()
    expect(useProjectStore.getState().project).toEqual(authored)
  })
})
