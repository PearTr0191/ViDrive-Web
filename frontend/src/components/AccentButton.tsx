import { motion, type HTMLMotionProps } from 'framer-motion'
import { useState, useCallback } from 'react'

interface AccentButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: React.ReactNode
  variant?: 'primary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

interface Ripple {
  id: number
  x: number
  y: number
}

export default function AccentButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  onClick,
  disabled,
  ...props
}: AccentButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([])

  const sizeStyles = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  }
  const base = `rounded-xl font-heading font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-accent/50 relative overflow-hidden cursor-pointer ${sizeStyles[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
  const styles =
    variant === 'primary'
      ? 'accent-gradient text-[var(--bg-base)] hover:shadow-lg hover:shadow-accent/30'
      : 'border border-accent/40 text-accent hover:bg-accent/10 hover:border-accent'

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const id = Date.now()
    const ripple: Ripple = { id, x: e.clientX - rect.left, y: e.clientY - rect.top }
    setRipples((prev) => [...prev, ripple])
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600)
    onClick?.(e)
  }, [onClick, disabled])

  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      disabled={disabled}
      className={`${base} ${styles} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {variant === 'primary' && (
        <span className="absolute inset-0 metallic-shine pointer-events-none" />
      )}
      {ripples.map((ripple) => (
        <motion.span
          key={ripple.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: ripple.x,
            top: ripple.y,
            backgroundColor: variant === 'primary' ? 'rgba(10, 10, 15, 0.3)' : 'rgba(var(--accent-rgb), 0.3)',
          }}
          initial={{ width: 0, height: 0, x: 0, y: 0, opacity: 0.6 }}
          animate={{ width: 300, height: 300, x: -150, y: -150, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}
      <span className="relative z-10">{children}</span>
    </motion.button>
  )
}