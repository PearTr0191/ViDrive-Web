/**
 * CostBars — single overlay bar: on-road price is the full track, 5-year TCO
 * is an inner bar scaled as a percentage of on-road. No delta headline.
 *
 * Shared component used by TcoCalculator result card and CarDetail TCO preview.
 * Reduced-motion safe. a11y: role/img + aria-label summarises both values.
 */
import { motion, useReducedMotion } from 'framer-motion'
import { formatVND } from '../lib/api'

interface CostBarsProps {
  onRoad: number
  tco: number
  /** i18n keys for labels. */
  labels?: {
    onRoad?: string
    fiveYearTco?: string
    deltaLabel?: string
  }
  /** Optional className on the wrapper. */
  className?: string
}

export default function CostBars({ onRoad, tco, labels, className = '' }: CostBarsProps) {
  const prefersReduced = useReducedMotion()
  const base = Math.max(onRoad, 1)
  const tcoPct = Math.round((tco / base) * 100)

  const a11yLabel = [
    `${labels?.onRoad ?? 'On-road price'}: ${formatVND(onRoad)}.`,
    `${labels?.fiveYearTco ?? '5-year TCO'}: ${formatVND(tco)} (${tcoPct}% of on-road).`,
  ].join(' ')

  return (
    <div
      role="img"
      aria-label={a11yLabel}
      className={`space-y-2 ${className}`}
    >
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm text-[var(--text-secondary)]">{labels?.onRoad ?? 'On-road price'}</span>
        <span className="text-sm font-mono text-[var(--text-primary)]">{tcoPct}%</span>
      </div>
      <div
        className="relative h-4 rounded-full overflow-hidden border border-[var(--border-default)]"
        style={{ backgroundColor: 'rgba(var(--bg-base-rgb), 0.55)' }}
        aria-hidden="true"
      >
        <motion.div
          initial={prefersReduced ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 origin-left rounded-full"
          style={{ width: '100%', background: 'rgba(var(--accent-rgb), 0.22)' }}
        />
        <motion.div
          initial={prefersReduced ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: prefersReduced ? 0 : 0.15 }}
          className="absolute inset-y-0 left-0 origin-left rounded-full"
          style={{
            width: `${tcoPct}%`,
            background: 'linear-gradient(90deg, var(--accent), var(--accent-cold))',
          }}
        />
      </div>
    </div>
  )
}
