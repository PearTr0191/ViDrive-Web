import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { api, formatVND, formatConsumption } from '../lib'
import type { CarInfo } from '../lib'
import { useSeoMetaSafe, JsonLd, SITE_URL } from '../lib/seo'
import AccentButton from '../components/AccentButton'
import GlassCard from '../components/ui/GlassCard'
import CarMedia from '../components/CarMedia'
import { useI18n } from '../lib/i18n'

export default function CarDetail() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const prefersReduced = useReducedMotion()

  const { data: car, isLoading, isError } = useQuery({
    queryKey: ['car', id],
    queryFn: () => {
      if (id && id.startsWith('custom-')) {
        try {
          const stored = sessionStorage.getItem('vidrive-custom-car')
          if (stored) {
            const parsed: CarInfo = JSON.parse(stored)
            if (parsed.id === id) return parsed
          }
        } catch { /* ignore parse errors */ }
        throw new Error('Custom car data not found in sessionStorage')
      }
      return api.getCar(id!)
    },
    enabled: !!id,
    retry: false,
    refetchOnWindowFocus: false,
  })

   const { data: allCars } = useQuery({
    queryKey: ['cars'],
    queryFn: () => api.getCars(),
    staleTime: 60_000,
  })

   // Dynamic SEO — must be called unconditionally (Rules of Hooks)
   const carName = car ? `${car.brand} ${car.model}` : ''
   useSeoMetaSafe({
     title: `ViDrive - ${carName || t('nav.browse')}`,
     description: car
       ? t('page.carDetailDescription', { brand: car.brand, model: car.model, segment: car.segment })
       : t('page.browseDescription'),
     canonical: car ? `/car/${car.id}` : undefined,
     ogImage: car ? `${SITE_URL}/cars/${encodeURIComponent(car.id)}.webp` : undefined,
     ogImageAlt: car ? `${car.brand} ${car.model} right-side profile` : undefined,
   })

   if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-[rgba(var(--bg-base-rgb),0.3)] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

   if (isError || !car) {
    return (
      <div className="space-y-8">
        <GlassCard className="p-12 text-center">
          <div className="text-accent text-2xl font-bold mb-4">{t('carDetail.notFound')}</div>
          <Link to="/car" className="inline-block">
            <AccentButton>{t('carDetail.backToBrowse')}</AccentButton>
          </Link>
        </GlassCard>
      </div>
    )
  }

  const relatedCars: CarInfo[] = allCars
    ? allCars.filter(c => c.segment === car.segment && c.id !== car.id).slice(0, 4)
    : []

   return (
    <div className="space-y-8">
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: t('nav.home'), item: SITE_URL },
              { '@type': 'ListItem', position: 2, name: t('nav.browse'), item: `${SITE_URL}/car` },
              { '@type': 'ListItem', position: 3, name: `${car.brand} ${car.model}`, item: `${SITE_URL}/car/${car.id}` },
            ],
          },
          {
            '@type': 'Product',
            name: `${car.brand} ${car.model}`,
            brand: { '@type': 'Brand', name: car.brand },
            model: car.model,
            category: car.segment,
            url: `${SITE_URL}/car/${car.id}`,
            offers: {
              '@type': 'Offer',
              price: car.price,
              priceCurrency: 'VND',
              availability: 'https://schema.org/InStock',
            },
            image: `${SITE_URL}/cars/${encodeURIComponent(car.id)}.webp`,
          },
        ],
      }} />
      <div className="grid lg:grid lg:grid-cols-3 lg:gap-8">
        {/* Main card */}
        <motion.div
          className="lg:col-span-2 space-y-6"
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={prefersReduced ? false : { opacity: 1, y: 0 }}
          transition={prefersReduced ? { duration: 0 } : { delay: 0.1 }}
        >
          <GlassCard className="p-6">
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <h1 className="text-4xl font-heading font-bold text-[var(--text-primary)]">
                {car.brand} {car.model}
              </h1>
              <span className={`px-3 py-1 rounded text-xs font-mono ${{
                'EV': 'text-emerald-400 bg-emerald-400/10',
                'HEV': 'text-blue-400 bg-blue-400/10',
                'ICE': 'text-accent bg-accent/10',
                'ICE-D': 'text-amber-400 bg-amber-400/10',
                }[car.type] || 'text-[var(--text-primary)] bg-[var(--bg-surface)]'}`}>
                {t(`browse.${car.type.toLowerCase()}`)}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">{car.id} • {car.segment}</span>
            </div>

            {/* Media gallery: hero right-side profile + decorative angle strips */}
            <div className="mb-6">
              <CarMedia carId={car.id} type={car.type} segment={car.segment} car={car} aspect="16 / 9" priority className="!shadow-lg" />
              {/* Decorative angle thumbnails — segment silhouettes in screened tones,
                  fill the gallery slot without drowning the spec content below. */}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.price')}</div>
                <div className="text-2xl font-mono text-accent">{formatVND(car.price)}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.seats')}</div>
                <div className="text-xl font-semibold text-[var(--text-primary)]">{car.seats}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.consumption')}</div>
                <div className="text-xl font-semibold text-[var(--text-primary)]">{formatConsumption(car)}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.annualMaintenance')}</div>
                <div className="text-xl font-semibold text-[var(--text-primary)]">{formatVND(car.annual_maintenance)}</div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-heading font-semibold text-[var(--text-primary)] mb-4">{t('carDetail.specs')}</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.brand')}</div>
                <div className="text-[var(--text-primary)]">{car.brand}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.model')}</div>
                <div className="text-[var(--text-primary)]">{car.model}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.type')}</div>
                <div className="text-[var(--text-primary)] capitalize">{t(`browse.${car.type.toLowerCase()}`)}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.segment')}</div>
                <div className="text-[var(--text-primary)]">{car.segment}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-secondary)]  mb-1">{t('carDetail.depreciationRate')}</div>
                <div className="text-[var(--text-primary)]">
                  {car.depreciation_rate != null
                    ? `${(car.depreciation_rate * 100).toFixed(1)}% / year`
                    : `—`}
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Actions sidebar */}
        <motion.aside
          className="lg:col-span-1"
          initial={prefersReduced ? false : { opacity: 0, x: 20 }}
          animate={prefersReduced ? false : { opacity: 1, x: 0 }}
          transition={prefersReduced ? { duration: 0 } : { delay: 0.2 }}
        >
          <GlassCard className="p-5 sticky top-24 space-y-4">
            <Link to={`/tco?car=${car.id}`}>
              <AccentButton className="w-full mb-1" size="md">
                  {t('tco.calculate')}
                </AccentButton>
              </Link>

              <Link to={`/compare?car=${car.id}`}>
                <AccentButton variant="outline" className="w-full">
                  {t('carDetail.compare')}
                </AccentButton>
              </Link>

            <div className="pt-4 border-t border-[var(--border-default)]">
               <Link to="/car" className="inline-flex items-center gap-2 text-accent hover:text-accent-warm transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                {t('carDetail.backToBrowse')}
              </Link>
            </div>
          </GlassCard>
        </motion.aside>
      </div>

      {/* Similar vehicles */}
      {relatedCars.length > 0 && (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 20 }}
          animate={prefersReduced ? false : { opacity: 1, y: 0 }}
          transition={prefersReduced ? { duration: 0 } : { delay: 0.3 }}
        >
          <h2 className="text-xl font-heading font-bold text-[var(--text-primary)] mb-4">
            {t('carDetail.relatedCars')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {relatedCars.map((related: CarInfo) => (
              <Link key={related.id} to={`/car/${related.id}`}>
                <GlassCard className="p-4 h-full text-center group">
                  <div className="mb-3 flex justify-center">
                    <CarMedia
                      carId={related.id}
                      type={related.type}
                      segment={related.segment}
                      car={related}
                      aspect="1 / 1"
                      className="h-20 w-auto group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <h3 className="font-heading font-semibold text-[var(--text-primary)] text-sm mb-1">
                    {related.brand} {related.model}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">{related.segment}</p>
                  <div className="text-sm font-mono text-accent">{formatVND(related.price)}</div>
                  <div className="text-xs text-accent mt-1">{t('carDetail.viewDetails')}</div>
                </GlassCard>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
