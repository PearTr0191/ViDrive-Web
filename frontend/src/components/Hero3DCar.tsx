import { motion, useScroll, useTransform, useMotionValue, useSpring, animate } from 'framer-motion'
import { useEffect, useRef } from 'react'

// Pseudo-3D layered car showcase for the Landing hero.
// Layers (back → front): ground shadow, body, glass/roof, wheels, lights.
// Scroll drives a forward-tilt + parallax of the body; wheels spin idly
// and accelerate briefly when the user scrolls. Respects prefers-reduced-motion
// by rendering a single static frame.

interface Hero3DCarProps {
  className?: string
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useReducedMotionFlag() {
  const ref = useRef(false)
  useEffect(() => {
    ref.current = prefersReducedMotion()
  }, [])
  return ref
}

export default function Hero3DCar({ className = '' }: Hero3DCarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotionFlag()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })

  // Body scrolls down slower than wheels → depth. Tilt forward as it leaves.
  const bodyY = useTransform(scrollYProgress, [0, 1], [0, 40])
  const bodyTilt = useTransform(scrollYProgress, [0, 1], [0, -6])
  const bodyScale = useTransform(scrollYProgress, [0, 1], [1, 1.08])
  const glassY = useTransform(scrollYProgress, [0, 1], [0, 18]) // glass closer to camera → moves more
  const shadowOpacity = useTransform(scrollYProgress, [0, 1], [0.28, 0.12])
  const shadowScale = useTransform(scrollYProgress, [0, 1], [1, 1.15])

  // Idle wheel spin driven by a continuously animating motion value.
  const spin = useMotionValue(0)
  const spinSpring = useSpring(spin, { stiffness: 60, damping: 18, mass: 0.6 })
  const wheelRotation = useTransform(spinSpring, (v) => `${v}deg`)

  useEffect(() => {
    if (reduced.current) return
    // Baseline idle rotation: ~6 deg/sec ≈ one revolution every 60s.
    const controls = animate(spin, 100000, {
      type: 'linear',
      duration: 3600, // effectively continuous
      repeat: Infinity,
      ease: 'linear',
    })
    return () => controls.stop()
  }, [spin, reduced])

  return (
    <div ref={ref} className={`relative w-full max-w-5xl mx-auto ${className}`} aria-hidden="true">
      {/* Ground shadow ellipse (deepest layer) */}
      <motion.div
        className="mx-auto rounded-[50%]"
        style={{
          width: '70%',
          height: '40px',
          background: 'radial-gradient(ellipse at center, rgba(var(--accent-rgb), 0.35), transparent 70%)',
          opacity: shadowOpacity,
          scale: shadowScale,
          filter: 'blur(8px)',
          marginTop: '230px',
        }}
      />

      {/* Layered SVG stack. Each layer is separately transformed for parallax.
          Layers closer to viewer (glass, wheels) move/swing slightly more. */}
      <div className="relative" style={{ marginTop: '-210px' }}>
        {/* Wheels — front layer; spin */}
        <motion.svg
          viewBox="0 0 800 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full"
          style={{ rotate: wheelRotation, transformOrigin: '375px 240px', opacity: 0.85 }}
        >
          <Wheel cx={225} cy={240} />
          <Wheel cx={655} cy={240} />
        </motion.svg>

        {/* Glass / greenhouse — second-from-front; slight extra parallax */}
        <motion.svg
          viewBox="0 0 800 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full"
          style={{ y: glassY }}
        >
          <path
            d="M 300 161 L 360 140 L 480 130 L 575 130 L 640 148 L 690 162 L 665 180 L 320 180 Z"
            fill="var(--accent)"
            opacity={0.16}
          />
          {/* subtle reflection streak */}
          <path
            d="M 330 150 L 470 134 L 560 134"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeOpacity="0.5"
            fill="none"
          />
        </motion.svg>

        {/* Body — mid layer; tilt + scale on scroll */}
        <motion.svg
          viewBox="0 0 800 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full"
          style={{ y: bodyY, rotate: bodyTilt, scale: bodyScale, transformOrigin: '375px 240px' }}
        >
          <path
            d="M 150 220 L 180 220 L 205 178 L 290 158 L 360 138 L 470 128 L 560 128 L 625 145 L 685 162 L 720 184 L 740 205 L 750 220 L 762 220 L 762 240 L 738 240 L 728 226 L 708 226 L 698 240 L 202 240 L 192 226 L 172 226 L 162 240 L 140 240 Z"
            fill="var(--accent)"
            opacity={0.14}
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeOpacity="0.4"
          />
          <line x1="430" y1="140" x2="430" y2="222" stroke="var(--accent)" strokeWidth="1.5" opacity="0.08" />
          <line x1="565" y1="138" x2="565" y2="222" stroke="var(--accent)" strokeWidth="1.5" opacity="0.08" />
          <ellipse cx="755" cy="202" rx="9" ry="5" fill="var(--accent)" opacity="0.32" />
          <rect x="148" y="196" width="6" height="15" rx="2" fill="var(--accent)" opacity="0.32" />
        </motion.svg>
      </div>
    </div>
  )
}

function Wheel({ cx, cy }: { cx: number; cy: number }) {
  // 5-spoke wheel; rotation handled by the parent motion.svg group.
  return (
    <g>
      <circle cx={cx} cy={cy} r="32" stroke="var(--accent)" strokeWidth="4" fill="none" opacity="0.9" />
      <circle cx={cx} cy={cy} r="18" stroke="var(--accent)" strokeWidth="2" fill="none" opacity="0.8" />
      <circle cx={cx} cy={cy} r="7" fill="var(--accent)" opacity="0.9" />
      {[0, 72, 144, 216, 288].map((a) => {
        const rad = (a * Math.PI) / 180
        return (
          <line
            key={a}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(rad) * 15}
            y2={cy + Math.sin(rad) * 15}
            stroke="var(--accent)"
            strokeWidth="1.5"
            opacity="0.7"
          />
        )
      })}
    </g>
  )
}
