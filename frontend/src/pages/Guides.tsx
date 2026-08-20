import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useSeoMetaSafe, JsonLd, useLocalePath } from '../lib/seo'
import { useI18n } from '../lib/i18n'
import GlassCard from '../components/ui/GlassCard'
import { GUIDES, guideI18nKey } from '../lib/guides'

export default function Guides() {
  const { t, locale } = useI18n()
  const prefersReduced = useReducedMotion()

  useSeoMetaSafe({ title: t('page.guides'), description: t('page.guidesDescription') })

  return (
    <div className="space-y-12 max-w-5xl mx-auto">
      {/* C5 — Guides content hub: index of uniquely-routed articles */}
      <header className="space-y-3">
        <motion.h1
          className="text-4xl md:text-5xl font-heading font-bold text-[var(--text-primary)]"
          initial={prefersReduced ? false : { opacity: 0, y: 16 }}
          animate={prefersReduced ? false : { opacity: 1, y: 0 }}
        >
          {t('page.guides')}
        </motion.h1>
        <motion.p
          className="text-lg text-[var(--text-secondary)] max-w-2xl"
          initial={prefersReduced ? false : { opacity: 0, y: 16 }}
          animate={prefersReduced ? false : { opacity: 1, y: 0 }}
          transition={prefersReduced ? { duration: 0 } : { delay: 0.05, ease: 'backOut' }}
        >
          {t('page.guidesDescription')}
        </motion.p>
      </header>

      {/* Article index — each links to its own prerendered page */}
      <nav aria-label="Guides" className="grid sm:grid-cols-2 gap-4">
        {GUIDES.map((g, idx) => {
          const titleKey = guideI18nKey(g.slug, 'title')
          const excerptKey = guideI18nKey(g.slug, 'body0')
          return (
            <motion.div
              key={g.slug}
              initial={prefersReduced ? false : { opacity: 0, y: 12 }}
              animate={prefersReduced ? false : { opacity: 1, y: 0 }}
              transition={prefersReduced ? { duration: 0 } : { delay: idx * 0.04, ease: 'backOut' }}
            >
              <Link
                to={useLocalePath(`/guides/${g.slug}`)}
                className="block group h-full"
              >
                <GlassCard className="p-5 h-full flex flex-col gap-3 hover:border-accent/40 transition-colors">
                  <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                    {t(titleKey)}
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-3">
                    {t(excerptKey)}
                  </p>
                  <span className="mt-auto text-sm font-medium text-[var(--accent)]">
                    {t(guideI18nKey(g.slug, 'cta'))} →
                  </span>
                </GlassCard>
              </Link>
            </motion.div>
          )
        })}
      </nav>

      {/* FAQs (C2) */}
      <section className="space-y-3">
        <h2 className="text-2xl font-heading font-semibold text-[var(--text-primary)]">{t('landing.faqTitle')}</h2>
        <div className="space-y-3">
          {[7, 8, 9, 10].map((n) => (
            <details key={n} className="bg-[var(--glass-bg)]/60 border border-[var(--border-subtle)] rounded-lg p-3">
              <summary className="cursor-pointer font-medium text-[var(--text-primary)] list-none flex items-center justify-between">
                <span>{t(`landing.faqQ${n}`)}</span>
                <span className="text-[var(--text-muted)]" aria-hidden="true">▼</span>
              </summary>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{t(`landing.faqA${n}`)}</p>
            </details>
          ))}
        </div>
      </section>

      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: locale,
        mainEntity: [7, 8, 9, 10].map(n => ({
          '@type': 'Question',
          name: t(`landing.faqQ${n}`),
          acceptedAnswer: {
            '@type': 'Answer',
            text: t(`landing.faqA${n}`),
          },
        })),
      }} />
    </div>
  )
}
