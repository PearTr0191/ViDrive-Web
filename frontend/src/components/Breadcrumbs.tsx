import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib'

/** Maps URL path segments to breadcrumb translation keys. */
const segmentMap: Record<string, string> = {
  'tco': 'breadcrumb.tco',
  'compare': 'breadcrumb.compare',
  'loan': 'breadcrumb.loan',
  'wizard': 'breadcrumb.wizard',
  'history': 'breadcrumb.history',
  'car': 'breadcrumb.car',
  'methodology': 'breadcrumb.methodology',
}

interface BreadcrumbItem {
  label: string
  path?: string
}

interface BreadcrumbsProps {
  items?: BreadcrumbItem[]
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  const { t } = useI18n()
  const location = useLocation()

  const segments = location.pathname.split('/').filter(Boolean)
  const carId = segments[0] === 'car' ? segments[1] : undefined

  // Reuses the same cache key as the car detail page, so no extra network call.
  const { data: carData } = useQuery({
    queryKey: ['car', carId],
    queryFn: () => api.getCar(carId!),
    enabled: !!carId,
    staleTime: 60_000,
  })

  const crumbs: { label: string; path: string }[] = [
    { label: t('breadcrumb.home'), path: '/' },
  ]

  if (items && items.length > 0) {
    items.forEach(item => {
      crumbs.push({ label: item.label, path: item.path || '#' })
    })
  } else {
    if (segments.length === 0) return null

    let accumulated = ''
    for (const seg of segments) {
      accumulated += `/${seg}`
      let key: string | undefined
      if (seg === 'car') {
        key = carId ? segmentMap['car'] : 'breadcrumb.browse'
      } else {
        key = segmentMap[seg]
      }
      if (key) {
        crumbs.push({ label: t(key), path: accumulated })
      }
    }

    // On a car detail route, append the car name as the final (non-link) crumb.
    if (carId) {
      const name = carData
        ? `${carData.brand} ${carData.model}`
        : carId
      crumbs.push({ label: name, path: '' })
    }
  }

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center gap-2 text-sm flex-wrap" style={{ color: 'var(--text-muted)' }}>
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1
          return (
            <li key={crumb.path} className="flex items-center gap-2">
              {idx > 0 && <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>/</span>}
              {isLast || !crumb.path ? (
                <span className="font-medium" style={{ color: 'var(--accent)' }}>{crumb.label}</span>
              ) : (
                <Link
                  to={crumb.path}
                  className="transition-colors hover:opacity-80"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
