import { Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useHead } from '@unhead/react'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { useI18n } from './lib/i18n'
import { JsonLd, SITE_URL } from './lib/seo'
import Landing from './pages/Landing'
import TcoCalculator from './pages/TcoCalculator'
import Compare from './pages/Compare'
import Wizard from './pages/Wizard'
import History from './pages/History'
import BrowseCars from './pages/BrowseCars'
import CarDetail from './pages/CarDetail'
import Methodology from './pages/Methodology'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import NotFound from './pages/NotFound'
import DeveloperMessage from './components/DeveloperMessage'

function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  return <ErrorBoundary t={t}>{children}</ErrorBoundary>
}

function OfflineBanner() {
  const { t } = useI18n()
  const [offline, setOffline] = useState(!navigator.onLine)

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
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/tco" element={<TcoCalculator />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/wizard" element={<Wizard />} />
          <Route path="/car" element={<BrowseCars />} />
          <Route path="/history" element={<History />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/car/:id" element={<CarDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
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
  return (
    <>
      {/* Global structured data — Organization + WebSite */}
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'ViDrive',
        url: SITE_URL,
        sameAs: [],
        logo: `${SITE_URL}/favicon-light.svg`,
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'ViDrive',
        url: SITE_URL,
        inLanguage: 'vi',
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/car/{search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      }} />
      <App />
      <GlobalOverlays />
    </>
  )
}
