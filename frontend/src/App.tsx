import { Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { useI18n } from './lib/i18n'
import { JsonLd, SITE_URL } from './lib/seo'
import { useHead } from '@unhead/react'
import DeveloperMessage from './components/DeveloperMessage'

function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  return <ErrorBoundary t={t}>{children}</ErrorBoundary>
}

function OfflineBanner() {
  const { t } = useI18n()
  const [offline, setOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false))

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  const handleRetry = () => {
    window.location.reload()
  }

  return (
    <div className="fixed top-0 left-0 w-full bg-destructive text-on-primary text-center py-2 px-4 z-50">
      <span className="mr-4">{t('common.offline')}</span>
      <button
        onClick={handleRetry}
        className="underline text-sm font-medium hover:opacity-80"
      >
        {t('common.offlineRetry')}
      </button>
    </div>
  )
}

function App() {
  return (
    <Layout>
      <OfflineBanner />
      <RouteErrorBoundary>
        <Outlet />
      </RouteErrorBoundary>
    </Layout>
  )
}

/**
 * Rendered OUTSIDE <Layout> so it is not nested inside the transformed
 * `motion.main` (the page-transition wrapper). A transformed ancestor creates
 * a stacking context that traps `position: fixed` descendants, which caused
 * the developer-message popup and (i) launcher to render behind the footer
 * (also z-10, painted later in the DOM).
 */
function GlobalOverlays() {
  return (
    <>
      <DeveloperMessage />
    </>
  )
}

export default function RootApp() {
  const { locale } = useI18n()
  // Keep <html lang> in sync with the active (default: vi) locale so the
  // prerendered SSG HTML is correctly tagged for crawlers + assistive tech.
  useHead({ htmlAttrs: { lang: locale } })

  return (
    <>
      {/* Global structured data — Organization + WebSite */}
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'ViDrive',
        url: SITE_URL,
        logo: `${SITE_URL}/favicon-light.svg`,
        sameAs: [
          'https://github.com/PearTr0191',
          'https://zalo.me/0866828946',
        ],
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'tranhoanglethanh@gmail.com',
          telephone: '+84866828946',
          contactType: 'customer support',
        },
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'ViDrive',
        url: SITE_URL,
        inLanguage: 'vi',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/car?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      }} />
      <App />
      <GlobalOverlays />
    </>
  )
}
