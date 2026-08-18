import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '../lib/i18n'
import { useSeoMetaSafe } from '../lib/seo'
import { CheckeredFlag } from '../components/AutomotivePatterns'

export default function NotFound() {
  const { t } = useI18n()
  useSeoMetaSafe({
    title: `ViDrive - ${t('common.notFound')}`,
    description: t('common.notFoundDesc'),
    noindex: true,
  })

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="space-y-6"
      >
        <motion.h1
          className="text-8xl md:text-9xl font-heading font-bold accent-text"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          404
        </motion.h1>
        <h2 className="text-2xl md:text-3xl font-heading font-bold text-[var(--text-primary)]">
          {t('common.notFound')}
        </h2>
        <p className="text-[var(--text-secondary)] max-w-md mx-auto">
          {t('common.notFoundDesc')}
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-heading font-semibold accent-gradient text-[var(--bg-base)] hover:shadow-lg hover:shadow-accent/30 transition-all"
        >
          <CheckeredFlag size={18} />
          {t('nav.home')}
        </Link>
      </motion.div>
    </div>
  )
}
