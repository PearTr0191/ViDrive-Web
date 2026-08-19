import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  decimals?: number
  className?: string
  text?: string
}

export default function AnimatedCounter({
  value,
  duration = 1500,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
  text,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const prefersReduced = useReducedMotion()
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (!isInView) return

    // Reduced motion: skip the rAF count-up and show the final value.
    if (prefersReduced) {
      setDisplayValue(value)
      return
    }

    let startTime: number | null = null
    let rafId: number

    const animate = (timestamp: number) => {
      if (startTime === null) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(eased * value)

      if (progress < 1) {
        rafId = requestAnimationFrame(animate)
      } else {
        setDisplayValue(value)
      }
    }

    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [isInView, value, duration])

  // When decimals === 0, fractional values are rounded to the nearest integer
  // via Math.round(). This is intentional for stat counters (e.g., "83+ cars").
  // For precise values, pass decimals > 0 to use toFixed() instead.
  const formatValue = (val: number): string => {
    if (decimals > 0) {
      return val.toFixed(decimals)
    }
    return Math.round(val).toLocaleString('vi-VN')
  }

   return (
     <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums', minWidth: '1ch', display: 'inline-block' }}>
       {text ? text : <>{prefix}{formatValue(displayValue)}{suffix}</>}
     </span>
   )
}
