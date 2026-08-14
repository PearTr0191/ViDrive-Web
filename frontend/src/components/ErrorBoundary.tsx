import { Component, type ReactNode } from 'react'
import GlassCard from './ui/GlassCard'
import AccentButton from './AccentButton'

interface Props {
  children: ReactNode
  t?: (key: string) => string
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false })
  }

  render() {
    if (this.state.hasError) {
      const t = this.props.t ?? ((key: string) => key)
      return (
        <div className="flex items-center justify-center min-h-[60vh] px-6">
          <GlassCard className="p-12 text-center max-w-md w-full border-danger/20">
            <div className="text-5xl mb-4" aria-hidden="true">!</div>
            <h2 className="text-xl font-heading font-bold text-[var(--text-primary)] mb-3">
              {t('common.somethingWentWrong')}
            </h2>
            <p className="text-[var(--text-secondary)] mb-6 text-sm">
              {t('common.errorCta')}
            </p>
            <div className="flex justify-center">
              <AccentButton size="sm" onClick={this.handleRetry}>
                {t('common.retry')}
              </AccentButton>
            </div>
          </GlassCard>
        </div>
      )
    }

    return this.props.children
  }
}