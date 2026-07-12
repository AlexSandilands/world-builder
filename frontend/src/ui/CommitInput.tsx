import { useState } from 'react'

// Text input that keeps local state while typing and commits one undoable
// command on blur/Enter — keystrokes must not each become an undo step.
// Shared by the region/line/point inspectors.
export function CommitInput({
  value,
  placeholder,
  multiline = false,
  onCommit,
  'aria-label': ariaLabel,
}: {
  value: string
  placeholder?: string
  multiline?: boolean
  onCommit: (text: string) => void
  'aria-label'?: string
}) {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }
  const commit = () => {
    if (text !== value) onCommit(text)
  }
  if (multiline) {
    return (
      <textarea
        value={text}
        rows={3}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    )
  }
  return (
    <input
      type="text"
      value={text}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
