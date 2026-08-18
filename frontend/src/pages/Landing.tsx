import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import AccentButton from '../components/AccentButton'
import GlassCard from '../components/ui/GlassCard'
import AnimatedCounter from '../components/ui/AnimatedCounter'
import Skeleton from '../components/ui/Skeleton'
import { GridPattern } from '../components/AutomotivePatterns'
import { api, formatVND } from '../lib'
import { useI18n } from '../lib/i18n'
import { useTheme } from '../lib/theme'
import { useSeoMetaSafe, JsonLd, SITE_URL } from '../lib/seo'
import { useQuery } from '@tanstack/react-query'
import SocialProofLine from '../components/SocialProofLine'

export default function Landing() {
  const { t, locale } = useI18n()
  const { theme } = useTheme()
  useSeoMetaSafe({ title: t('page.title'), description: t('landing.heroSubtitle') })
  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const heroY = useTransform(heroScroll, [0, 1], [0, 40])
  const heroOpacity = useTransform(heroScroll, [0, 1], [1, 0.3])
  const heroScale = useTransform(heroScroll, [0, 1], [1, 0.98])

  // NOTE: the hero <img> blends against the *page* backdrop via `mix-blend-mode`.
  // An ancestor with an animated `opacity` (the old container fade) promoted that
  // ancestor to its own compositing layer, so the blended image composited against an
  // EMPTY/transparent buffer instead of the page — `multiply` then rendered invisible
  // (light theme "fades away"); `screen` stayed visible (dark was perfect). The container
  // is now a plain <div> (no opacity/will-change) so the blend reaches the real backdrop.

  const { data: config, isLoading: isConfigLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    retry: 1,
  })

  const { data: cars, isError: isCarsError, isLoading: isCarsLoading, refetch: refetchCars } = useQuery({
    queryKey: ['cars'],
    queryFn: () => api.getCars(),
    retry: 1,
  })

  const stats = [
    { value: cars?.length || 0, suffix: '+', labelKey: 'landing.statCars' },
    { value: config?.supported_cities || 0, suffix: '', labelKey: 'landing.statCities' },
    { value: 25, suffix: '+', labelKey: 'landing.statML' },
    { value: 5, suffix: 'Y', labelKey: 'landing.statRange', text: '1-20' },
  ]

  const steps = [
    { num: 1, titleKey: 'landing.step1Title', descKey: 'landing.step1Desc', icon: 'search', count: cars?.length || 0 },
    { num: 2, titleKey: 'landing.step2Title', descKey: 'landing.step2Desc', icon: 'calculate' },
    { num: 3, titleKey: 'landing.step3Title', descKey: 'landing.step3Desc', icon: 'compare' },
  ]

  const stepIcons: Record<string, React.ReactElement> = {
    search: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    calculate: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="8" y1="10" x2="10" y2="10" /><line x1="12" y1="10" x2="14" y2="10" /><line x1="8" y1="14" x2="10" y2="14" /><line x1="12" y1="14" x2="14" y2="14" /><line x1="8" y1="18" x2="14" y2="18" />
      </svg>
    ),
    compare: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3l4 4-4 4" /><path d="M20 7H4" /><path d="M8 21l-4-4 4-4" /><path d="M4 17h16" />
      </svg>
    ),
  }

  return (
    <div className="space-y-20">
      {/* FAQPage + SoftwareApplication structured data */}
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: locale,
        mainEntity: [1, 2, 3, 4, 5, 6].map(n => ({
          '@type': 'Question',
          name: t(`landing.faqQ${n}`),
          acceptedAnswer: {
            '@type': 'Answer',
            text: t(`landing.faqA${n}`),
          },
        })),
      }} />
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'ViDrive',
        url: SITE_URL,
        applicationCategory: 'AutomotiveApplication',
        operatingSystem: 'Web browser',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'VND',
        },
        inLanguage: locale,
        }} />
      {/* Hero Section */}
      <section ref={heroRef} className="relative min-h-[82vh] flex flex-col items-center justify-center text-center overflow-hidden py-16">
        {/* Lucid Air back-layer — theme-adaptive.
            Light: dark line art on white via `multiply` — STATIC (appears instantly, no animation).
            Dark: glowing teal on near-black via `screen` — FADES IN (headlights turning on) on load
            and whenever the theme switches to dark.
            Both sit at -z-20 behind the grid (-z-10) and content (z-10). Light is the positional reference;
            the dark image gets a small extra downward nudge to match it.
            CRITICAL: this wrapper stays a plain <div> with an OPAQUE `var(--bg-base)` background and NO
            animated `opacity`/`will-change`/`transform`. An ancestor with animated opacity becomes its own
            compositing layer, so the <img>'s `mix-blend-mode` composites against that layer's EMPTY/transparent
            buffer instead of the page: `multiply` (light) then renders invisible — the old "fades away on hard
            refresh" bug — while `screen` (dark) stays visible. The opaque wrapper bg keeps the blend correct.
            The dark fade animates the <img>'s OWN opacity (a leaf node), which is blend-safe; only an
            *ancestor* animated opacity caused the bug. */}
        <div
          className="absolute inset-0 -z-20 pointer-events-none"
          aria-hidden="true"
          style={{ backgroundColor: 'var(--bg-base)' }}
        >
          {/* Light — static (no fade) */}
          <img
            src="/hero/lucid-light.jpg"
            alt=""
            loading="eager"
            decoding="async"
            className="absolute inset-x-0 top-0 h-[75vh] w-full object-contain scale-x-[1.35] scale-y-[1.2] origin-bottom translate-y-[8%]"
            style={{
              opacity: theme === 'light' ? 0.12 : 0,
              mixBlendMode: 'multiply',
            }}
          />
          {/* Dark — fades in (headlights turning on) */}
          <motion.img
            src="/hero/lucid-dark.jpg"
            alt=""
            loading="eager"
            decoding="async"
            className="absolute inset-x-0 top-0 h-[75vh] w-full object-contain scale-x-[1.35] scale-y-[1.2] origin-bottom translate-y-[9%]"
            style={{
              mixBlendMode: 'screen',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: theme === 'dark' ? 0.2 : 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
          {/* Soft radial vignette to fade edges into the page bg */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 40%, var(--bg-base) 94%)',
            }}
          />
        </div>

        {/* Parallax background elements */}
                <motion.div
          className="absolute inset-0 -z-10"
          style={{ y: heroY, opacity: heroOpacity, scale: heroScale }}
        >
          {/* Subtle engineering grid behind the hero */}
                    <GridPattern opacity={0.06} />
        </motion.div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 flex flex-col items-center">
          {/* J — what's-new badge */}
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border border-accent/30 text-accent bg-accent/10">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
              {t('landing.whatsNew').replace('{date}', '2026-08')}
            </span>
          </motion.div>

          <motion.h1
            className="text-5xl md:text-7xl font-heading font-bold mb-6 text-balance"
            style={{ color: 'var(--text-primary)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {t('landing.heroTitle1')}{' '}
            <span className="accent-text">{t('landing.heroTitle2')}</span>
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl max-w-2xl mx-auto mb-10 text-balance"
            style={{ color: 'var(--text-secondary)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            {t('landing.heroSubtitle')}
          </motion.p>

          <motion.div
            className="flex gap-4 justify-center flex-wrap"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <Link to="/tco">
              <AccentButton size="lg">{t('landing.ctaCalculate')}</AccentButton>
            </Link>
            <Link to="/compare">
              <AccentButton variant="outline" size="lg">{t('landing.ctaCompare')}</AccentButton>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {isCarsError ? (
          <GlassCard className="p-6 text-center col-span-full border-danger/20">
            <p className="text-sm text-[var(--text-secondary)]" role="alert">
              {t('landing.errorCars')}{' '}
              <button onClick={() => refetchCars()} className="text-accent hover:text-accent-warm underline transition-colors">
                {t('common.tryAgain')}
              </button>
            </p>
          </GlassCard>
        ) : isCarsLoading || isConfigLoading ? (
          [0, 1, 2, 3].map((idx) => (
            <GlassCard key={idx} className="p-6 text-center group">
              <div className="flex justify-center mb-1">
                <Skeleton className="h-10 w-20 rounded" />
              </div>
              <Skeleton className="h-4 w-32 mx-auto rounded" />
            </GlassCard>
          ))
        ) : (
          stats.map((stat, idx) => (
          <GlassCard
            key={idx}
            className="p-6 text-center group"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
            whileHover={{ y: -5, scale: 1.02 }}
            style={{ transformStyle: 'preserve-3d' }}
          >
                                            <div className="text-3xl md:text-4xl font-heading font-bold accent-text mb-1">
            <AnimatedCounter value={stat.value} suffix={stat.suffix} text={stat.text} />
          </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t(stat.labelKey)}</div>
          </GlassCard>
          ))
        )}
      </section>

      {/* Social-proof trust line (D) */}
      <section className="text-center">
        <SocialProofLine localeKey="landing" />
      </section>

      {/* J — sample quick-calc + featured vehicles */}
      <section className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-6">
          <GlassCard className="p-6" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h3 className="text-lg font-heading font-semibold text-[var(--text-primary)] mb-1">{t('landing.sampleTitle')}</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">{t('landing.sampleSub')}</p>
            <Link to="/tco?car=vios_2026&city=hanoi&km=15000&years=5&ratio=30">
              <AccentButton size="sm">{t('landing.ctaCalculate')}</AccentButton>
            </Link>
          </GlassCard>
          <div>
            <h3 className="text-lg font-heading font-semibold text-[var(--text-primary)] mb-3">{t('landing.featuredTitle')}</h3>
            <div className="grid grid-cols-2 gap-3">
              {['vios_2026', 'corolla_cross_2026', 'fortuner_2026', 'vf8_2026'].map((id) => {
                const car = cars?.find(c => c.id === id)
                if (!car) return null
                return (
                  <Link key={id} to={`/tco?car=${id}&city=hanoi&km=15000&years=5&ratio=30`} className="block">
                    <GlassCard className="p-3 group">
                      <div className="font-medium text-[var(--text-primary)]">{car.brand} {car.model}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{car.segment} · {car.type}</div>
                      <div className="text-sm font-mono accent-text mt-1">{formatVND(car.price)}</div>
                    </GlassCard>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* J — trust badges */}
      <section className="flex flex-wrap justify-center gap-3 text-center">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            <span className="text-accent" aria-hidden="true">✓</span>
            {t(`landing.trust${n}`)}
          </span>
        ))}
      </section>


                  {/* How It Works — Vertical Timeline (moved above FAQ for the onboarding arc) */
      }<section className="max-w-3xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-heading font-bold text-center mb-16"
          style={{ color: 'var(--text-primary)' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
                    {t('landing.howItWorks')}
        </motion.h2>

        <div className="relative">
          {/* Timeline line */}
          <div
            className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
            style={{ background: 'linear-gradient(180deg, transparent, var(--accent), transparent)' }}
          />

          {steps.map((step, idx) => (
            <div key={step.num} className={`relative flex items-center mb-12 ${idx % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
                            {/* Timeline dot */}
              <div className="absolute left-8 md:left-1/2 -translate-x-1/2 z-10">
                <div className="w-12 h-12 rounded-full accent-gradient flex items-center justify-center shadow-lg shadow-accent/20">
                  <span className="text-[var(--bg-base)] font-bold text-lg">{step.num}</span>
                </div>
              </div>

              {/* Content card */}
              <motion.div
                className={`ml-20 md:ml-0 md:w-[calc(50%-3rem)] ${idx % 2 === 0 ? 'md:mr-auto md:pr-12' : 'md:ml-auto md:pl-12'}`}
                initial={{ opacity: 0, x: idx % 2 === 0 ? -50 : 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              >
                <GlassCard className="p-6 group">
                  <div className="mb-4" style={{ color: 'var(--accent)' }}>
                    {stepIcons[step.icon]}
                  </div>
                  <h3 className="text-xl font-heading font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {t(step.titleKey)}
                  </h3>
                   <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {t(step.descKey, step.count !== undefined ? { count: step.count } : undefined)}
                    </p>
                </GlassCard>
              </motion.div>
            </div>
          ))}
        </div>
      </section>

      {/* J — FAQ accordion */}
      <section className="max-w-3xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-heading font-bold text-center text-[var(--text-primary)] mb-8">{t('landing.faqTitle')}</h2>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
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

      {/* CTA Section */}
      <section className="relative overflow-hidden rounded-3xl">
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.1) 0%, rgba(var(--accent-rgb), 0.05) 100%)',
          }}
        />
        <GlassCard className="relative p-12 md:p-16 text-center">
          <motion.h2
            className="text-3xl md:text-5xl font-heading font-bold mb-4 text-balance"
            style={{ color: 'var(--text-primary)' }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {t('landing.ctaHeading')}
         </motion.h2>
          <motion.p
            className="text-lg mb-8 max-w-xl mx-auto"
            style={{ color: 'var(--text-secondary)' }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            {t('landing.ctaCompareDesc', { count: cars?.length || 0 })}
          </motion.p>
          <motion.div
            className="flex gap-4 justify-center flex-wrap"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
              <Link to="/tco">
                <AccentButton size="lg">{t('landing.ctaCalculate')}</AccentButton>
              </Link>
              <Link to="/car">
                <AccentButton variant="outline" size="lg">{t('nav.browse')}</AccentButton>
              </Link>
          </motion.div>
        </GlassCard>
      </section>
    </div>
  )
}