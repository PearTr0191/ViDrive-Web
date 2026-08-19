import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { api, historyApi, formatVND, stripDiacritics, toTitleCase } from '../lib'
import type { CarInfo } from '../lib'
import { registerShortcutHandlers, unregisterShortcutHandlers } from '../hooks/useGlobalShortcuts'
import { useSeoMetaSafe } from '../lib/seo'
import AccentButton from '../components/AccentButton'
import GlassCard from '../components/ui/GlassCard'
import Skeleton from '../components/ui/Skeleton'
import { useI18n } from '../lib/i18n'

function formatRelativeTime(
  timestamp: string,
  locale: 'en' | 'vi',
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const now = new Date()
  const past = new Date(timestamp)
  const diffMs = now.getTime() - past.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return t('history.justNow')
  if (diffMins < 60) return t('history.minutesAgo', { count: diffMins })
  if (diffHours < 24) return t('history.hoursAgo', { count: diffHours })
  if (diffDays < 7) return t('history.daysAgo', { count: diffDays })
  return past.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface HistoryEntry {
  name: string
  timestamp: string
  data: any
}

export default function History() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  useSeoMetaSafe({ title: `ViDrive - ${t('nav.history')}`, description: t('page.historyDescription'), noindex: true })
  const queryClient = useQueryClient()
  const prefersReduced = useReducedMotion()
  const [searchTerm, setSearchTerm] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    registerShortcutHandlers({ onFocusSearch: () => searchInputRef.current?.focus() })
    return () => {
      unregisterShortcutHandlers(['onFocusSearch'])
    }
  }, [])

  const { data: history, isLoading, isError, refetch } = useQuery<HistoryEntry[]>({
    queryKey: ['history'],
    queryFn: () => historyApi.getHistory(),
    retry: 1,
    refetchOnMount: true,
  })

  // Car catalog — used to render friendly names from internal slugs in saved entries.
  // Returned data is empty while loading; display falls back to the slug until cars arrive.
  const { data: cars } = useQuery<CarInfo[]>({
    queryKey: ['cars'],
    queryFn: () => api.getCars(),
    retry: 1,
  })

  // Build a friendly display name for a saved entry. Replaces the raw slug
  // ("vios_2026_hanoi_5y") with the car model + city + years so returning
  // users can actually read their own history. Falls back to the original
  // entry.name while cars are still loading.
  const carNameById = useMemo(() => {
    const map = new Map<string, CarInfo>()
    for (const c of cars ?? []) map.set(c.id, c)
    return map
  }, [cars])

  const entryDisplayName = (entry: HistoryEntry): string => {
    const data = entry.data || {}
    const isCompare = data.type === 'compare'
    const carIds: string[] = isCompare ? (data.cars || data.car_ids || []) : [data.car_id]
    const city = data.city || ''
    const years = data.years

    const names = carIds
      .filter(Boolean)
      .map((id) => {
        const car = carNameById.get(id)
        return car ? `${car.brand} ${car.model}` : id
      })

    if (names.length === 0) return entry.name
    const headline = isCompare && names.length > 1
      ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
      : names[0]

    const cityLabel = city ? toTitleCase(city.replace(/-/g, ' ')) : ''
    const yearLabel = years != null ? `${years} ${years === 1 ? 'year' : 'years'}` : ''
    return [headline, cityLabel, yearLabel].filter(Boolean).join(' • ')
  }

  const requestDelete = (name: string) => setPendingDelete(name)
  const cancelDelete = () => setPendingDelete(null)

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await historyApi.deleteHistory(pendingDelete)
      queryClient.invalidateQueries({ queryKey: ['history'] })
    } catch (err) {
      console.error('Failed to delete history entry:', err)
    } finally {
      setPendingDelete(null)
    }
  }

  const handleExportAll = () => {
    if (!history || history.length === 0) return
    const rows = ['Name,Timestamp,Type,Car,OnRoad,TCO,Monthly']
    for (const entry of history) {
      const data = entry.data || {}
      const isCompare = data.type === 'compare'
      const results = isCompare ? data.results : [data.result]
      const carIds = isCompare ? data.cars : [data.car_id]
      if (!results || !carIds) continue
      for (let i = 0; i < results.length; i++) {
        const r = results[i]
        if (!r) continue
        rows.push([
          `"${entry.name}"`,
          entry.timestamp,
          isCompare ? 'compare' : 'single',
          carIds[i]?.toUpperCase() || '',
          r.on_road || 0,
          r.tco || 0,
          r.monthly || 0,
        ].join(','))
      }
    }
    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vidrive-history-all.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredHistory = useMemo(() => {
    if (!history) return []
    if (!searchTerm) return history
    const lower = stripDiacritics(searchTerm.toLowerCase())
    return history.filter(entry => {
      const nameMatch = entry.name && stripDiacritics(entry.name.toLowerCase()).includes(lower)
      const displayMatch = stripDiacritics(entryDisplayName(entry).toLowerCase()).includes(lower)
      const data = entry.data || {}
      const isCompare = data.type === 'compare'
      const carIds: string[] = isCompare ? (data.cars || data.car_ids || []) : [data.car_id]
      const carMatch = carIds?.some((id: string) => stripDiacritics(id.toLowerCase()).includes(lower))
      return nameMatch || displayMatch || carMatch
    })
  }, [history, searchTerm, carNameById])

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <GlassCard key={i} className="p-6">
              <Skeleton className="h-5 w-48 mb-3" />
              <Skeleton className="h-4 w-32 mb-4" />
              <Skeleton className="h-10 w-full" />
            </GlassCard>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-8">
        <GlassCard className="p-12 text-center">
          <p className="text-[var(--text-primary)]/60 mb-4" role="alert">{t('common.error')}</p>
          <AccentButton variant="outline" onClick={() => refetch()}>{t('history.refresh')}</AccentButton>
        </GlassCard>
      </div>
    )
  }

  if (!history || history.length === 0) {
    return (
      <div className="space-y-8">
        <GlassCard className="p-16 text-center">
          <div className="text-[var(--text-secondary)] text-lg mb-6">{t('history.empty')}</div>
          <AccentButton onClick={() => navigate('/tco')}>{t('history.calculateNew')}</AccentButton>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h1 className="sr-only">{t('history.title')}</h1>
      <div className="flex gap-3 items-center">
        <div className="flex-1">
          <GlassCard className="p-4">
            <input
              type="text"
              ref={searchInputRef}
              placeholder={t('history.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50 transition-colors"
              aria-label={t('history.searchPlaceholder')}
            />
          </GlassCard>
        </div>
        <AccentButton variant="outline" size="sm" onClick={handleExportAll}>
          {t('history.exportAll')}
        </AccentButton>
      </div>

      {filteredHistory.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <div className="text-[var(--text-secondary)]">{t('history.noResults')}</div>
        </GlassCard>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-accent/40 via-accent/20 to-transparent" />

          <div className="space-y-6">
            {filteredHistory.map((entry: HistoryEntry, idx: number) => {
              const data = entry.data || {}
              const isCompare = data.type === 'compare'
              const results = isCompare ? data.results : [data.result]
              const carIds = isCompare ? data.cars : [data.car_id]

              if (!results || !carIds) return null

              return (
                <motion.div
                  key={`${entry.name}-${idx}`}
                  className="relative pl-16"
                  initial={prefersReduced ? false : { opacity: 0, x: -20 }}
                  animate={prefersReduced ? false : { opacity: 1, x: 0 }}
                  transition={prefersReduced ? { duration: 0 } : { duration: 0.4, delay: idx * 0.08 }}
                >
                  {/* Timeline dot */}
                  <div className="absolute left-4 top-6 w-4 h-4 rounded-full accent-gradient shadow-lg shadow-accent/20" />

                  <GlassCard className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-heading font-bold text-[var(--text-primary)]">{entryDisplayName(entry)}</h3>
                        <div className="flex gap-3 text-sm text-[var(--text-secondary)] mt-1 flex-wrap">
                          <span>{formatRelativeTime(entry.timestamp, locale, t)}</span>
                          <span className="w-1 h-1 rounded-full bg-[var(--text-secondary)] self-center" />
                          <span>{t('history.type')}: {isCompare ? t('history.typeCompare') : t('history.typeSingle')}</span>
                      </div>
                     </div>
                      <button
                        onClick={() => requestDelete(entry.name)}
                        className="text-sm text-[var(--text-secondary)] hover:text-danger transition-colors"
                        aria-label={`${t('history.delete')}: ${entryDisplayName(entry)}`}
                        title={entry.name}
                      >
                        {t('history.delete')}
                     </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border-default)]">
                            <th scope="col" className="text-left text-[var(--text-primary)] py-2">{t('history.car')}</th>
                            <th scope="col" className="text-right text-[var(--text-primary)] py-2">{t('history.onRoad')}</th>
                            <th scope="col" className="text-right text-accent py-2">{t('history.tco')}</th>
                            <th scope="col" className="text-right text-[var(--text-primary)] py-2">{t('history.monthly')}</th>
                          </tr>
                        </thead>
                          <tbody>
                            {results.map((r: any, i: number) => {
                              if (!r) return null
                              const car = carIds[i] ? carNameById.get(carIds[i]) : null
                              const carLabel = car ? `${car.brand} ${car.model}` : (carIds[i]?.toUpperCase() || '—')
                              return (
                                <tr key={i} className="border-b border-[var(--border-subtle)] last:border-0">
                                   <td className="py-2 text-[var(--text-primary)] font-medium">{carLabel}</td>
                                  <td className="text-right text-[var(--text-primary)] py-2 font-mono">{formatVND(r.on_road || 0)}</td>
                                  <td className="text-right accent-text font-bold py-2 font-mono">{formatVND(r.tco || 0)}</td>
                                  <td className="text-right text-[var(--text-primary)] py-2 font-mono">{formatVND(r.monthly || 0)}</td>
                               </tr>
                              )
                            })}
                         </tbody>
                      </table>
                    </div>
                  </GlassCard>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <AccentButton variant="outline" onClick={() => refetch()}>
          {t('history.refresh')}
        </AccentButton>
      </div>

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-modal="true"
            role="dialog"
          >
            <motion.div
              className="w-full max-w-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', duration: 0.3 }}
            >
              <GlassCard className="p-6 text-center">
                <h3 className="text-lg font-heading font-bold text-[var(--text-primary)] mb-3">
                  {t('history.confirmDeleteTitle')}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] mb-2">
                  {t('history.confirmDelete')}
                </p>
                <p className="text-sm font-mono text-accent mb-6 break-all">
                  {pendingDelete}
                </p>
                <div className="flex gap-3 justify-center">
                  <AccentButton variant="outline" size="sm" onClick={cancelDelete}>
                    {t('common.cancel')}
                  </AccentButton>
                  <AccentButton size="sm" onClick={confirmDelete} className="border-danger/30 hover:border-danger/50">
                    {t('history.deleteConfirm')}
                  </AccentButton>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
