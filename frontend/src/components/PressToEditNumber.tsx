/**
 * PressToEditNumber — a click-to-edit number display.
 *
 * Renders a formatted number as a clickable span. On click (or Enter/Space
 * when focused), it transforms into a number <input> so the user can type
 * a precise value — including values beyond the slider's min/max range.
 *
 * On blur or Enter, the value is validated against [min, max], clamped if
 * out of range, and reported via `onSave`. Escape reverts to the last
 * committed value.
 *
 * a11y: the span is `role="spinbutton"` with `aria-valuenow/min/max`, and
 * switches to a proper <input type="number"> in edit mode with the same
 * bounds so screen-reader users get the full numeric keyboard.
 */
import { useState, useRef, useEffect, type KeyboardEvent, type FocusEvent } from 'react'

export interface PressToEditNumberProps {
  /** Current committed value (drives the display when not editing). */
  value: number
  /** Minimum allowed value (inclusive). */
  min: number
  /** Maximum allowed value (inclusive). */
  max: number
  /** Step granularity (defaults to 1). */
  step?: number
  /** Called with the validated/clamped value when editing completes. */
  onSave: (value: number) => void
  /** Formatter for the display span (defaults to toLocaleString). */
  format?: (value: number) => string
  /** Unit suffix shown after the number, e.g. "km". */
  suffix?: string
  /** Accessible label for the display and input. */
  ariaLabel?: string
  /** When true, the span is not clickable (no active result). */
  disabled?: boolean
}

const DEFAULT_FORMAT = (v: number) => v.toLocaleString()

export default function PressToEditNumber({
  value,
  min,
  max,
  step = 1,
  onSave,
  format = DEFAULT_FORMAT,
  suffix,
  ariaLabel,
  disabled = false,
}: PressToEditNumberProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const displayRef = useRef<HTMLSpanElement>(null)

  // On enter edit mode, seed the draft with the current value and focus the input.
  const startEdit = () => {
    if (disabled) return
    setDraft(String(value))
    setError(null)
    setIsEditing(true)
  }

  // Focus trap: move to input right after it renders.
  useEffect(() => {
    if (isEditing) {
      // Defer focus so the input exists in the DOM.
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [isEditing])

  const clamp = (v: number): number => Math.min(Math.max(v, min), max)

  const commit = (next: number) => {
    const clamped = clamp(next)
    setError(null)
    onSave(clamped)
    setIsEditing(false)
  }

  const commitFromInput = (input: HTMLInputElement) => {
    const parsed = Number(input.value)
    if (Number.isNaN(parsed)) {
      setError('Please enter a number')
      return
    }
    commit(parsed)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitFromInput(e.currentTarget)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setError(null)
      setIsEditing(false)
    }
  }

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    commitFromInput(e.currentTarget)
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          if (error) setError(null)
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        aria-label={ariaLabel ?? 'Edit value'}
        aria-invalid={!!error}
        className={'ml-1 w-20 bg-[rgba(var(--bg-base-rgb),0.5)] border rounded px-1.5 py-0.5 text-sm font-mono text-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors placeholder-[var(--text-secondary)] ' +
          (error
            ? 'border-danger/50 focus:border-danger'
            : 'border-[var(--border-default)]')
        }
        onKeyUp={(e) => {
          // Re-clamp live preview so the spinner respects bounds as the user types.
          const v = Number(e.currentTarget.value)
          if (!Number.isNaN(v)) {
            setDraft(String(clamp(v)))
          }
        }}
      />
    )
  }

  return (
    <>
      <span
        ref={displayRef}
        role="spinbutton"
        aria-label={ariaLabel ?? 'Edit value'}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            startEdit()
          }
        }}
        tabIndex={disabled ? -1 : 0}
        className={`font-mono text-accent transition-colors cursor-pointer select-all ${
          disabled ? 'cursor-default opacity-60' : 'hover:text-accent-warm'
        }`}
      >
        {format(value)}
        {suffix ? ` ${suffix}` : ''}
        {error && (
          <span
            className="ml-1 text-danger text-[10px]"
            role="alert"
            aria-label={error}
          >
            ⚠
          </span>
        )}
      </span>
    </>
  )
}
