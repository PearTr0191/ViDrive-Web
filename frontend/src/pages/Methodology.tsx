import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import GlassCard from '../components/ui/GlassCard'
import AccentButton from '../components/AccentButton'
import ErrorBoundary from '../components/ErrorBoundary'
import { useI18n } from '../lib/i18n'
import { useSeoMetaSafe } from '../lib/seo'
import { configApi, formatVND, type AssumptionsResponse, type AssumptionItem } from '../lib/api'
import { useConfigEditor, buildChangeKey, type ChangeRecord, type SubmitState } from '../hooks/useConfigEditor'
import { CheckeredFlag } from '../components/AutomotivePatterns'

const iconMap: Record<string, ReactNode> = {
  overview: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>,
  dataSources: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
  fuelPrices: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>,
  registration: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  maintenance: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  insurance: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  depreciation: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  roadTax: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>,
  loanCosts: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  disclaimer: <CheckeredFlag size={28} />,
}

type SectionDef = {
  key: string
  icon: keyof typeof iconMap
  titleKey?: string
  descKey?: string
  proseOnly?: boolean
}

const sections: SectionDef[] = [
  { key: 'overview', icon: 'overview' as keyof typeof iconMap },
  { key: 'fuelPrices', icon: 'fuelPrices' as keyof typeof iconMap },
  { key: 'registration', icon: 'registration' as keyof typeof iconMap },
  { key: 'maintenance', icon: 'maintenance' as keyof typeof iconMap },
  { key: 'insurance', icon: 'insurance' as keyof typeof iconMap },
  { key: 'depreciation', icon: 'depreciation' as keyof typeof iconMap },
  { key: 'roadTax', icon: 'roadTax' as keyof typeof iconMap },
  { key: 'loanCosts', icon: 'loanCosts' as keyof typeof iconMap },
  { key: 'disclaimer', icon: 'disclaimer' as keyof typeof iconMap },
  {
    key: 'fuelCadence',
    icon: 'fuelPrices' as keyof typeof iconMap,
    descKey: 'methodology.fuelPriceRefresh',
    proseOnly: true,
  },
  {
    key: 'vinfastLiquidityFloor',
    icon: 'depreciation' as keyof typeof iconMap,
    descKey: 'resale.vinfastLiquidityFloor',
    proseOnly: true,
  },
  {
    key: 'resaleConfidence',
    icon: 'depreciation' as keyof typeof iconMap,
    descKey: 'methodology.resaleConfidenceDesc',
    proseOnly: true,
  },
  {
    key: 'germanLuxuryData',
    icon: 'depreciation' as keyof typeof iconMap,
    descKey: 'methodology.germanLuxuryData',
    proseOnly: true,
  },
]

const formulaConfig: Record<string, { formulaKey: string; sourceKey?: string }> = {
  overview: { formulaKey: 'methodology.overviewFormula' },
  fuelPrices: { formulaKey: 'methodology.fuelPricesFormula', sourceKey: 'methodology.source.fuelPricing' },
  registration: { formulaKey: 'methodology.registrationFormula', sourceKey: 'methodology.source.govRegistration' },
  maintenance: { formulaKey: 'methodology.maintenanceFormula' },
  insurance: { formulaKey: 'methodology.insuranceFormula', sourceKey: 'methodology.source.insurance' },
  depreciation: { formulaKey: 'methodology.depreciationFormula', sourceKey: 'methodology.source.resale' },
  roadTax: { formulaKey: 'methodology.roadTaxFormula', sourceKey: 'methodology.source.govRegistration' },
  loanCosts: { formulaKey: 'methodology.loanCostsFormula' },
}

function FormulaDisclosure({
  formulaKey,
  t,
}: {
  formulaKey: string
  t: (key: string) => string
}) {
  const formula = t(formulaKey)

  return (
    <div className="mt-3 p-3 rounded-xl bg-[rgba(var(--bg-base-rgb),0.4)] border border-[var(--border-subtle)]">
      <div className="flex items-start gap-2">
        <code className="flex-1 font-mono text-xs md:text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-all leading-relaxed">
          {formula}
        </code>
      </div>
    </div>
  )
}

// On-road acquisition split — registration tax, plate fee, inspection, road
// maintenance fee (year 1), and civil insurance (year 1) → on-road price.
function OnRoadSplit({ t }: { t: (key: string) => string }) {
  const rows = [
    t('tco.regTax'),
    t('methodology.comp.plateFee'),
    t('config.onRoad.inspection'),
    t('tco.regRoadFee'),
    t('tco.regInsurance'),
  ]
  return (
    <div className="mt-3 p-3 rounded-xl bg-[rgba(var(--bg-base-rgb),0.4)] border border-[var(--border-subtle)]">
      <p className="text-xs font-semibold text-[var(--text-primary)] mb-2">
        {t('config.group.onRoadFees')}
      </p>
      <ul className="space-y-1">
        {rows.map((label) => (
          <li
            key={label}
            className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            {label}
          </li>
        ))}
        <li
          className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)] pt-1.5 mt-1 border-t border-[var(--border-subtle)]"
        >
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: 'var(--text-muted)' }}
          />
          {t('tco.onRoadTotal')}
        </li>
      </ul>
    </div>
  )
}

// ─── Assumptions Table with Inline Editor ────────────────────────────────

function formatAssumpValue(item: AssumptionItem): string {
  const val = item.value
  if (val === null || val === undefined) return '—'
  if (item.type === 'int' || item.type === 'float') {
    const num = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(num)) return String(val)
    if (item.unit === 'VND' || item.unit === 'VND/year' || item.unit === 'VND/month') return formatVND(num)
    if (item.unit === 'ratio') return `${(num * 100).toFixed(1)}%`
    if (item.unit === 'percent') return `${num.toFixed(1)}%`
    if (num === Math.floor(num)) return num.toLocaleString('vi-VN')
    // Round to 2 decimal places to avoid floating-point artifacts like 6.901000000000001
    return Number(num.toFixed(2)).toLocaleString('vi-VN', { maximumFractionDigits: 2 })
  }
  return String(val)
}

interface AssumptionsTableProps {
  t: (key: string) => string
  editorMode: boolean
  changes: Record<string, ChangeRecord>
  onValueChange: (item: AssumptionItem, itemIdx: number, rawValue: string) => void
  onRevert: (changeKey: string) => void
}

function AssumptionsTable({ t, editorMode, changes, onValueChange, onRevert }: AssumptionsTableProps) {
  const { data, isLoading, isError } = useQuery<AssumptionsResponse>({
    queryKey: ['methodology-assumptions'],
    queryFn: () => configApi.getAssumptions(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <GlassCard className="p-6">
        <p className="text-[var(--text-secondary)] text-sm">{t('common.loading')}</p>
      </GlassCard>
    )
  }

  if (isError || !data) {
    return (
      <GlassCard className="p-6">
        <p className="text-danger text-sm">{t('common.errorCta')}</p>
      </GlassCard>
    )
  }

  // Count editable items per group for the submit bar logic
  return (
    <GlassCard
      className="p-6 transition-all duration-300"
      style={{
        borderColor: editorMode ? 'var(--accent)' : undefined,
        boxShadow: editorMode ? '0 0 0 2px rgba(var(--accent-rgb),0.15)' : undefined,
      }}
    >
      {data.groups.map((group) => (
        <div key={group.key} className="mb-4 last:mb-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
            {t(group.title_i18n)}
          </h3>
          <div className="space-y-1.5">
            {group.items.map((item, idx) => {
              const isEditable = item.editable && (item.type === 'int' || item.type === 'float')
              const changeKey = buildChangeKey(item, idx)
              const hasChange = editorMode && changeKey in changes
              return (
                <AssumpRow
                  key={changeKey}
                  item={item}
                  itemIdx={idx}
                  groupIdx={0}
                  t={t}
                  editorMode={editorMode}
                  isEditable={isEditable}
                  hasChange={hasChange}
                  proposedValue={hasChange ? changes[changeKey].value : null}
                  onValueChange={onValueChange}
                  onRevert={onRevert}
                />
              )
            })}
          </div>
        </div>
      ))}
    </GlassCard>
  )
}

interface AssumpRowProps {
  item: AssumptionItem
  itemIdx: number
  groupIdx: number
  t: (key: string) => string
  editorMode: boolean
  isEditable: boolean
  hasChange: boolean
  proposedValue: number | null
  onValueChange: (item: AssumptionItem, itemIdx: number, rawValue: string) => void
  onRevert: (changeKey: string) => void
}

function AssumpRow({
  item,
  itemIdx,
  t,
  editorMode,
  isEditable,
  hasChange,
  onValueChange,
  onRevert,
}: AssumpRowProps) {
  const rowBg = hasChange
    ? 'rgba(var(--accent-rgb),0.04)'
    : 'transparent'

  return (
    <div
      className="flex items-center justify-between gap-3 py-1.5 transition-all"
      style={{ backgroundColor: rowBg }}
    >
      <div className="flex items-baseline gap-2 flex-wrap min-w-0 flex-1">
        <span className="text-[var(--text-primary)] text-sm">{t(item.label_i18n)}</span>
        {item.last_verified && (
          <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap ml-2">
            {item.last_verified}
         </span>
        )}
        {item.editable && (
          <span className="text-xs px-1.5 py-0.25 rounded" style={{ backgroundColor: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)' }}>
            {t('config.editable')}
          </span>
        )}
        {item.area != null && (
          <span className="text-xs px-1.5 py-0.25 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            Vùng {item.area}
          </span>
        )}
        {item.tier && (
          <span className="text-xs px-1.5 py-0.25 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {item.tier}
          </span>
        )}
        {item.car_type && (
          <span className="text-xs px-1.5 py-0.25 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            {item.car_type}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1 text-sm font-mono text-[var(--text-secondary)] flex-shrink-0">
        {editorMode && isEditable ? (
          <>
            {hasChange && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {formatAssumpValue(item)} →
              </span>
            )}
            <input
              type="number"
              step={item.step ?? 1}
              min={item.min ?? undefined}
              max={item.max ?? undefined}
              defaultValue={String(item.value ?? '')}
              onChange={(e) => onValueChange(item, itemIdx, e.target.value)}
              className="w-28 px-2 py-1 rounded-lg bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-accent/50 transition-colors"
            />
            {hasChange && (
              <motion.button
                type="button"
                onClick={() => onRevert(item.key)}
                className="p-0.5 rounded hover:bg-[var(--bg-elevated)] transition-colors"
                aria-label={t('common.cancel')}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </motion.button>
            )}
          </>
        ) : (
          <>
            <span>{formatAssumpValue(item)}</span>
            {item.unit && !['VND', 'VND/year', 'VND/month', 'y1_drop', 'annual_decay', 'city_factor', 'highway_factor'].includes(item.unit) && (
              <span style={{ color: 'var(--text-muted)' }}>({item.unit})</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}



interface SubmitBarProps {
  t: (key: string) => string
  changeCount: number
  author: string
  onAuthorChange: (v: string) => void
  submitState: SubmitState
  onSubmit: () => void
  disabled?: boolean
}

function SubmitBar({ t, changeCount, author, onAuthorChange, submitState, onSubmit, disabled }: SubmitBarProps) {
  const prefersReduced = useReducedMotion()

  return (
    <motion.div
      initial={prefersReduced ? false : { opacity: 0, y: 10 }}
      animate={prefersReduced ? false : { opacity: 1, y: 0 }}
    >
      <GlassCard className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder={t('config.authorPlaceholder')}
            value={author}
            onChange={(e) => onAuthorChange(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50"
          />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {changeCount} {changeCount === 1 ? t('config.changesSummary_single') : t('config.changesSummary')}
          </span>
        </div>
        <AccentButton
          onClick={onSubmit}
          disabled={submitState.status === 'submitting' || disabled}
        >
          {submitState.status === 'submitting' ? t('config.submitting') : t('config.submitBtn')}
        </AccentButton>
      </GlassCard>
    </motion.div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Methodology() {
  const { t, locale } = useI18n()
  useSeoMetaSafe({ title: `ViDrive - ${t('nav.methodology')}` })
  const prefersReduced = useReducedMotion()
  const [showFormulas, setShowFormulas] = useState(false)
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [editorMode, setEditorMode] = useState(false)
  const [exporting, setExporting] = useState(false)

  const editor = useConfigEditor(locale, t)

  const handleExportAssumptionsCsv = useCallback(async () => {
    setExporting(true)
    try {
      const data = await configApi.getAssumptions()
      const rows: string[] = ['Group,Key,Label,Value,Unit,Type,Area,Tier,CarType']
      for (const g of data.groups) {
        for (const item of g.items) {
          const label = item.label_i18n ? t(item.label_i18n) : item.key
          const area = item.area ?? ''
          const tier = item.tier ?? ''
          const carType = item.car_type ?? ''
          rows.push(
            `"${g.key}","${item.key}","${label}",${item.value},"${item.unit ?? ''}","${item.type ?? ''}","${area}","${tier}","${carType}"`
          )
        }
      }
      const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'vidrive_assumptions.csv'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }, [t])

  // When exiting editor mode, discard changes
  useEffect(() => {
    if (!editorMode) {
      editor.resetChanges()
    }
  }, [editorMode])

  // Scroll target when entering editor mode
  useEffect(() => {
    if (editorMode) {
      const el = document.getElementById('assumptions-table-content')
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [editorMode])

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Print-only title — replaces the giant hero h1 on paper so the printed page
          has a clear, branded header even with the screen hero hidden. */}
      <h1 className="print-only text-2xl font-bold text-center mb-2">
        ViDrive — {t('methodology.title')}
     </h1>

      {/* Hero */}
      <motion.div
        className="text-center space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-4xl md:text-5xl font-heading font-bold text-[var(--text-primary)]">
          {t('methodology.title')}
        </h1>
        <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
          {t('methodology.subtitle')}
        </p>
      </motion.div>

      {/* Show Formulas toggle */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <AccentButton
          size="sm"
          onClick={() => setShowFormulas(!showFormulas)}
          aria-expanded={showFormulas}
          aria-controls="formula-sections"
        >
          {showFormulas ? t('methodology.hideFormulas') : t('methodology.showFormulas')}
        </AccentButton>
      </motion.div>

      {/* Assumptions Table + Inline Editor */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-heading font-semibold text-[var(--text-primary)]">
            {t('methodology.assumptionsTable')}
          </h2>
          <div className="flex items-center gap-2">
            <AnimatePresence initial={false}>
              {showAssumptions && (
                <>
                  <motion.div
                    key="export-csv-btn"
                    initial={prefersReduced ? undefined : { opacity: 0, x: -10, width: 0 }}
                    animate={prefersReduced ? undefined : { opacity: 1, x: 0, width: 'auto' }}
                    exit={prefersReduced ? undefined : { opacity: 0, x: -10, width: 0 }}
                  >
                    <AccentButton
                      size="sm"
                      onClick={handleExportAssumptionsCsv}
                      disabled={exporting}
                    >
                      {exporting ? t('common.loading') : t('methodology.exportCsv')}
                    </AccentButton>
                  </motion.div>
                  <motion.div
                    key="suggest-changes-btn"
                    initial={prefersReduced ? undefined : { opacity: 0, x: -10, width: 0 }}
                    animate={prefersReduced ? undefined : { opacity: 1, x: 0, width: 'auto' }}
                    exit={prefersReduced ? undefined : { opacity: 0, x: -10, width: 0 }}
                  >
                    <AccentButton
                      size="sm"
                      onClick={() => {
                        if (editorMode) {
                          editor.resetChanges()
                          setEditorMode(false)
                        } else {
                          setEditorMode(true)
                        }
                      }}
                      aria-expanded={editorMode}
                      aria-controls="assumptions-table-content"
                    >
                      {editorMode ? t('config.hideBtn') : t('config.openBtn')}
                    </AccentButton>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
            <AccentButton
              size="sm"
              onClick={() => setShowAssumptions(!showAssumptions)}
              aria-expanded={showAssumptions}
              aria-controls="assumptions-table-content"
            >
              {showAssumptions ? t('common.collapse') : t('common.expand')}
            </AccentButton>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          {t('methodology.assumptionsEditHint')}
        </p>

        <AnimatePresence initial={false}>
          {showAssumptions && (
            <motion.div
              id="assumptions-table-content"
              key="assumptions-table"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <ErrorBoundary t={t}>
                <AssumptionsTable
                  t={t}
                  editorMode={editorMode}
                  changes={editor.changes}
                  onValueChange={editor.handleValueChange}
                  onRevert={editor.revertChange}
                />
              </ErrorBoundary>

              {/* Success / Error Banner */}
              <AnimatePresence>
                {editor.submitState.status === 'success' && (
                  <motion.div
                    className="p-4 rounded-xl bg-success/10 border border-success/30 text-success text-sm mt-4"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {t('config.successTitle')}: {editor.submitState.message}
                  </motion.div>
                )}
                {editor.submitState.status === 'error' && (
                  <motion.div
                    className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm mt-4"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {editor.submitState.message}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Bar (inline at bottom of table) */}
              {editorMode && editor.changeCount > 0 && (
                <SubmitBar
                  t={t}
                  changeCount={editor.changeCount}
                  author={editor.author}
                  onAuthorChange={editor.setAuthor}
                  submitState={editor.submitState}
                  onSubmit={editor.handleSubmit}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Sections */}
      <motion.div
        id="formula-sections"
        className="space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {sections.map((section, index) => {
          const fc = formulaConfig[section.key]
          return (
            <GlassCard
              key={section.key}
              className="p-6 md:p-8"
              initial={prefersReduced ? false : { opacity: 0, y: 10 }}
              animate={prefersReduced ? false : { opacity: 1, y: 0 }}
              transition={prefersReduced ? { duration: 0 } : { delay: 0.1 + index * 0.05 }}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1 text-accent">
                  {iconMap[section.icon]}
                </div>
                <div className="flex-1">
                  {!section.proseOnly && (
                    <h2 className="text-xl md:text-2xl font-heading font-semibold text-[var(--text-primary)] mb-3">
                      {t(section.titleKey ?? `methodology.${section.key}`)}
                    </h2>
                  )}
                  <p className="text-[var(--text-primary)]/80 leading-relaxed text-base md:text-lg text-justify">
                    {t(section.descKey ?? `methodology.${section.key}Desc`)}
                  </p>

                   {/* Inline source link at the right spot for each topic */}
                   {fc?.sourceKey && (
                     <a
                       href={t(fc.sourceKey)}
                       target="_blank"
                       rel="noopener noreferrer"
                       className="inline-flex items-center gap-1.5 mt-3 text-xs text-accent hover:opacity-80 transition-opacity break-all"
                     >
                       <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.69h-1.27V5.5a1.19 1.19 0 10-2.38 0v3.19H8.77a1.19 1.19 0 100 2.38h1.27v3.19a1.19 1.19 0 102.38 0v-3.19h1.27a1.19 1.19 0 100-2.38zM12 2.25a9.75 9.75 0 100 19.5 9.75 9.75 0 000-19.5z" /></svg>
                       {t(fc.sourceKey)}
                     </a>
                   )}

                   {/* Overview — data provenance (manufacturer list prices) + its source */}
                   {section.key === 'overview' && t('methodology.consumptionNote') && (
                     <>
                       <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed text-justify">
                         {t('methodology.consumptionNote')}
                       </p>
                       <a
                         href={t('methodology.source.manufacturerData')}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="inline-flex items-center gap-1.5 mt-3 text-xs text-accent hover:opacity-80 transition-opacity break-all"
                       >
                         <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.69h-1.27V5.5a1.19 1.19 0 10-2.38 0v3.19H8.77a1.19 1.19 0 100 2.38h1.27v3.19a1.19 1.19 0 102.38 0v-3.19h1.27a1.19 1.19 0 100-2.38zM12 2.25a9.75 9.75 0 100 19.5 9.75 9.75 0 000-19.5z" /></svg>
                         {t('methodology.source.manufacturerData')}
                       </a>
                     </>
                   )}

                   {/* Formula Disclosure — only for sections with a formula */}
                   {fc && showFormulas && (
                     <FormulaDisclosure formulaKey={fc.formulaKey} t={t} />
                   )}

                   {/* Registration — legal note (Thông tư 155/2025 plate-fee bands) + on-road fee split */}
                   {section.key === 'registration' && (
                     <>
                       {t('methodology.registrationNote') && (
                         <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed text-justify">
                           {t('methodology.registrationNote')}
                         </p>
                       )}
                       <OnRoadSplit t={t} />
                     </>
                   )}
                </div>
              </div>
            </GlassCard>
          )
        })}
      </motion.div>
    </div>
  )
}
