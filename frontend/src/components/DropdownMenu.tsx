import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface DropdownMenuProps {
  trigger: ReactNode
  children: ReactNode
  className?: string
}

export default function DropdownMenu({ trigger, children, className = '' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)

  const place = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }

  useEffect(() => {
    if (!open) return
    place()
    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const handleReposition = () => place()
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [open])

  return (
    <>
      <div
        ref={triggerRef}
        className={`relative inline-block ${className}`}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </div>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[200] w-[200px] overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-xl py-1"
          style={{ top: coords.top, right: coords.right }}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  )
}
