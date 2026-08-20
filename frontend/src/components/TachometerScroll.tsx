import { motion, useScroll, useMotionValueEvent, useMotionValue, useReducedMotion } from 'framer-motion'
import { useRef, useState, useCallback, useEffect } from 'react'
import { REDLINE_THRESHOLD } from '../lib/scrollConstants'

interface TachometerScrollProps {
  className?: string;
  /** Radius of the tachometer arc in pixels; defaults to 16.1 */
  radius?: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

const TRACK_WIDTH = 56
const THUMB_SIZE = 44
const TRACK_PADDING = 6
const CENTER = THUMB_SIZE / 2
const START_ANGLE = -135
const SWEEP = 270

// CSS transition for smooth needle/arc following during normal scroll.
// Uses a spring-like easing for the "ebb and flow" feel without JS-level
// spring lag that caused jolts on fast drag release.
const SPRING_EASING = [0.34, 1.56, 0.64, 1] as const
const TRANSITION_DURATION = 0.12

export default function TachometerScroll({ className = '', radius = 16.1 }: TachometerScrollProps) {
  const { scrollYProgress } = useScroll()
  const shouldReduceMotion = useReducedMotion()

  const initialProgress = scrollYProgress.get()
  const [progress, setProgress] = useState(initialProgress)
  const [isDragging, setIsDragging] = useState(false)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const isDraggingRef = useRef(false)
  const dragStartY = useRef(0)
  const scrollStartY = useRef(0)
  const progressRef = useRef(initialProgress)

  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 0
  const thumbY = useMotionValue(
    initialProgress * (winHeight - THUMB_SIZE - TRACK_PADDING * 2) + TRACK_PADDING
  )

  // Track scroll directly — no JS spring, so progress always matches the
  // actual scroll position. CSS transitions on rendered elements provide
  // the visual smoothing ("ebb and flow") for normal scrolling.
  useMotionValueEvent(scrollYProgress, 'change', (latest: number) => {
    if (isDraggingRef.current) return
    setProgress(latest)
    progressRef.current = latest
  const trackTravel = winHeight - THUMB_SIZE - TRACK_PADDING * 2
    thumbY.set(latest * trackTravel + TRACK_PADDING)
  })

  const needleAngle = progress * SWEEP + START_ANGLE
  const isRedline = progress > REDLINE_THRESHOLD
  const isOverLimit = progress >= 1

  const { x: needleX, y: needleY } = polarToCartesian(CENTER, CENTER, radius, needleAngle)

  const endAngle = Math.min(progress * SWEEP + START_ANGLE, START_ANGLE + SWEEP)
  const arcPath = describeArc(CENTER, CENTER, radius, START_ANGLE, endAngle)

  const trackTravel = winHeight - THUMB_SIZE - TRACK_PADDING * 2

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true
    setIsDragging(true)
    setIsMouseDown(true)
    dragStartY.current = e.clientY
    scrollStartY.current = window.scrollY
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMove = useCallback((_e: React.PointerEvent) => {
    if (!isDraggingRef.current) return
    const deltaY = _e.clientY - dragStartY.current
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
    if (scrollHeight <= 0 || trackTravel <= 0) return
    const scrollDelta = (deltaY / trackTravel) * scrollHeight
    const nextScroll = Math.max(0, Math.min(scrollHeight, scrollStartY.current + scrollDelta))
    window.scrollTo({ top: nextScroll, behavior: 'instant' })
    const newProgress = nextScroll / scrollHeight
    setProgress(newProgress)
    progressRef.current = newProgress
    thumbY.set(newProgress * trackTravel + TRACK_PADDING)
  }, [trackTravel, thumbY])

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
    setIsDragging(false)
    setIsMouseDown(false)
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
    const currentTop = window.scrollY
    const targetTop = Math.max(0, Math.min(scrollHeight, currentTop))
    const targetProgress = scrollHeight > 0 ? targetTop / scrollHeight : 0
    progressRef.current = targetProgress
    setProgress(targetProgress)
    thumbY.set(targetProgress * trackTravel + TRACK_PADDING)
    // Only smooth-scroll if clamping actually moved us
    if (Math.abs(currentTop - targetTop) > 1) {
      window.scrollTo({ top: targetTop, behavior: 'smooth' })
    }
  }, [trackTravel, thumbY])

  // Keyboard support: arrow up/down to scroll, Home/End for extremes
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
    if (scrollHeight <= 0) return
    const scrollStep = window.innerHeight / 4 // scroll by quarter screen
    const currentTop = window.scrollY
    let targetTop: number

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        targetTop = Math.min(scrollHeight, currentTop + scrollStep)
        break
      case 'ArrowUp':
        e.preventDefault()
        targetTop = Math.max(0, currentTop - scrollStep)
        break
      case 'Home':
        e.preventDefault()
        targetTop = 0
        break
      case 'End':
        e.preventDefault()
        targetTop = scrollHeight
        break
      default:
        return
    }

    window.scrollTo({ top: targetTop, behavior: 'smooth' })
    const newProgress = targetTop / scrollHeight
    setProgress(newProgress)
    progressRef.current = newProgress
    thumbY.set(newProgress * trackTravel + TRACK_PADDING)
  }, [trackTravel, thumbY])

  // Fallback: update progress on scroll events (covers cases where
  // useMotionValueEvent might miss updates, e.g. programmatic scroll).
  useEffect(() => {
    const onScroll = () => {
      if (isDraggingRef.current) return
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
      if (scrollHeight <= 0) return
      const newProgress = window.scrollY / scrollHeight
      setProgress(newProgress)
      progressRef.current = newProgress
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const thumbTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: TRANSITION_DURATION, ease: SPRING_EASING }

  return (
    <div
      className={`fixed top-0 right-0 z-[100] h-screen ${className}`}
      style={{ width: TRACK_WIDTH }}
    >
      {/* Vertical track rail */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          top: TRACK_PADDING,
          bottom: TRACK_PADDING,
          width: 2,
          backgroundColor: 'var(--tachometer-track-color)',
          opacity: 'var(--tachometer-track-opacity)',
        }}
      />

      {/* Circular thumb housing — focusable for keyboard users */}
      <motion.div
        className="absolute top-0 flex items-center justify-center"
        style={{
          left: (TRACK_WIDTH - THUMB_SIZE) / 2,
          y: thumbY,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          touchAction: 'none',
        }}
        transition={thumbTransition}
        animate={
          isOverLimit && !shouldReduceMotion
            ? {
                x: [0, -2, 2, -2, 2, -1, 1, -1, 1, 0],
              }
            : {}
        }
        whileTap={{ scale: 0.95 }}
        tabIndex={0}
        role="scrollbar"
        aria-label="Page scroll position"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(progress * 100)}% scrolled`}
        onKeyDown={handleKeyDown}
      >
        <div
          className="relative w-full h-full rounded-full border flex items-center justify-center"
          style={{
            backgroundColor: 'var(--tachometer-thumb-bg)',
            borderColor: isMouseDown
              ? 'var(--accent)'
              : 'var(--tachometer-thumb-border)',
            boxShadow: isMouseDown
              ? '0 0 0 3px var(--accent-glow)'
              : '0 4px 12px rgba(0,0,0,0.3)',
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <svg
            width={THUMB_SIZE}
            height={THUMB_SIZE}
            viewBox={`0 0 ${CENTER * 2} ${CENTER * 2}`}
            className="overflow-visible"
          >
            {/* Inner dark track */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={radius + 4}
              fill="var(--tachometer-thumb-bg)"
              stroke="var(--tachometer-thumb-border)"
              strokeWidth="1"
            />

            {/* Gray track arc */}
            <path
              d={describeArc(CENTER, CENTER, radius, START_ANGLE, START_ANGLE + SWEEP)}
              fill="none"
              stroke="var(--tachometer-track-color)"
              strokeWidth="3"
              strokeLinecap="round"
              style={{ opacity: 'var(--tachometer-track-opacity)' }}
            />

            {/* Active arc */}
            <motion.path
              d={arcPath}
              fill="none"
              stroke={isRedline ? 'var(--tachometer-redline)' : 'var(--tachometer-active)'}
              strokeWidth="3"
              strokeLinecap="round"
              style={{
                filter: isRedline
                  ? 'drop-shadow(0 0 6px var(--tachometer-redline-glow))'
                  : 'drop-shadow(0 0 6px var(--tachometer-active-glow))',
              }}
              transition={shouldReduceMotion ? { duration: 0 } : undefined}
            />

            {/* Needle */}
            <motion.line
              x1={CENTER}
              y1={CENTER}
              x2={needleX}
              y2={needleY}
              stroke={isRedline ? 'var(--tachometer-redline)' : 'var(--tachometer-active)'}
              strokeWidth="2"
              strokeLinecap="round"
              animate={
                isOverLimit && !shouldReduceMotion
                  ? {
                    rotate: [0, -5, 3, -3, 2, -1, 1, 0],
                  }
                  : {}
              }
              transition={
                isOverLimit && !shouldReduceMotion
                  ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }
                  : {}
              }
              style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
            />

            {/* Center dot */}
            <circle cx={CENTER} cy={CENTER} r="3" fill="var(--tachometer-active)" />
          </svg>
        </div>
      </motion.div>
    </div>
  )
}
