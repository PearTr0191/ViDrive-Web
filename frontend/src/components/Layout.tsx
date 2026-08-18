import { NavLink, Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { useGlobalShortcuts } from '../hooks/useGlobalShortcuts'
import { useIsMobile } from '../hooks/useIsMobile'
import Breadcrumbs from './Breadcrumbs'
import TachometerScroll from './TachometerScroll'
import VerticalScrollbar from './VerticalScrollbar'
import Logo from './Logo'
import Footer from './Footer'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const prefersReduced = useReducedMotion()
  const isMobile = useIsMobile()

  useGlobalShortcuts()

  // Shortcut handlers are registered/unregistered by each page component
  // via their own useEffect cleanup. Layout no longer wipes them here,
  // because React runs child effects BEFORE parent effects — clearing in
  // a parent effect would erase what the child just registered.

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Adjust body padding-right on mobile: the tachometer sits at 56px but
  // the compact vertical scrollbar is only 6px wide, so we shrink the
  // --scrollbar-width CSS variable to match and avoid excess whitespace.
  useEffect(() => {
    const root = document.documentElement
    const original = root.style.getPropertyValue('--scrollbar-width')
    root.style.setProperty('--scrollbar-width', isMobile ? '6px' : original || '56px')
    return () => {
      root.style.setProperty('--scrollbar-width', original || '56px')
    }
  }, [isMobile])

  const navItems = [
    { path: '/', labelKey: 'nav.home' },
    { path: '/tco', labelKey: 'nav.tco' },
    { path: '/compare', labelKey: 'nav.compare' },
    { path: '/car', labelKey: 'nav.browse' },
    { path: '/history', labelKey: 'nav.history' },
    { path: '/methodology', labelKey: 'nav.methodology' },
  ]

  return (
    <div className="min-h-screen relative" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}>
       {/* Adaptive scroll indicator: tachometer on desktop, compact vertical bar on mobile */}
      {isMobile ? <VerticalScrollbar /> : <TachometerScroll />}

      {/* Skip to content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-[var(--bg-base)] focus:font-semibold"
      >
        {t('a11y.skipToContent')}
      </a>


      {/* Navbar */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          backgroundColor: 'var(--glass-bg)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
           <Link to="/" className="flex items-center gap-2.5 group" aria-label="ViDrive">
            <Logo height={28} />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1" role="navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                aria-current={location.pathname === item.path ? 'page' : undefined}
                className={({ isActive }) =>
                  `relative px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                    isActive
                      ? 'font-semibold'
                      : 'hover:text-accent-warm hover:bg-[var(--bg-surface)]'
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? 'var(--bg-base)' : 'var(--text-primary)',
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  opacity: isActive ? 1 : 0.7,
                })}
              >
                                {({ isActive }) => (
                  <>
                    {t(item.labelKey)}
                    {isActive && (
                      <motion.div
                        layoutId="nav-glow"
                        className="absolute inset-0 rounded-lg border -z-10"
                        style={{
                          backgroundColor: 'var(--accent)',
                          borderColor: 'var(--accent)',
                        }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Language toggle + theme toggle + mobile menu */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-lg border" style={{ borderColor: 'var(--border-default)', backgroundColor: 'rgba(0,0,0,0.2)' }} role="group" aria-label={t('a11y.language')}>
              <button
                onClick={() => setLocale('en')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-all ${
                  locale === 'en' ? 'bg-accent text-[var(--bg-base)] border border-accent' : 'hover:opacity-90'
                }`}
                style={locale === 'en' ? { color: 'var(--bg-base)' } : { color: 'var(--text-secondary)' }}
                aria-label={t('a11y.locale.en')}
                aria-pressed={locale === 'en'}
              >
                EN
             </button>
              <button
                onClick={() => setLocale('vi')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-all ${
                  locale === 'vi' ? 'bg-accent text-[var(--bg-base)] border border-accent' : 'hover:opacity-90'
                }`}
                style={locale === 'vi' ? { color: 'var(--bg-base)' } : { color: 'var(--text-secondary)' }}
                aria-label={t('a11y.locale.vi')}
                aria-pressed={locale === 'vi'}
              >
                VI
             </button>
           </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border transition-colors"
              style={{ borderColor: 'var(--border-default)', backgroundColor: 'rgba(0,0,0,0.2)', color: 'var(--text-secondary)' }}
              aria-label={t('a11y.themeToggle', { mode: t(theme === 'dark' ? 'a11y.theme.light' : 'a11y.theme.dark') })}
              title={t(theme === 'dark' ? 'a11y.theme.light' : 'a11y.theme.dark')}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2"
              style={{ color: 'var(--text-primary)' }}
              aria-label={t('a11y.menu')}
              aria-expanded={mobileOpen}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileOpen ? (
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                ) : (
                  <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="lg:hidden overflow-hidden border-t"
              style={{
                backgroundColor: 'var(--glass-bg)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              <div className="container mx-auto px-6 py-3 flex flex-col gap-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                    className={({ isActive }) =>
                      `px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'font-semibold' : 'hover:bg-[var(--bg-surface)]'
                      }`
                    }
                    style={({ isActive }) => ({
                      color: isActive ? 'var(--bg-base)' : 'var(--text-primary)',
                      backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                      opacity: isActive ? 1 : 0.7,
                    })}
                      >
                    {t(item.labelKey)}
                  </NavLink>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      {/* Main content with page transitions */}
      <motion.main
        key={location.pathname}
        initial={prefersReduced ? undefined : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={prefersReduced ? undefined : { opacity: 0, y: -8 }}
        transition={prefersReduced ? { duration: 0 } : { duration: 0.35, ease: [0.33, 1, 0.68, 1] }}
        className="container mx-auto px-6 py-12 relative z-10"
        id="main-content"
      >
        {location.pathname !== '/' && <Breadcrumbs />}
        {children}
      </motion.main>

      {/* Footer */}
      <Footer />
    </div>
  )
}