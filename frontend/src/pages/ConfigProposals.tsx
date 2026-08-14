import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import GlassCard from '../components/ui/GlassCard'
import AccentButton from '../components/AccentButton'
import { useI18n } from '../lib/i18n'
import { configApi, formatVND } from '../lib'
import { formatItemValue as formatValue, buildChangeKey, useConfigEditor } from '../hooks/useConfigEditor'
import type { AssumptionsResponse, AssumptionGroup, AssumptionItem } from '../lib/api'
import Breadcrumbs from '../components/Breadcrumbs'

function formatInputValue(val: number | string | null): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

export default function ConfigProposals({ hideBreadcrumbs = false }: { hideBreadcrumbs?: boolean } = {}) {
  const { t, locale } = useI18n()
  const prefersReduced = useReducedMotion()
  const [data, setData] = useState<AssumptionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  const { changes, author, setAuthor, submitState, changeCount, handleValueChange, revertChange, handleSubmit } = useConfigEditor(locale, t)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await configApi.getAssumptions()
      setData(response)
      const initialOpen: Record<string, boolean> = {}
      response.groups.forEach((g: AssumptionGroup) => {
        initialOpen[g.key] = g.items.some((i: AssumptionItem) => i.editable)
      })
      setOpenGroups(initialOpen)
    } catch (err: any) {
      setError(err.message || t('config.error'))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto">
        {!hideBreadcrumbs && <Breadcrumbs />}
        <div className="text-center py-12">
          <p className="text-[var(--text-secondary)]">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto">
        {!hideBreadcrumbs && <Breadcrumbs />}
        <GlassCard className="p-8 text-center">
          <p className="text-danger mb-4">{error}</p>
          <AccentButton onClick={fetchData}>{t('common.retry')}</AccentButton>
        </GlassCard>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {!hideBreadcrumbs && <Breadcrumbs />}

      {/* Header */}
      <motion.div
        className="text-center space-y-4"
        initial={prefersReduced ? false : { opacity: 0, y: 20 }}
        animate={prefersReduced ? false : { opacity: 1, y: 0 }}
      >
        <h1 className="text-4xl md:text-5xl font-heading font-bold text-[var(--text-primary)]">
          {t('config.title')}
        </h1>
        <p className="text-lg text-[var(--text-secondary)] max-w-3xl mx-auto">
          {t('config.subtitle')}
        </p>
      </motion.div>

      {/* Metadata */}
      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 10 }}
        animate={prefersReduced ? false : { opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <GlassCard className="p-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-muted)' }}>{t('config.lastUpdated')}:</span>
            <span className="font-medium text-[var(--text-primary)]">
              {data.metadata.last_updated}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-muted)' }}>{t('config.appVersion')}:</span>
            <span className="font-medium text-[var(--text-primary)]">
              {data.metadata.app_version}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--text-muted)' }}>{t('config.dataRecency')}:</span>
            <span className="font-medium text-[var(--text-primary)]">
              {t('config.days', { count: data.metadata.data_recency_days })}
            </span>
          </div>
        </GlassCard>
      </motion.div>

      {/* Submit Bar (top) */}
      {changeCount > 0 && (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: -10 }}
          animate={prefersReduced ? false : { opacity: 1, y: 0 }}
        >
          <GlassCard className="p-4 flex items-center justify-between gap-4">
            <div>
              <span className="text-[var(--accent)] font-semibold">{changeCount}</span>
              {' '}{changeCount === 1 ? t('config.changesSummary_single') : t('config.changesSummary')}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder={t('config.authorPlaceholder')}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="px-3 py-2 rounded-lg bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50"
              />
              <AccentButton
                size="sm"
                onClick={handleSubmit}
                disabled={submitState.status === 'submitting'}
              >
                {submitState.status === 'submitting' ? t('config.submitting') : t('config.submitBtn')}
              </AccentButton>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Success / Error Banner */}
      <AnimatePresence>
        {submitState.status === 'success' && (
          <motion.div
            className="p-4 rounded-xl bg-success/10 border border-success/30 text-success text-sm"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {t('config.successTitle')}: {submitState.message}
          </motion.div>
        )}
        {submitState.status === 'error' && (
          <motion.div
            className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {submitState.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Groups */}
      <div className="space-y-6">
        {data.groups.map((group, groupIdx) => (
          <motion.div
            key={group.key}
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={prefersReduced ? false : { opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + groupIdx * 0.03 }}
          >
            <GlassCard className="overflow-hidden">
              {/* Group Header */}
              <button
                type="button"
                onClick={() => setOpenGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-[rgba(var(--accent-rgb),0.03)] transition-colors"
              >
                <h2 className="text-xl md:text-2xl font-heading font-semibold text-[var(--text-primary)]">
                  {t(group.title_i18n)}
                </h2>
                <motion.svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: 'var(--text-secondary)' }}
                  animate={{ rotate: openGroups[group.key] ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <polyline points="18 15 12 9 6 15" />
                </motion.svg>
              </button>

              {/* Group Content */}
              <AnimatePresence initial={false}>
                {openGroups[group.key] && (
                  <motion.div
                    key={`content-${group.key}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    {group.items.length === 0 ? (
                      <p className="px-6 py-4 text-[var(--text-secondary)] text-sm">
                        {t('config.noEditable')}
                      </p>
                    ) : (
                      <div className="px-6 py-4 space-y-3">
                        {group.items.map((item, itemIdx) => {
                          const changeKey = buildChangeKey(item, itemIdx)
                          const hasChange = changeKey in changes
                          const proposed = hasChange ? changes[changeKey].value : null
                          const isNumeric = item.type === 'int' || item.type === 'float'

                          return (
                            <motion.div
                              key={changeKey}
                              className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-2 border-b border-[var(--border-subtle)] last:border-0"
                              initial={prefersReduced ? false : { opacity: 0, x: -10 }}
                              animate={prefersReduced ? false : { opacity: 1, x: 0 }}
                              transition={{ delay: 0.05 + itemIdx * 0.02 }}
                            >
                              {/* Label + current value */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className="text-[var(--text-primary)] font-medium text-sm">
                                    {t(item.label_i18n)}
                                  </span>
                                  {item.tier && (
                                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                      {item.tier}
                                    </span>
                                  )}
                                  {item.area != null && (
                                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                      Vùng {item.area}
                                    </span>
                                  )}
                                  {item.car_type && (
                                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                      {item.car_type}
                                    </span>
                                  )}
                                  {item.unit && (
                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                      ({item.unit})
                                    </span>
                                  )}
                                  {!item.editable && (
                                    <span
                                      className="text-xs px-2 py-0.5 rounded font-medium"
                                      style={{
                                        backgroundColor: 'rgba(var(--bg-base-rgb),0.5)',
                                        color: 'var(--text-muted)',
                                      }}
                                    >
                                      {t('config.readonly')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                                  {t('config.currentValue')}:{' '}
                                  <span className="font-mono text-[var(--text-secondary)]">
                                    {formatValue(item.value, item.type, item.unit)}
                                  </span>
                                </div>
                              </div>

                              {/* Proposed input / display */}
                              <div className="sm:w-40 flex-shrink-0">
                                {item.editable && isNumeric ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      step={item.step ?? 1}
                                      min={item.min ?? undefined}
                                      max={item.max ?? undefined}
                                      value={hasChange ? String(proposed) : formatInputValue(item.value)}
                                      onChange={(e) => handleValueChange(item, itemIdx, e.target.value)}
                                      className="w-full px-3 py-2 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-accent/50 transition-colors"
                                    />
                                    {hasChange && (
                                      <motion.button
                                        type="button"
                                        onClick={() => revertChange(changeKey)}
                                        className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors"
                                        aria-label={t('common.cancel')}
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <line x1="18" y1="6" x2="6" y2="18" />
                                          <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                      </motion.button>
                                    )}
                                  </div>
                                ) : (
                                  <div
                                    className="px-3 py-2 bg-[rgba(var(--bg-base-rgb),0.3)] border border-[var(--border-subtle)] rounded-xl text-sm font-mono"
                                    style={{ color: item.editable ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                                  >
                                    {hasChange ? (
                                      <span className="text-accent">{formatValue(proposed, item.type, item.unit)}</span>
                                    ) : (
                                      formatValue(item.value, item.type, item.unit)
                                    )}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      {/* Submit Bar (bottom) */}
      {changeCount > 0 && (
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 10 }}
          animate={prefersReduced ? false : { opacity: 1, y: 0 }}
        >
          <GlassCard className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder={t('config.authorPlaceholder')}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="px-3 py-2 rounded-lg bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50"
              />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {changeCount} {changeCount === 1 ? t('config.changesSummary_single') : t('config.changesSummary')}
              </span>
            </div>
            <AccentButton
              onClick={handleSubmit}
              disabled={submitState.status === 'submitting'}
            >
              {submitState.status === 'submitting' ? t('config.submitting') : t('config.submitBtn')}
            </AccentButton>
          </GlassCard>
        </motion.div>
      )}
    </div>
  )
}
