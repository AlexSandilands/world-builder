import type { Region, WorldBuilderProject } from '../generated/project'

// Every mutation of the project document is expressed as one of these
// commands: plain data with a pure apply and a pure undo, so the full undo
// system (#19) can persist, replay and group them without changes here.

export type RegionAdd = { kind: 'region/add'; region: Region }
// Indices are captured at removal time so undo restores array order (z ties
// break by array order — order is semantically meaningful).
export type RegionRemove = {
  kind: 'region/remove'
  removed: { index: number; region: Region }[]
}
// One entry per edited region so a multi-select drag is a single undo step.
export type RegionReplace = {
  kind: 'region/replace'
  changes: { id: string; before: Region; after: Region }[]
}
export type RegionSetZ = {
  kind: 'region/set-z'
  changes: { id: string; before: number; after: number }[]
}

export type Command = RegionAdd | RegionRemove | RegionReplace | RegionSetZ

export function applyCommand(project: WorldBuilderProject, cmd: Command): WorldBuilderProject {
  switch (cmd.kind) {
    case 'region/add':
      return { ...project, regions: [...project.regions, cmd.region] }
    case 'region/remove': {
      const gone = new Set(cmd.removed.map((r) => r.region.id))
      return { ...project, regions: project.regions.filter((r) => !gone.has(r.id)) }
    }
    case 'region/replace': {
      const byId = new Map(cmd.changes.map((c) => [c.id, c.after]))
      return {
        ...project,
        regions: project.regions.map((r) => byId.get(r.id) ?? r),
      }
    }
    case 'region/set-z': {
      const zById = new Map(cmd.changes.map((c) => [c.id, c.after]))
      return {
        ...project,
        regions: project.regions.map((r) => (zById.has(r.id) ? { ...r, z: zById.get(r.id)! } : r)),
      }
    }
  }
}

export function undoCommand(project: WorldBuilderProject, cmd: Command): WorldBuilderProject {
  switch (cmd.kind) {
    case 'region/add':
      return { ...project, regions: project.regions.filter((r) => r.id !== cmd.region.id) }
    case 'region/remove': {
      const regions = [...project.regions]
      for (const { index, region } of [...cmd.removed].sort((a, b) => a.index - b.index)) {
        regions.splice(Math.min(index, regions.length), 0, region)
      }
      return { ...project, regions }
    }
    case 'region/replace': {
      const byId = new Map(cmd.changes.map((c) => [c.id, c.before]))
      return {
        ...project,
        regions: project.regions.map((r) => byId.get(r.id) ?? r),
      }
    }
    case 'region/set-z': {
      const zById = new Map(cmd.changes.map((c) => [c.id, c.before]))
      return {
        ...project,
        regions: project.regions.map((r) => (zById.has(r.id) ? { ...r, z: zById.get(r.id)! } : r)),
      }
    }
  }
}

export function removeRegionsCommand(
  project: WorldBuilderProject,
  ids: readonly string[],
): RegionRemove {
  const wanted = new Set(ids)
  return {
    kind: 'region/remove',
    removed: project.regions
      .map((region, index) => ({ index, region }))
      .filter((e) => wanted.has(e.region.id)),
  }
}

export function replaceRegionCommand(
  project: WorldBuilderProject,
  id: string,
  patch: Partial<Region>,
): RegionReplace | null {
  const before = project.regions.find((r) => r.id === id)
  if (!before) return null
  // z is an integer in schema v1; enforce it here so no patch source can
  // slip a fractional z into the document.
  const after = { ...before, ...patch }
  if (patch.z !== undefined) after.z = Math.round(patch.z)
  return { kind: 'region/replace', changes: [{ id, before, after }] }
}

// Bottom-to-top stacking order: ascending z, array order breaking ties
// (later wins), matching the compiler's rasterisation contract.
export function stackingOrder(regions: readonly Region[]): Region[] {
  return regions
    .map((region, index) => ({ region, index }))
    .sort((a, b) => a.region.z - b.region.z || a.index - b.index)
    .map((e) => e.region)
}

// Moves each selected region one step up/down in effective stacking order.
// z values are renormalised to unique consecutive integers first, so ties
// (possible in loaded files) resolve once and every step is visible.
export function reorderCommand(
  project: WorldBuilderProject,
  ids: readonly string[],
  direction: 'raise' | 'lower',
): RegionSetZ | null {
  const ordered = stackingOrder(project.regions)
  const selected = new Set(ids)
  const orderedIds = ordered.map((r) => r.id)

  if (direction === 'raise') {
    for (let i = orderedIds.length - 2; i >= 0; i--) {
      if (selected.has(orderedIds[i]) && !selected.has(orderedIds[i + 1])) {
        ;[orderedIds[i], orderedIds[i + 1]] = [orderedIds[i + 1], orderedIds[i]]
      }
    }
  } else {
    for (let i = 1; i < orderedIds.length; i++) {
      if (selected.has(orderedIds[i]) && !selected.has(orderedIds[i - 1])) {
        ;[orderedIds[i], orderedIds[i - 1]] = [orderedIds[i - 1], orderedIds[i]]
      }
    }
  }

  const zBefore = new Map(project.regions.map((r) => [r.id, r.z]))
  const changes = orderedIds
    .map((id, position) => ({ id, before: zBefore.get(id)!, after: position }))
    .filter((c) => c.before !== c.after)
  return changes.length > 0 ? { kind: 'region/set-z', changes } : null
}

export function nextRegionId(project: WorldBuilderProject): string {
  const taken = new Set(project.regions.map((r) => r.id))
  for (let n = project.regions.length + 1; ; n++) {
    const id = `region-${n}`
    if (!taken.has(id)) return id
  }
}

export function nextZ(project: WorldBuilderProject): number {
  return project.regions.reduce((max, r) => Math.max(max, r.z + 1), 0)
}
