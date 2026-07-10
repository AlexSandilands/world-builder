import { describe, expect, test } from 'vitest'
import type { Region, WorldBuilderProject } from '../generated/project'
import type { Command } from './commands'
import {
  applyCommand,
  nextRegionId,
  nextZ,
  removeRegionsCommand,
  reorderCommand,
  replaceRegionCommand,
  stackingOrder,
  undoCommand,
} from './commands'
import { createDefaultProject } from './defaultProject'

function region(id: string, z: number, overrides: Partial<Region> = {}): Region {
  return {
    id,
    type: 'water',
    z,
    geometry: { kind: 'rect', x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  }
}

function projectWith(...regions: Region[]): WorldBuilderProject {
  return { ...createDefaultProject(), regions }
}

function roundTrip(project: WorldBuilderProject, cmd: Command): void {
  expect(undoCommand(applyCommand(project, cmd), cmd)).toEqual(project)
}

describe('command apply/undo round-trips', () => {
  test('region/add', () => {
    const p = projectWith(region('a', 0))
    const cmd: Command = { kind: 'region/add', region: region('b', 1) }
    expect(applyCommand(p, cmd).regions.map((r) => r.id)).toEqual(['a', 'b'])
    roundTrip(p, cmd)
  })

  test('region/remove restores array positions (z-tie order is semantic)', () => {
    const p = projectWith(region('a', 0), region('b', 0), region('c', 0))
    const cmd = removeRegionsCommand(p, ['a', 'c'])
    const applied = applyCommand(p, cmd)
    expect(applied.regions.map((r) => r.id)).toEqual(['b'])
    expect(undoCommand(applied, cmd).regions.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    roundTrip(p, cmd)
  })

  test('region/replace covers geometry, tag and prompt edits', () => {
    const p = projectWith(region('a', 0))
    const cmd = replaceRegionCommand(p, 'a', {
      type: 'slum',
      label: 'the Shallows',
      prompt: { mode: 'override', text: 'shanty town on stilts' },
    })!
    const applied = applyCommand(p, cmd)
    expect(applied.regions[0].label).toBe('the Shallows')
    expect(applied.regions[0].prompt?.mode).toBe('override')
    roundTrip(p, cmd)
  })

  test('region/replace with several changes is one undo step', () => {
    const p = projectWith(region('a', 0), region('b', 1))
    const cmd: Command = {
      kind: 'region/replace',
      changes: [
        { id: 'a', before: p.regions[0], after: { ...p.regions[0], z: 5 } },
        { id: 'b', before: p.regions[1], after: { ...p.regions[1], z: 6 } },
      ],
    }
    expect(applyCommand(p, cmd).regions.map((r) => r.z)).toEqual([5, 6])
    roundTrip(p, cmd)
  })

  test('replaceRegionCommand returns null for unknown ids', () => {
    expect(replaceRegionCommand(projectWith(), 'ghost', { z: 1 })).toBeNull()
  })
})

describe('stacking order and reorder', () => {
  test('sorts by z, ties broken by array order (later wins)', () => {
    const p = projectWith(region('low', 0), region('tie-early', 5), region('tie-late', 5))
    expect(stackingOrder(p.regions).map((r) => r.id)).toEqual(['low', 'tie-early', 'tie-late'])
  })

  test('raise swaps with the neighbour above', () => {
    const p = projectWith(region('a', 0), region('b', 1), region('c', 2))
    const cmd = reorderCommand(p, ['a'], 'raise')!
    const applied = applyCommand(p, cmd)
    expect(stackingOrder(applied.regions).map((r) => r.id)).toEqual(['b', 'a', 'c'])
    roundTrip(p, cmd)
  })

  test('lower swaps with the neighbour below', () => {
    const p = projectWith(region('a', 0), region('b', 1), region('c', 2))
    const applied = applyCommand(p, reorderCommand(p, ['c'], 'lower')!)
    expect(stackingOrder(applied.regions).map((r) => r.id)).toEqual(['a', 'c', 'b'])
  })

  test('raising the top region is a no-op (null command)', () => {
    const p = projectWith(region('a', 0), region('b', 1))
    expect(reorderCommand(p, ['b'], 'raise')).toBeNull()
  })

  test('z ties are renormalised so a raise is always visible', () => {
    const p = projectWith(region('under', 5), region('over', 5))
    const applied = applyCommand(p, reorderCommand(p, ['under'], 'raise')!)
    expect(stackingOrder(applied.regions).map((r) => r.id)).toEqual(['over', 'under'])
    const zs = applied.regions.map((r) => r.z)
    expect(new Set(zs).size).toBe(zs.length)
  })

  test('a multi-selection raises together without internal reshuffle', () => {
    const p = projectWith(region('a', 0), region('b', 1), region('c', 2), region('d', 3))
    const applied = applyCommand(p, reorderCommand(p, ['a', 'b'], 'raise')!)
    expect(stackingOrder(applied.regions).map((r) => r.id)).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('id and z allocation for newly drawn regions', () => {
  test('nextRegionId skips taken ids', () => {
    const p = projectWith(region('region-1', 0), region('region-2', 1))
    expect(nextRegionId(p)).toBe('region-3')
  })

  test('new regions land on top', () => {
    const p = projectWith(region('a', 7))
    expect(nextZ(p)).toBe(8)
    expect(nextZ(projectWith())).toBe(0)
  })
})
