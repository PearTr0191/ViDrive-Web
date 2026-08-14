import { useTheme } from '../lib/theme'

interface LogoProps {
  className?: string
  height?: number
}

export default function Logo({ className = '', height = 28 }: LogoProps) {
  const { theme } = useTheme()
  return (
    <span className={`inline-flex items-center ${className}`} aria-label="ViDrive">
      <img
        src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
        alt="ViDrive"
        style={{ height }}
        className="h-auto w-auto"
      />
    </span>
  )
}
