import { useQuery } from '@tanstack/react-query'
import { statsApi, type OwnershipStats } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { useState, useEffect, type ReactNode } from 'react'
import { useReducedMotion } from 'framer-motion'

const STAT_SKELETON_DELAY_MS = 1500

type LocaleKey = 'landing' | 'tco' | 'compare'

/** D — honest social-proof line.
 *
 * Fetches `GET /api/stats/ownership` and renders the fleet min/max annual
 * *operating* cost. When `carId` is provided the API also returns
 * `user_percentile`, which is rendered as "top X% most expensive".
 *
 * When `onRoad` and `tco` are both provided, an additional clause shows
 * total ownership cost as a percentage of on-road price.
 *
 * Hides entirely when:
 *  - the request errors, or
 *  - `insufficient === true` (fewer than 10 modelled cars), or
 *  - `min_annual_cost_vnd` is null.
 *
 * For TCO/Compare a short "Updating…" skeleton appears after 1.5s of loading
 * (per plan §D.4 — never show "₫0" or "₫—" placeholders). Landing hides while
 * loading because the stats bar already owns its own skeleton.
 */
export default function SocialProofLine({
  localeKey = 'landing',
  skeleton = false,
  carId,
  onRoad,
  tco,
}: {
  localeKey?: LocaleKey
  skeleton?: boolean
  carId?: string
  onRoad?: number
  tco?: number
}) {
  const { t } = useI18n()
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [dotCount, setDotCount] = useState(1)
  const prefersReduced = useReducedMotion()

  const { data, isError, isLoading } = useQuery<OwnershipStats>({
    queryKey: ['stats-ownership', carId],
    queryFn: () => statsApi.getOwnership(carId),
    staleTime: 30 * 60_000,
    retry: 1,
  })

  useEffect(() => {
    if (!isLoading) {
      setShowSkeleton(false)
      return
    }
    const id = setTimeout(() => {
      if (skeleton) setShowSkeleton(true)
    }, STAT_SKELETON_DELAY_MS)
    return () => clearTimeout(id)
  }, [isLoading, skeleton])

  useEffect(() => {
    if (!(isLoading && skeleton && showSkeleton)) return
    if (prefersReduced) {
      setDotCount(3)
      return
    }
    const id = setInterval(() => {
      setDotCount((d) => (d >= 3 ? 1 : d + 1))
    }, 500)
    return () => clearInterval(id)
  }, [isLoading, skeleton, showSkeleton, prefersReduced])

  if (isError) return <p className="text-sm text-[var(--text-muted)] mt-3">{t('common.socialProofFallback')}</p>
  if (!data) {
    if (isLoading && skeleton && showSkeleton) {
      const base = t('common.statsLoading').replace(/[。．\.…]+$/u, '')
      return (
        <p className="text-xs text-[var(--text-muted)] italic">{base}{'.'.repeat(dotCount)}</p>
      ) as unknown as ReactNode
    }
    return null
  }
  if (data.insufficient || data.min_annual_cost_vnd == null)
    return <p className="text-sm text-[var(--text-muted)] mt-3">{t('common.socialProofFallback')}</p>

  const fmt = (v: number) =>
    new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(v)

  const min = fmt(data.min_annual_cost_vnd)
  const max = fmt(data.max_annual_cost_vnd!)

  const tcoPctOfOnRoad =
    onRoad && tco && onRoad > 0 ? Math.round((tco / onRoad) * 100) : null

  let text: string
  if (carId && data.user_percentile != null && tcoPctOfOnRoad != null) {
    text = t(`${localeKey}.socialProofWithTco`, {
      tcoPct: String(tcoPctOfOnRoad),
      min,
      max,
      pct: String(data.user_percentile),
      n: String(data.sample_size),
    })
  } else if (carId && data.user_percentile != null) {
    text = t(`${localeKey}.socialProofWithRank`, {
      min,
      max,
      pct: String(data.user_percentile),
      n: String(data.sample_size),
    })
  } else {
    text = t(`${localeKey}.socialProofRange`, {
      min,
      max,
      n: String(data.sample_size),
    })
  }

  return <p className="text-sm text-[var(--text-secondary)] mt-3">{text}</p>
}
