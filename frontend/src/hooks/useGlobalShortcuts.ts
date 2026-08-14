import { useEffect } from 'react'

type ShortcutHandlers = {
  onFocusSearch?: () => void
  onCloseOverlay?: () => void
  onCalculate?: () => void
  onReset?: () => void
}

// Module-level registry so pages can register their handlers without
// prop-drilling through Layout. The hook always reads from this.
let registeredHandlers: ShortcutHandlers = {}

// Text-typing inputs that legitimately own the Enter / Escape keys
// (typing in a field, picking an autocomplete option, etc.).
// Range, checkbox, button, submit, reset, etc. do NOT own these keys
// — letting Enter through on a range slider is what makes Calculate fire
// after the user has touched any slider, and what makes Esc fire after
// the user has picked a car from the autocomplete.
const TEXT_TYPING_INPUT_TYPES = new Set([
  'text', 'search', 'email', 'password', 'url', 'tel', 'number',
  'date', 'datetime-local', 'month', 'week', 'time',
])

const isTextTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'textarea' || target.isContentEditable) return true
  if (tag === 'input') {
    return TEXT_TYPING_INPUT_TYPES.has((target as HTMLInputElement).type.toLowerCase())
  }
  return false
}

// Headless UI's Combobox sets `aria-expanded="true"` on the input while
// its listbox is open. While that's true, Enter on that input means
// "pick the highlighted option", not "submit". Detect it so we don't
// double-fire Calculate when the user confirms an autocomplete pick.
//
// IMPORTANT: must be called at the START of the handler — after
// CarSearchSelect's own handleKeyDown fires handleSelectCar(), which
// synchronously blurs the input, document.activeElement will already
// have moved off the combobox by the time the event bubbles here.
const isAutocompleteOpen = (activeEl: Element | null): boolean => {
  if (!(activeEl instanceof HTMLElement)) return false
  if (activeEl.getAttribute('role') !== 'combobox') return false
  return activeEl.getAttribute('aria-expanded') === 'true'
}

// Special Enter target: an active combobox input with its listbox DROPPED.
// This handles "user picked a car via click → focus left the input →
// pressed Enter to actually Calculate". We snapshot activeElement here
// too, for the same reason as above.
const isClosedCombobox = (activeEl: Element | null): boolean => {
  if (!(activeEl instanceof HTMLElement)) return false
  return activeEl.getAttribute('role') === 'combobox' &&
         activeEl.getAttribute('aria-expanded') === 'false'
}

/**
 * Register shortcut handlers for the current page.
 * Call from page components (e.g. BrowseCars, History) to enable
 * `/` focus-search and `Escape` close-overlay.
 */
export function registerShortcutHandlers(handlers: ShortcutHandlers): void {
  registeredHandlers = { ...registeredHandlers, ...handlers }
}

/**
 * Clear all registered shortcut handlers (e.g. on route change).
 */
export function clearShortcutHandlers(): void {
  registeredHandlers = {}
}

/**
 * Clear a previously registered handler.
 * Pass the field name(s) to null/undefined to remove.
 */
export function unregisterShortcutHandlers(fields: ('onFocusSearch' | 'onCloseOverlay' | 'onCalculate' | 'onReset')[]): void {
  fields.forEach(f => {
    delete (registeredHandlers as Record<string, unknown>)[f]
  })
}

/**
 * Attaches global keyboard listeners once (in Layout).
 *
 * Priority order per key (first registered handler wins):
 * - `/`        → `onFocusSearch`         (always allowed, even in inputs)
 * - `Enter`    → `onCalculate`           (skipped only when the user is in a
 *                                         text-typing field with an open
 *                                         autocomplete; otherwise fires —
 *                                         including from range sliders, buttons,
 *                                         selects, body, and divs)
 * - `Escape`   → `onReset` then `onCloseOverlay`
 *                                         (both skip text-typing targets only;
 *                                         a range slider / button doesn't block
 *                                         a Reset trigger)
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Snapshot activeElement at handler entry. By the time this runs,
      // the React onKeyDown handler on the focused element has already
      // fired (React uses bubble phase) and may have blurred the input
      // (CarSearchSelect does this synchronously inside handleSelectCar).
      // We need the pre-blur state to detect an open autocomplete.
      const activeAtEntry = document.activeElement
      const autocompleteOpen = isAutocompleteOpen(activeAtEntry)

      // `/` — focus search (allowed anywhere, including inputs, since it's
      // the universal "focus search" shortcut)
      if (e.key === '/' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (registeredHandlers.onFocusSearch) {
          e.preventDefault()
          registeredHandlers.onFocusSearch()
          return
        }
      }

      // `Enter` — trigger Calculate unless the user is currently picking
      // from an open autocomplete listbox, or composing text via an IME
      // (Japanese / Chinese / Korean / Vietnamese Telex/VNI), or holding
      // a modifier that signals a different intent (Shift+Enter is
      // "newline in textarea"; Ctrl/Meta+Enter is the conventional form-
      // submit shortcut and we let the browser handle it).
      //
      // Everything else (range sliders, checkboxes, buttons, selects,
      // body, divs, and even a closed combobox input) qualifies.
      if (e.key === 'Enter') {
        // eslint-disable-next-line no-console
        if (autocompleteOpen) return
        // IME composition: e.isComposing is true while the user is still
        // choosing characters (e.g. typing "sinh viên" with Telex and
        // pressing Enter mid-composition). keyCode 229 is the legacy
        // equivalent on older browsers.
        if (e.isComposing || e.keyCode === 229) return
        // Modifier keys signal a different intent — let the browser
        // handle them natively (textarea newlines, browser shortcuts,
        // accessibility tools, etc.).
        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return

        const onTextField = isTextTypingTarget(e.target)
        const onClosedCombobox = isClosedCombobox(activeAtEntry)

        if (registeredHandlers.onCalculate) {
          if (!onTextField || onClosedCombobox) {
            e.preventDefault()
            registeredHandlers.onCalculate()
            return
          }
        }
      }

      // `Escape` — onReset takes priority over onCloseOverlay; both skip
      // text-typing targets so a textarea being edited is never stolen.
      // Range sliders / body / divs do NOT block.
      if (e.key === 'Escape') {
        if (registeredHandlers.onReset && !isTextTypingTarget(e.target)) {
          e.preventDefault()
          registeredHandlers.onReset()
          return
        }
        if (registeredHandlers.onCloseOverlay && !isTextTypingTarget(e.target)) {
          e.preventDefault()
          registeredHandlers.onCloseOverlay()
          return
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
}
