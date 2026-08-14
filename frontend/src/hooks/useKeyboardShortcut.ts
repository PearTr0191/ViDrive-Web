import { useEffect } from 'react'

type ShortcutHandler = (e: KeyboardEvent) => void

export function useKeyboardShortcut(
  handler: ShortcutHandler,
  deps: unknown[]
): void {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => handler(e)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, deps)
}

export function isModShortcut(e: KeyboardEvent, key: string): boolean {
  return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === key.toLowerCase()
}
