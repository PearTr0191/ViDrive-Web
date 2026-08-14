
interface PatternProps {
  className?: string
  opacity?: number
}

interface StripeProps extends PatternProps {
  angle?: number
}

interface IconProps extends PatternProps {
  size?: number
}

interface GaugeProps extends PatternProps {
  value: number
  max: number
  label?: string
  size?: number
}

// GrillePattern - horizontal bar pattern like a car grille
export function GrillePattern({ className = '', opacity = 0.1 }: PatternProps) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        opacity,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 8px, var(--accent) 8px, var(--accent) 10px)',
        maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
      }}
    />
  )
}

// TireTread - repeating horizontal lines pattern
export function TireTread({ className = '', repeat = 'repeat-x' }: PatternProps & { repeat?: 'repeat-x' | 'repeat-y' }) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        opacity: 0.15,
        backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 20px, var(--accent) 20px, var(--accent) 22px)`,
        backgroundRepeat: repeat,
      }}
    />
  )
}

// RacingStripe - diagonal racing stripe accent
export function RacingStripe({ className = '', angle = -45 }: StripeProps) {
  return (
    <div
      className={`absolute pointer-events-none ${className}`}
      style={{
        width: '100px',
        height: '200%',
        background: 'linear-gradient(180deg, var(--accent), transparent)',
        transform: `rotate(${angle}deg)`,
        opacity: 0.1,
        filter: 'blur(1px)',
      }}
    />
  )
}

// CheckeredFlag - checkered flag SVG for "winner" indicators
export function CheckeredFlag({ className = '', size = 24 }: IconProps) {
  const squares = Array.from({ length: 16 }, (_, i) => {
    const row = Math.floor(i / 4)
    const col = i % 4
    const isBlack = (row + col) % 2 === 0
    return isBlack
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={{ display: 'inline-block' }}
    >
      {squares.map((isBlack, i) => {
        const row = Math.floor(i / 4)
        const col = i % 4
        return (
          <rect
            key={i}
            x={col * 6}
            y={row * 6}
            width="6"
            height="6"
            fill={isBlack ? 'var(--accent)' : 'transparent'}
            stroke="var(--accent)"
            strokeWidth="0.5"
          />
        )
      })}
    </svg>
  )
}

// DashboardGauge - circular gauge showing value as speedometer
export function DashboardGauge({ value, max, label, size = 120 }: GaugeProps) {
  const percentage = Math.min(Math.max(value / max, 0), 1)
  const angle = percentage * 180 - 90 // -90 to 90 degrees
  const radius = 45
  const center = size / 2

  const x = center + radius * Math.cos((angle * Math.PI) / 180)
  const y = center + radius * Math.sin((angle * Math.PI) / 180)

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${x} ${y}`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 6px var(--accent-glow))' }}
        />
        {/* Needle */}
        <line
          x1={center}
          y1={center}
          x2={x}
          y2={y}
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={center} cy={center} r="4" fill="var(--accent)" />
      </svg>
      {label && (
        <span className="absolute -bottom-6 text-xs font-mono text-secondary" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      )}
    </div>
  )
}

// Pre-generate speed line data at module scope (avoids calling Math.random during render)
const speedLineData = Array.from({ length: 20 }, () => ({
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  height: `${20 + Math.random() * 60}px`,
  rotation: `${-15 + Math.random() * 30}deg`,
}))

// SpeedLines - subtle speed-line pattern
export function SpeedLines({ className = '' }: PatternProps) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      style={{ opacity: 0.1 }}
    >
      {speedLineData.map((line, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: line.left,
            top: line.top,
            width: '1px',
            height: line.height,
            background: `linear-gradient(to bottom, transparent, var(--accent), transparent)`,
            transform: `rotate(${line.rotation})`,
          }}
        />
      ))}
    </div>
  )
}
