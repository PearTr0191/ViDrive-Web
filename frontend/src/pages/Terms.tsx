import { motion } from 'framer-motion'
import { useI18n } from '../lib/i18n'
import { useSeoMetaSafe } from '../lib/seo'
import Breadcrumbs from '../components/Breadcrumbs'

export default function Terms() {
  const { t } = useI18n()
  useSeoMetaSafe({ title: `ViDrive - ${t('terms.title')}`, description: t('page.termsDescription') })
  return (
    <div className="max-w-3xl mx-auto">
      <Breadcrumbs />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <h1 className="text-3xl md:text-4xl font-heading font-bold text-[var(--text-primary)]">
          {t('terms.title')}
        </h1>
        <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.intro')}</p>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('terms.estimatesTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.estimates')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('terms.dataTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.data')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('terms.ipTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.ip')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('terms.acceptableUseTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.acceptableUse')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('terms.minorTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.minor')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('terms.liabilityTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.liability')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('terms.jurisdictionTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.jurisdiction')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('terms.contactTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('terms.contact')}</p>
        </section>
      </motion.div>
    </div>
  )
}
