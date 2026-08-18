import { useScroll, useMotionValueEvent, motion, useTransform } from 'framer-motion'
import { useState } from 'react'

/**
 * VerticalScrollbar — compact fill bar for mobile scroll indication.
 *
 * Replaces the desktop TachometerScroll on viewports ≤ 1023px.
 *
 * Rev-counter behavior (race-car steering wheel indicator), applied
 * entirely to the fill — there is no separate track rail:
 *
 *   fill height < 77 % of bar  → solid accent green
 *   77 % ≤ fill < 82 %         → gradient: the BOTTOM 5 % of the bar
 *                                (the "seamless green-red transition")
 *                                appears at the bottom of the fill
 *   82 % ≤ fill < 97 %         → fill is mostly red: green shrinks,
 *                                gradient stays at the same 5 % band,
 *                                red zone (last 18 % of bar) grows
 *                                upward inside the fill
 *   fill ≥ 97 % (CRITICAL)     → the ENTIRE fill SNAPS to solid red
 *                                (race-car "shift now" — hard switch,
 *                                 no smooth transition)
 *
 * The gradient stops are computed dynamically as percentages of the
 * fill's own height so the 7 % transition band always lines up with
 * 83 %–90 % of the full bar, not 83 %–90 % of whatever the fill
 * currently is.
 *
 * Zero-latency: height and background are MotionValues bound directly
 * to scrollYProgress via motion.div + useTransform. Framer-motion
 * updates the DOM in its optimized pipeline — no React state / re-render
 * cycle sits between scroll position and the visible bar.
 */

// Zone boundaries (as fractions of full bar height).
const GREEN_END = 0.77      // fill below this → solid green
const REDLINE_START = 0.82  // fill at/above this → red zone visible
const CRITICAL = 0.99       // fill at/above this → ENTIRE fill snaps solid red (no transition)

// Width — shaved 25 % off the original 8/6 px bar.
const BAR_WIDTH = 6   // px — compact for mobile, matches --scrollbar-width
const FILL_WIDTH = 5  // px — inner fill bar (proportionally slightly wider for visibility at the new size)

interface VerticalScrollbarProps {
  className?: string
}

export default function VerticalScrollbar({ className = '' }: VerticalScrollbarProps) {
  const { scrollYProgress } = useScroll()

  // React state only for ARIA — screen readers don't need 60 fps updates.
  const [progress, setProgress] = useState(() => scrollYProgress.get())
  useMotionValueEvent(scrollYProgress, 'change', (latest: number) => {
    setProgress(latest)
  })

  // Zero-latency fill height.
  const fillHeight = useTransform(scrollYProgress, (v: number) => `${v * 100}%`)

  // Zero-latency fill background — the rev-counter color logic.
  // Gradient stops are computed as percentages of the fill's own height
  // so the 7 % transition band always sits at 83 %–90 % of the full bar.
  const fillBg = useTransform(scrollYProgress, (v: number) => {
    // CRITICAL: entire fill is solid red (race-car "shift now").
    if (v >= CRITICAL) return 'var(--tachometer-redline)'

    // Below the transition zone: solid green.
    if (v < GREEN_END) return 'var(--tachometer-active)'

    // Transition / redline zone: gradient with stops positioned so the
    // 5 % green→red band lines up with 77 %–82 % of the full bar.
    //
    //   greenStop (% of fill) = (0.77 / v) * 100
    //   redStop   (% of fill) = min((0.82 / v) * 100, 100)
    //
    // Example at v=0.80: greenStop=96.25, redStop=100
    //   → fill is green for 96.25 % of its height, then transitions
    //     to red in the bottom 3.75 % (which is 3 % of the full bar).
    const greenStop = (GREEN_END / v) * 100
    const redStop = Math.min((REDLINE_START / v) * 100, 100)

    return (
      `linear-gradient(to bottom, ` +
      `var(--tachometer-active) 0%, ` +
      `var(--tachometer-active) ${greenStop}%, ` +
      `var(--tachometer-redline) ${redStop}%, ` +
      `var(--tachometer-redline) 100%)`
    )
  })

  const percent = Math.round(progress * 100)

  return (
    <div
      className={`fixed top-0 right-0 z-[100] h-screen print:hidden ${className}`}
      style={{ width: BAR_WIDTH }}
      role="scrollbar"
      aria-label="Page scroll position"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percent}% scrolled`}
    >
      {/* Fill — the only visible element. Zero-latency via MotionValues. */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
        style={{
          width: FILL_WIDTH,
          height: fillHeight,
          background: fillBg,
        }}
        aria-hidden="true"
      />
   </div>
  )
}
