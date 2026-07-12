import { useEffect, useRef, useState } from 'react'

// Structural subset shared by RegionTypeDef and PointTypeDef (and the fixed
// line-type enum via a synthetic option list) — maskColor is optional so
// point/line options render a neutral swatch instead of a vocabulary colour.
export type TypeOption = {
  id: string
  displayName: string
  promptFragment: string
  maskColor?: string
}

type Props = {
  types: TypeOption[]
  value: string
  onChange: (typeId: string) => void
  label?: string
}

// Type picker: colour swatch + name in the trigger, and each option previews
// its default prompt fragment (a native <select> can render neither, hence
// the custom listbox). Used for region types, point types and (given a
// synthetic option list) the fixed line-type enum.
export function TypePicker({ types, value, onChange, label = 'Type' }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = types.find((t) => t.id === value)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="type-picker" ref={rootRef}>
      <button
        type="button"
        className="type-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="type-swatch" style={{ background: current?.maskColor ?? '#888' }} />
        <span className="type-picker-name">{current?.displayName ?? value}</span>
        <span className="type-picker-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="type-picker-list" role="listbox" aria-label={label}>
          {types.map((t) => (
            <li key={t.id} role="option" aria-selected={t.id === value}>
              <button
                type="button"
                className={t.id === value ? 'type-option selected' : 'type-option'}
                onClick={() => {
                  onChange(t.id)
                  setOpen(false)
                }}
              >
                <span className="type-swatch" style={{ background: t.maskColor ?? '#888' }} />
                <span className="type-option-text">
                  <span className="type-option-name">{t.displayName}</span>
                  <span className="type-option-prompt">{t.promptFragment}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
