import type { Line, Point, Region, Underlay, WorldBuilderProject } from '../generated/project'

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

// Lines and points carry no z — the compiler handles each line type
// structurally rather than by stacking order (docs/schema/project-v1.md), so
// unlike regions there is no reorder command.
export type LineAdd = { kind: 'line/add'; line: Line }
export type LineRemove = { kind: 'line/remove'; removed: { index: number; line: Line }[] }
export type LineReplace = {
  kind: 'line/replace'
  changes: { id: string; before: Line; after: Line }[]
}

export type PointAdd = { kind: 'point/add'; point: Point }
export type PointRemove = { kind: 'point/remove'; removed: { index: number; point: Point }[] }
export type PointReplace = {
  kind: 'point/replace'
  changes: { id: string; before: Point; after: Point }[]
}

// One command covers import (before undefined), transform edit (both
// defined) and removal (after undefined) — a single underlay, no id needed.
export type UnderlaySet = {
  kind: 'underlay/set'
  before: Underlay | undefined
  after: Underlay | undefined
}

export type Command =
  | RegionAdd
  | RegionRemove
  | RegionReplace
  | RegionSetZ
  | LineAdd
  | LineRemove
  | LineReplace
  | PointAdd
  | PointRemove
  | PointReplace
  | UnderlaySet

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
    case 'line/add':
      return { ...project, lines: [...project.lines, cmd.line] }
    case 'line/remove': {
      const gone = new Set(cmd.removed.map((r) => r.line.id))
      return { ...project, lines: project.lines.filter((l) => !gone.has(l.id)) }
    }
    case 'line/replace': {
      const byId = new Map(cmd.changes.map((c) => [c.id, c.after]))
      return { ...project, lines: project.lines.map((l) => byId.get(l.id) ?? l) }
    }
    case 'point/add':
      return { ...project, points: [...project.points, cmd.point] }
    case 'point/remove': {
      const gone = new Set(cmd.removed.map((r) => r.point.id))
      return { ...project, points: project.points.filter((p) => !gone.has(p.id)) }
    }
    case 'point/replace': {
      const byId = new Map(cmd.changes.map((c) => [c.id, c.after]))
      return { ...project, points: project.points.map((p) => byId.get(p.id) ?? p) }
    }
    case 'underlay/set':
      return { ...project, underlay: cmd.after }
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
    case 'line/add':
      return { ...project, lines: project.lines.filter((l) => l.id !== cmd.line.id) }
    case 'line/remove': {
      const lines = [...project.lines]
      for (const { index, line } of [...cmd.removed].sort((a, b) => a.index - b.index)) {
        lines.splice(Math.min(index, lines.length), 0, line)
      }
      return { ...project, lines }
    }
    case 'line/replace': {
      const byId = new Map(cmd.changes.map((c) => [c.id, c.before]))
      return { ...project, lines: project.lines.map((l) => byId.get(l.id) ?? l) }
    }
    case 'point/add':
      return { ...project, points: project.points.filter((p) => p.id !== cmd.point.id) }
    case 'point/remove': {
      const points = [...project.points]
      for (const { index, point } of [...cmd.removed].sort((a, b) => a.index - b.index)) {
        points.splice(Math.min(index, points.length), 0, point)
      }
      return { ...project, points }
    }
    case 'point/replace': {
      const byId = new Map(cmd.changes.map((c) => [c.id, c.before]))
      return { ...project, points: project.points.map((p) => byId.get(p.id) ?? p) }
    }
    case 'underlay/set':
      return { ...project, underlay: cmd.before }
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

export function replaceUnderlayCommand(
  project: WorldBuilderProject,
  patch: Partial<Underlay>,
): UnderlaySet | null {
  const before = project.underlay
  if (!before) return null
  return { kind: 'underlay/set', before, after: { ...before, ...patch } }
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

export function removeLinesCommand(
  project: WorldBuilderProject,
  ids: readonly string[],
): LineRemove {
  const wanted = new Set(ids)
  return {
    kind: 'line/remove',
    removed: project.lines
      .map((line, index) => ({ index, line }))
      .filter((e) => wanted.has(e.line.id)),
  }
}

export function replaceLineCommand(
  project: WorldBuilderProject,
  id: string,
  patch: Partial<Line>,
): LineReplace | null {
  const before = project.lines.find((l) => l.id === id)
  if (!before) return null
  return { kind: 'line/replace', changes: [{ id, before, after: { ...before, ...patch } }] }
}

export function nextLineId(project: WorldBuilderProject): string {
  const taken = new Set(project.lines.map((l) => l.id))
  for (let n = project.lines.length + 1; ; n++) {
    const id = `line-${n}`
    if (!taken.has(id)) return id
  }
}

export function removePointsCommand(
  project: WorldBuilderProject,
  ids: readonly string[],
): PointRemove {
  const wanted = new Set(ids)
  return {
    kind: 'point/remove',
    removed: project.points
      .map((point, index) => ({ index, point }))
      .filter((e) => wanted.has(e.point.id)),
  }
}

export function replacePointCommand(
  project: WorldBuilderProject,
  id: string,
  patch: Partial<Point>,
): PointReplace | null {
  const before = project.points.find((p) => p.id === id)
  if (!before) return null
  return { kind: 'point/replace', changes: [{ id, before, after: { ...before, ...patch } }] }
}

export function nextPointId(project: WorldBuilderProject): string {
  const taken = new Set(project.points.map((p) => p.id))
  for (let n = project.points.length + 1; ; n++) {
    const id = `point-${n}`
    if (!taken.has(id)) return id
  }
}
