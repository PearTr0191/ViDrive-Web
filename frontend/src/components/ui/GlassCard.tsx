import { motion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

interface GlassCardProps extends HTMLMotionProps<'div'> {
  children: ReactNode
  glow?: boolean
  className?: string
}

export default function GlassCard({ children, glow = false, className = '', ...props }: GlassCardProps) {
  return (
    <motion.div
      className={`${glow ? 'glass-card-glow' : 'glass-card'} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  )
}