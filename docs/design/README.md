# Design

Established by #37 in the claude-design project **world-builder UI**
(claude.ai/design, project id `58859ccf-e0e6-4c8a-961f-161ed6172679`, owned by
Alex). That project holds the living preview cards; this directory holds the
exported, binding outcome. If they ever disagree, update both in the same
change.

## Design language

**Dark chrome, cartographic soul.** The map artwork is warm parchment and ink;
the UI is a quiet warm-charcoal pro-tool shell that makes the artwork the
brightest, warmest thing on screen. Fantasy-cartography character lives in the
details, never in loud theming:

- **Warm neutrals only.** Every chrome gray has a brown undertone so UI and
  parchment share a temperature. No blue-grays.
- **Accent roles are fixed.** Brass (`--accent-brass`) is the *tool* color:
  primary actions, active tool, progress. Ink blue (`--accent-ink`) is the
  *canvas* color: selection and focus — cool, so it reads over warm artwork.
  Verdigris = success/complete, wax-seal red = destructive/error, amber =
  warnings and dirty regions. Don't repurpose them.
- **Type.** Inter for all UI; Cormorant Garamond display serif strictly
  rationed to the brand, screen titles, and empty states; mono for seeds,
  hashes, coordinates. (Webfonts self-hosted — a later UI issue adds the font
  files; system serif/sans fallbacks are in the token stacks.)
- **Icons**: single-weight 1.5 px strokes, engraving-adjacent, no fills.
- **Compact pro density**: 24 px controls, 26 px rows, 12 px body text, 4 px
  spacing grid.
- **Dark-first, dual-theme.** Tokens define dark (default) and a parchment
  light theme via `[data-theme='light']`. Ship and polish dark first.

## Canvas overlay rules (bind every UI issue)

- **Selection**: ink-blue 2 px outline + `--overlay-selection-fill` wash +
  square handles; animated dash only while geometry is being edited.
- **Dirty region** (semantics edited since last render): amber 45° hatch +
  dashed border; a non-blocking toast offers targeted regeneration.
- **Minimum-size violation**: amber fill + badge at draw time, not at render
  time.
- **Semantic x-ray**: one artwork-opacity slider morphs artwork ↔ flat
  semantic fills; per-layer visibility eyes live in the Layers panel.

## Files

- `tokens.css` — the design tokens (colors, spacing, type scale, radii,
  motion). The frontend imports this file directly
  (`frontend/src/index.css`); UI code never hardcodes a value a token covers.
  If a token is missing, add it here first, then consume it.
- `mockups/` — exported screens from the claude-design project: the five key
  screens (`authoring-canvas`, `generate-progress`, `refine-flow`,
  `history-tree`, `label-editor`) plus foundation/component sheets
  (`colors`, `type`, `controls`, `panels`, `canvas-chrome`).
