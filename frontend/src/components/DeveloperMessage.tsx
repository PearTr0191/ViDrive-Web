import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'

/**
 * DeveloperMessage — overlay popup shown once on first visit.
 * - Re-opened via the floating (i) button anchored bottom-right (clears the
 *   custom scrollbar by using --scrollbar-width).
 * - Dismissal state is stored in localStorage so the modal does NOT re-pop on
 *   subsequent visits; only the (i) launcher remains visible.
 */
const STORAGE_KEY = 'vidrive-dev-msg-seen'

export default function DeveloperMessage() {
  const { t } = useI18n()
  const prefersReduced = useReducedMotion()
  const [open, setOpen] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => closeBtnRef.current?.focus(), 50)
      return () => window.clearTimeout(id)
    }
  }, [open])

  function closeModal() {
    setOpen(false)
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* storage unavailable — launcher stays available this session */
    }
  }

  function openModal() {
    setOpen(true)
  }

  return (
    <>
      {/* Floating (i) launcher — bottom-right, clear of the custom scrollbar.
          Only rendered after the initial storage read so we don't flash it
          before knowing the user has already dismissed. */}
      {!open && (
        <motion.button
          initial={false}
          animate={{ opacity: 1, scale: 1 }}
          onClick={openModal}
          aria-label={t('devMsg.reopenAria')}
          title={t('devMsg.reopenAria')}
          className="fixed bottom-6 z-40 flex items-center justify-center rounded-full cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          style={{
            right: 'calc(var(--scrollbar-width) + 1.25rem)',
            width: '44px',
            height: '44px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(var(--accent-rgb), 0.15)',
            color: 'var(--accent)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow =
              '0 6px 28px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(var(--accent-rgb), 0.45)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow =
              '0 4px 20px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(var(--accent-rgb), 0.15)'
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
         </svg>
       </motion.button>
      )}

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="dev-msg-overlay"
            initial={prefersReduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{
              backgroundColor: 'rgba(var(--bg-base-rgb), 0.7)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal()
            }}
            role="presentation"
          >
            <motion.div
              key="dev-msg-card"
              initial={prefersReduced ? false : { opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={prefersReduced ? { duration: 0 } : { duration: 0.28, ease: [0.33, 1, 0.68, 1] }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dev-msg-title"
              className="glass-card-glow relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl p-6 sm:p-8"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
              }}
            >
              {/* Close button */}
              <button
                ref={closeBtnRef}
                onClick={closeModal}
                aria-label={t('devMsg.close')}
                className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
               </svg>
             </button>

              {/* Title */}
              <h2
                id="dev-msg-title"
                className="font-heading text-xl sm:text-2xl font-semibold mb-5 pr-10"
                style={{ color: 'var(--text-primary)' }}
              >
                {t('devMsg.title')}
             </h2>

              {/* Body: market context, then the developer's note with the
                  accuracy claim linked to the Methodology page */}
              <div
                className="space-y-4 text-sm sm:text-base leading-relaxed text-justify"
                style={{ color: 'var(--text-secondary)' }}
              >
                <p>
                  {t('devMsg.p1')}
                  <strong className="dev-msg-strong-accent">{t('devMsg.p1Bold')}</strong>.
               </p>
                <p>
                  {t('devMsg.p2a')}
                  <Link to="/methodology" onClick={closeModal} className="dev-msg-link">{t('devMsg.p2Link')}</Link>
                  {t('devMsg.p2b')}
                </p>
             </div>

              {/* Footer action */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={closeModal}
                  className="px-5 py-2 rounded-lg text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--bg-base)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--accent-warm)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--accent)'
                  }}
                >
                  {t('devMsg.close')}
               </button>
             </div>
           </motion.div>
         </motion.div>
        )}
     </AnimatePresence>
    </>
  )
}
