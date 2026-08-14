import { motion } from 'framer-motion'
import { useI18n } from '../lib/i18n'
import Breadcrumbs from '../components/Breadcrumbs'

export default function Privacy() {
  const { t } = useI18n()
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
          {t('privacy.title')}
        </h1>
        <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('privacy.intro')}</p>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('privacy.localTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('privacy.local')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('privacy.retentionTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('privacy.retention')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('privacy.cookiesTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('privacy.cookies')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('privacy.fontsTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('privacy.fonts')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('privacy.contactTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('privacy.contact')}</p>
        </section>
        <section className="space-y-3">
          <h2 className="text-xl font-heading font-semibold text-[var(--text-primary)]">
            {t('privacy.rightsTitle')}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed text-justify">{t('privacy.rights')}</p>
        </section>
      </motion.div>
    </div>
  )
}
