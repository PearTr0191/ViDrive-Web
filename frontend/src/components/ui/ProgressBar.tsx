import { motion } from 'framer-motion'

interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  showPercentage?: boolean
  className?: string
  ariaLabel?: string
}

export default function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = false,
  className = '',
  ariaLabel,
}: ProgressBarProps) {
  const pct = Math.min((value / max) * 100, 100)
  const isComplete = pct >= 99.5

  return (
    <div
      className={className}
      role={ariaLabel ? 'progressbar' : undefined}
      aria-label={ariaLabel}
      aria-valuenow={ariaLabel ? Math.round(pct) : undefined}
      aria-valuemin={ariaLabel ? 0 : undefined}
      aria-valuemax={ariaLabel ? 100 : undefined}
    >
      {label && (
        <div className="flex justify-between mb-1.5">
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          {showPercentage && (
            <span className="text-sm font-mono text-accent">{pct.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-elevated)' }}
      >
        <motion.div
          className="h-full rounded-full accent-gradient"
          style={{
            width: `${pct}%`,
            boxShadow: isComplete ? '0 0 12px rgba(var(--accent-rgb), 0.5)' : 'none',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
    </div>
    </div>
  )
}