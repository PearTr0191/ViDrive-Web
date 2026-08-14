import { forwardRef } from 'react'
import type { ElementType, ReactNode } from 'react'

interface AccentTextProps {
  children: ReactNode
  glow?: boolean
  className?: string
  as?: ElementType
}

const AccentText = forwardRef<HTMLElement, AccentTextProps>(
  ({ children, glow = false, className = '', as: Component = 'span' }, ref) => {
    const glowStyle = glow
      ? {
          textShadow: '0 0 10px var(--accent-glow), 0 0 20px var(--accent-glow)',
        }
      : {}

    return (
      <Component
        ref={ref}
        className={`text-accent ${className}`}
        style={glowStyle}
      >
        {children}
      </Component>
    )
  }
)

AccentText.displayName = 'AccentText'

export default AccentText