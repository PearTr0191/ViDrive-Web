import { useParams, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useI18n } from '../lib/i18n'
import { useSeoMetaSafe, JsonLd, SITE_URL } from '../lib/seo'
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
  if (!guideSlug) return null

  const g = getGuide(guideSlug)
  const titleKey = guideI18nKey(guideSlug, 'title')
  const body0Key = guideI18nKey(guideSlug, 'body0')
  const body1Key = guideI18nKey(guideSlug, 'body1')
  const body2Key = guideI18nKey(guideSlug, 'body2')
  const ctaKey = guideI18nKey(guideSlug, 'cta')

  const title = t(titleKey)
  const description = t(body0Key)
  const canonicalUrl = `${SITE_URL}/guides/${guideSlug}`

  useSeoMetaSafe({
    title: `${title} — ViDrive`,
    description,
    canonical: `/guides/${guideSlug}`,
    ogType: 'article',
  })

  const sources = guideSources(guideSlug, t)

  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      {/* C3 — BreadcrumbList + Article JSON-LD with citation array */}
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('nav.home'), item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: t('nav.guides'), item: `${SITE_URL}/guides` },
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
          <Link to="/guides" className="hover:text-[var(--accent)] transition-colors">{t('nav.guides')}</Link>
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
        <Link to={g.ctaRoute} className="inline-block">
          <GlassCard className="px-6 py-4 hover:border-accent/40 transition-colors">
            <span className="font-medium text-accent">{t(ctaKey)} →</span>
          </GlassCard>
        </Link>
      </motion.div>
    </div>
  )
}
