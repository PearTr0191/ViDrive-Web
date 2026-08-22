import { useParams, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useI18n } from '../lib/i18n'
import { useSeoMetaSafe, JsonLd, SITE_URL, useLocalePath, useCurrentLocale } from '../lib/seo'
import GlassCard from '../components/ui/GlassCard'
import {
  isValidGuideSlug,
  getGuide,
  guideI18nKey,
  guideSources,
  localeString,
} from '../lib/guides'
import type { GuideSlug } from '../lib/guides'

/** Resolve a canonical slug from the URL param, or null if invalid. */
function resolveGuideSlug(param: string | undefined): GuideSlug | null {
  return isValidGuideSlug(param) ? param : null
}

export default function GuidePage() {
  const { t, locale } = useI18n()
  const { slug } = useParams<{ slug: string }>()
  const prefersReduced = useReducedMotion()

  const guideSlug = resolveGuideSlug(slug)
  // `getGuide` and the guide i18n-key helpers require a resolved slug; compute
  // null-guarded fallbacks so `useSeoMetaSafe` runs unconditionally (rule of
  // hooks). For an invalid slug the component returns null just below, so the
  // fallback meta here is harmless.
  const g = guideSlug ? getGuide(guideSlug) : null
  const titleKey = guideSlug ? guideI18nKey(guideSlug, 'title') : 'page.guides'
  const body0Key = guideSlug ? guideI18nKey(guideSlug, 'body0') : 'page.description'
  const body1Key = guideSlug ? guideI18nKey(guideSlug, 'body1') : ''
  const body2Key = guideSlug ? guideI18nKey(guideSlug, 'body2') : ''
  const ctaKey = guideSlug ? guideI18nKey(guideSlug, 'cta') : ''

  const title = t(titleKey)
  const description = t(body0Key)
  const currentLocale = useCurrentLocale()
  const canonicalUrl = `${SITE_URL}/${currentLocale}/guides${guideSlug ? `/${guideSlug}` : ''}`

  useSeoMetaSafe({
    title: `${title} — ViDrive`,
    description,
    ogType: 'article',
  })

  if (!guideSlug || !g) return null

  const sources = guideSources(guideSlug, t)

  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      {/* C3 — BreadcrumbList + Article JSON-LD with citation array */}
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
         itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('nav.home'), item: `${SITE_URL}/${currentLocale}` },
          { '@type': 'ListItem', position: 2, name: t('nav.guides'), item: `${SITE_URL}/${currentLocale}/guides` },
          { '@type': 'ListItem', position: 3, name: title, item: canonicalUrl },
        ],
      }} />

      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: title,
        description,
        inLanguage: localeString(locale),
        author: { '@type': 'Organization', name: 'ViDrive' },
        publisher: { '@type': 'Organization', name: 'ViDrive', url: SITE_URL },
        dateModified: new Date().toISOString().split('T')[0],
        speakable: {
          '@type': 'SpeakableSpecification',
          cssSelector: ['.prose', 'h1'],
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        },
        isBasedOn: sources.map(s => ({
          '@type': 'WebSite',
          name: s.name.replace(/^methodology\.source\./, ''),
          url: s.url,
        })),
      }} />

      {/* Hero */}
      <motion.header
        className="space-y-3"
        initial={prefersReduced ? false : { opacity: 0, y: 16 }}
        animate={prefersReduced ? false : { opacity: 1, y: 0 }}
      >
        <nav aria-label="Breadcrumb" className="text-sm text-[var(--text-secondary)]">
          <Link to={useLocalePath('/guides')} className="hover:text-[var(--accent)] transition-colors">{t('nav.guides')}</Link>
          <span aria-hidden="true" className="mx-2 opacity-40">›</span>
          <span className="text-[var(--text-primary)]">{title}</span>
        </nav>
        <h1 className="text-4xl md:text-5xl font-heading font-bold text-[var(--text-primary)]">
          {title}
        </h1>
      </motion.header>

      {/* Article body */}
      <motion.article
        className="prose prose-sm sm:prose-base max-w-none text-[var(--text-primary)] prose-headings:text-[var(--text-primary)]"
        initial={prefersReduced ? false : { opacity: 0, y: 16 }}
        animate={prefersReduced ? false : { opacity: 1, y: 0 }}
        transition={prefersReduced ? { duration: 0 } : { delay: 0.1, ease: 'backOut' }}
      >
        {/* Answer-first summary — the 40–60 word direct answer for AEO/snippet. */}
        <p className="speakable text-base md:text-lg font-medium text-[var(--text-primary)] leading-relaxed border-l-4 border-accent pl-4 py-1 mb-4 bg-[rgba(var(--accent-rgb),0.04)] rounded-r-lg">
          {t(`${guideI18nKey(guideSlug, 'title').replace(/\.title$/, '.summary')}`)}
        </p>
        <p className="text-lg text-[var(--text-secondary)] leading-relaxed">{t(body0Key)}</p>
        <p className="leading-relaxed">{t(body1Key)}</p>
        <p className="leading-relaxed">{t(body2Key)}</p>
      </motion.article>

      {/* CTA */}
      <motion.div
        className="pt-2"
        initial={prefersReduced ? false : { opacity: 0, y: 10 }}
        animate={prefersReduced ? false : { opacity: 1, y: 0 }}
        transition={prefersReduced ? { duration: 0 } : { delay: 0.2, ease: 'backOut' }}
      >
        <Link to={useLocalePath(g.ctaRoute)} className="inline-block">
          <GlassCard className="px-6 py-4 hover:border-accent/40 transition-colors">
            <span className="font-medium text-accent">{t(ctaKey)} →</span>
          </GlassCard>
        </Link>
      </motion.div>

      {/* Last updated + Sources footer */}
      <motion.footer
        className="pt-6 mt-8 border-t border-[var(--border-subtle)] space-y-3"
        initial={prefersReduced ? false : { opacity: 0 }}
        animate={prefersReduced ? false : { opacity: 1 }}
        transition={prefersReduced ? { duration: 0 } : { delay: 0.3 }}
      >
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span>{t('methodology.lastUpdated')}: {new Date().toISOString().split('T')[0]}</span>
        </div>
        {sources.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('methodology.sourcesTitle')}</h3>
            <ul className="space-y-1">
              {sources.map((s) => (
                <li key={s.url} className="text-xs">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:opacity-80 transition-opacity break-all"
                  >
                    {s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </motion.footer>
    </div>
  )
}
