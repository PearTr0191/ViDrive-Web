import { useState, useMemo } from 'react'
import NeonWireframeCar from './NeonWireframeCar'
import { mapSegment } from './segmentUtils'
import { carDisplayName } from '../lib/seo'


export interface CarMediaProps {
  carId: string
  type?: string
  segment?: string
  className?: string
  /** Aspect ratio override. Default "16/9". */
  aspect?: string
  /** Render eagerly (above-the-fold). Default lazy. */
  priority?: boolean
  /** Optional onClick wrapper */
  onClick?: () => void
  /** Disable hover lift (for table cells that already hover). */
  disableHover?: boolean
  /** Current theme for fallback styling. */
  theme?: 'dark' | 'light'
  /** Optional car data for alt text (brand + model). */
  car?: { brand?: string; model?: string; id?: string }
}

// Resolve the static asset URL for a car image. Vite serves /public as root,
// and `import.meta.env.BASE_URL` keeps it correct under subpath deploys.
function carImageUrl(carId: string): string {
  return `${import.meta.env.BASE_URL}cars/${encodeURIComponent(carId)}.webp`
}

export default function CarMedia({
  carId,
  type,
  segment,
  className = '',
  aspect,
  priority = false,
  onClick,
  disableHover = false,
  theme = 'dark',
  car,
}: CarMediaProps) {
  const [failed, setFailed] = useState(false)
  const url = useMemo(() => carImageUrl(carId), [carId])
  const segKey = mapSegment(type, segment)
  const altText = `${carDisplayName(car ?? { id: carId })} right-side profile`

  const baseStyle: React.CSSProperties = aspect ? { aspectRatio: aspect } : {}

  if (failed) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] ${onClick ? 'cursor-pointer' : ''} ${className}`}
        style={baseStyle}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <NeonWireframeCar
          type={type}
          segment={segment}
          theme={theme}
          className="w-full h-full"
        />
        <span className="absolute bottom-2 right-3 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] pointer-events-none">
          {segKey}
        </span>
      </div>
    )
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[rgba(var(--bg-base-rgb),0.25)] ${onClick ? 'cursor-pointer' : ''} ${disableHover ? '' : 'group'} ${className}`}
      style={baseStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <img
        src={url}
        alt={altText}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'low'}
        decoding="async"
        onError={() => setFailed(true)}
        className={`absolute inset-0 h-full w-full object-contain p-2 transition-transform duration-200 ${disableHover ? '' : 'group-hover:scale-105'}`}
      />
      {/* Accent glow ring on hover (kept subtle so textual content dominates) */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--accent-rgb), 0.5), 0 0 24px rgba(var(--accent-rgb), 0.15)' }}
      />
    </div>
  )
}
