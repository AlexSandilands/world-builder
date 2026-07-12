import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import type { WorldBuilderProject } from '../generated/project'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const schemaPath = path.join(repoRoot, 'schema/project.schema.json')
const validDir = path.join(repoRoot, 'schema/fixtures/valid')
const invalidDir = path.join(repoRoot, 'schema/fixtures/invalid')

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

function jsonFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => path.join(dir, name))
}

// Mirrors schema/fixtures/valid/minimal.json. Typed directly against the
// generated interface (not a JSON import — literal number/string fields like
// schemaVersion: 2 widen to `number` through resolveJsonModule and defeat the
// discriminated-union checks this is meant to catch). The equality assertion
// below keeps it from drifting from the real fixture.
const minimalProject: WorldBuilderProject = {
  schemaVersion: 2,
  meta: { name: 'Minimal' },
  global: {
    artStylePrompt: 'hand-drawn fantasy city map, ink and watercolour',
    canvas: { width: 1000, height: 1000 },
    output: { width: 8192, height: 8192 },
    scale: { metersPerUnit: 2 },
    defaultFillType: 'grassland',
    seed: 0,
  },
  vocabulary: [
    {
      id: 'grassland',
      category: 'region',
      displayName: 'Grassland',
      maskColor: '#5a8f3c',
      promptFragment: 'open grassland, scattered trees',
      streetDensity: 0,
    },
  ],
  labelStyles: [],
  regions: [],
  lines: [],
  points: [],
  labels: [],
}

describe('generated project types', () => {
  it('type-checks a valid fixture and matches it structurally', () => {
    expect(minimalProject).toEqual(readJson(path.join(validDir, 'minimal.json')))
  })
})

describe('project.schema.json fixture corpus (ajv, draft 2020-12)', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(readJson(schemaPath) as object)

  const validFixtures = jsonFilesIn(validDir)
  const invalidFixtures = jsonFilesIn(invalidDir)

  it('found fixtures to test', () => {
    expect(validFixtures.length).toBeGreaterThan(0)
    expect(invalidFixtures.length).toBeGreaterThan(0)
  })

  it.each(validFixtures)('accepts %s', (filePath) => {
    const valid = validate(readJson(filePath))
    expect(validate.errors, JSON.stringify(validate.errors)).toBeNull()
    expect(valid).toBe(true)
  })

  it.each(invalidFixtures)('rejects %s', (filePath) => {
    expect(validate(readJson(filePath))).toBe(false)
  })
})
