import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import { beforeEach, describe, expect, test } from 'vitest'
import { LineTool } from '../../canvas/tools/drawTools'
import type { ToolContext } from '../../canvas/tools/toolTypes'
import type { Line, WorldBuilderProject } from '../../generated/project'
import { replaceLineCommand } from '../../state/commands'
import { createDefaultProject } from '../../state/defaultProject'
import { useEditorStore } from '../../state/editorStore'
import { useHistoryStore } from '../../state/historyStore'
import { useProjectStore } from '../../state/projectStore'

// Acceptance criterion for #18: the fixture city's walls, roads and river
// authorable in the UI; the serialised project validates against schema v2.
// Drives the real LineTool (the exact click sequence the canvas pointer
// events invoke: onDown per vertex, a double-click to finish) and the
// inspector's command constructor, for every line of
// schema/fixtures/valid/test-city.json.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')
const fixture = JSON.parse(
  readFileSync(path.join(repoRoot, 'schema/fixtures/valid/test-city.json'), 'utf-8'),
) as WorldBuilderProject
const schema = JSON.parse(
  readFileSync(path.join(repoRoot, 'schema/project.schema.json'), 'utf-8'),
) as object

const ctx: ToolContext = { scale: () => 1, setDraft: () => {} }

function click(tool: LineTool, x: number, y: number): void {
  tool.onDown({ world: { x, y }, shiftKey: false, altKey: false }, ctx)
  tool.onUp({ world: { x, y }, shiftKey: false, altKey: false }, ctx)
}

// Places every vertex with a real click (down + up — vertices commit on
// release), then finishes with the real double-click gesture: the dblclick
// event's own two clicks land on the final vertex (the first commits it, the
// second a near-duplicate that onDoubleClick strips), then the dblclick
// handler fires — exactly the sequence a browser delivers.
function drawLine(points: Line['points']): string {
  const tool = new LineTool()
  for (let i = 0; i < points.length - 1; i++) {
    click(tool, points[i][0], points[i][1])
  }
  const [lx, ly] = points[points.length - 1]
  click(tool, lx, ly)
  click(tool, lx, ly)
  tool.onDoubleClick!({ world: { x: lx, y: ly }, shiftKey: false, altKey: false }, ctx)
  return useEditorStore.getState().selectedLineIds[0]
}

function tag(id: string, patch: Partial<Line>): void {
  const { project, dispatch } = useProjectStore.getState()
  const cmd = replaceLineCommand(project, id, patch)
  if (cmd) dispatch(cmd)
}

function authorFixtureLine(source: Line): string {
  const id = drawLine(source.points)
  tag(id, { type: source.type, width: source.width })
  if (source.style) tag(id, { style: source.style })
  return id
}

beforeEach(() => {
  useProjectStore.setState({ project: createDefaultProject() })
  useHistoryStore.getState().clear()
  useEditorStore.setState({
    tool: 'select',
    selectedLineIds: [],
    selectedRegionIds: [],
    selectedPointIds: [],
    linesVisible: true,
    linesLocked: false,
  })
})

describe('authoring the Phase 0 fixture city — lines', () => {
  test('every fixture line is authorable through the tool + tagging commands', () => {
    for (const source of fixture.lines) authorFixtureLine(source)
    const project = useProjectStore.getState().project

    expect(project.lines).toHaveLength(fixture.lines.length)
    project.lines.forEach((authored, i) => {
      const source = fixture.lines[i]
      expect(authored.type).toBe(source.type)
      expect(authored.width).toBe(source.width)
      expect(authored.style).toEqual(source.style)
      expect(authored.points).toEqual(source.points)
    })
  })

  test('the serialised project validates against schema v2', () => {
    for (const source of fixture.lines) authorFixtureLine(source)
    const serialised = JSON.parse(JSON.stringify(useProjectStore.getState().project))
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    const validate = ajv.compile(schema)
    const valid = validate(serialised)
    expect(validate.errors, JSON.stringify(validate.errors, null, 2)).toBeNull()
    expect(valid).toBe(true)
  })

  test('the whole authoring session unwinds and replays through undo/redo', () => {
    for (const source of fixture.lines) authorFixtureLine(source)
    const authored = useProjectStore.getState().project
    const steps = useHistoryStore.getState().past.length

    for (let i = 0; i < steps; i++) useProjectStore.getState().undo()
    expect(useProjectStore.getState().project.lines).toHaveLength(0)

    for (let i = 0; i < steps; i++) useProjectStore.getState().redo()
    expect(useProjectStore.getState().project).toEqual(authored)
  })
})
