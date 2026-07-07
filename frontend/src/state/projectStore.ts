import { create } from 'zustand'
import type { Layer, Project } from './types'

// The project-document store. Its shape is the schema-placeholder Project type;
// when #10's generated types land, swap the import and this store keeps its API.
// (Undoable command history — a day-one requirement — is out of scope for this
// spike and lands with the editing issues that follow #16.)

// A ~16k test artwork plus one semantic region and one road line, laid out in
// shared world coordinates so the canvas has something registered to render.
export const sampleProject: Project = {
  name: 'Spike City',
  world: { width: 16384, height: 16384 },
  layers: [
    {
      id: 'artwork',
      kind: 'artwork',
      name: 'Artwork (deep-zoom tiles)',
      visible: true,
      width: 16384,
      height: 16384,
      tileSize: 256,
    },
    {
      id: 'region-old-town',
      kind: 'region',
      name: 'Old Town',
      visible: true,
      color: 0x4fd1c5,
      polygon: [
        { x: 6000, y: 6200 },
        { x: 9200, y: 5600 },
        { x: 10400, y: 8400 },
        { x: 8200, y: 10200 },
        { x: 5600, y: 9000 },
      ],
    },
    {
      id: 'line-high-road',
      kind: 'line',
      name: 'High Road',
      visible: true,
      color: 0xf6ad55,
      points: [
        { x: 2000, y: 3000 },
        { x: 7000, y: 6800 },
        { x: 9000, y: 9000 },
        { x: 13000, y: 12500 },
      ],
    },
  ],
}

type ProjectState = {
  project: Project
  selectedLayerId: string | null
  toggleLayerVisibility: (id: string) => void
  selectLayer: (id: string | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: sampleProject,
  selectedLayerId: 'region-old-town',
  toggleLayerVisibility: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        layers: s.project.layers.map((l: Layer) =>
          l.id === id ? { ...l, visible: !l.visible } : l,
        ),
      },
    })),
  selectLayer: (id) => set({ selectedLayerId: id }),
}))
