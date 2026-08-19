import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import Logo from './Logo'

const SOCIAL_LINKS = [
  {
    key: 'github',
    label: 'GitHub',
    href: 'https://github.com/PearTr0191',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05A9.4 9.4 0 0 1 12 6.84c.85 0 1.71.12 2.51.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
      </svg>
    ),
  },
  {
    key: 'zalo',
    label: 'Zalo',
    href: 'https://zalo.me/0866828946',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.5C7.2 2.5 3.3 5.5 2.5 10c0 3.2 2.3 5.9 5.5 7.1-.1 1.3-.5 2.4-1.1 3.3.1.1.2.2.3.1 1.4-1.5 3.8-2.4 6.3-2.4 5.5 0 10-4.2 10-9.4S18.7 2.5 12 2.5z" />
        <path d="M10.5 7.5h3v1.5h-3V7.5zm0 3h3V12h-3V10.5zm0 3h3V13.5h-3V13.5z" />
      </svg>
    ),
  },
]

export default function Footer() {
  const { t } = useI18n()

  return (
    <footer
      className="border-t mt-16 relative z-10"
      style={{
        borderColor: 'var(--border-subtle)',
        backgroundColor: 'var(--glass-bg)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="space-y-4">
            <Logo height={30} />
            <p className="text-sm max-w-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('footer.tagline')}
            </p>
            <Link
              to="/tco"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-heading font-semibold accent-gradient text-[var(--bg-base)] hover:shadow-lg hover:shadow-accent/30 transition-all w-fit"
            >
              {t('landing.ctaCalculate')}
            </Link>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('footer.copyright')}
            </p>
          </div>

          {/* Explore */}
          <div className="space-y-4">
            <h3 className="text-sm font-heading font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('footer.exploreTitle')}
            </h3>
            <nav className="flex flex-col gap-2 text-sm" style={{ color: 'var(--text-secondary)' }} aria-label={t('footer.exploreTitle')}>
              <Link to="/tco" className="hover:text-accent transition-colors w-fit">{t('nav.tco')}</Link>
              <Link to="/compare" className="hover:text-accent transition-colors w-fit">{t('nav.compare')}</Link>
              <Link to="/car" className="hover:text-accent transition-colors w-fit">{t('nav.browse')}</Link>
              <Link to="/wizard" className="hover:text-accent transition-colors w-fit">{t('nav.wizard')}</Link>
              <Link to="/guides" className="hover:text-accent transition-colors w-fit">{t('nav.guides')}</Link>
              <Link to="/methodology" className="hover:text-accent transition-colors w-fit">{t('nav.methodology')}</Link>
            </nav>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h3 className="text-sm font-heading font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('footer.contactTitle')}
            </h3>
            <ul className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent)' }}>
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-10 6L2 7" />
                </svg>
                <a href="mailto:tranhoanglethanh@gmail.com" className="hover:text-accent transition-colors">
                  tranhoanglethanh@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--accent)' }}>
                  <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
                  <path d="M11 5.5h2" />
                  <path d="M12 18.5h.01" />
                </svg>
                <a href="tel:+84866828946" className="hover:text-accent transition-colors">
                  +84 866 828 946
                </a>
              </li>
            </ul>
          </div>

          {/* Social + Legal */}
          <div className="space-y-4">
            <h3 className="text-sm font-heading font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t('footer.socialTitle')}
            </h3>
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.key}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="p-2 rounded-lg border transition-colors hover:text-accent"
                  style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                >
                  {s.icon}
                </a>
              ))}
            </div>
            <nav className="flex flex-col gap-2 text-sm" style={{ color: 'var(--text-secondary)' }} aria-label={t('footer.legalTitle')}>
              <Link to="/terms" className="hover:text-accent transition-colors w-fit">
                {t('footer.terms')}
              </Link>
              <Link to="/privacy" className="hover:text-accent transition-colors w-fit">
                {t('footer.privacy')}
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  )
}
