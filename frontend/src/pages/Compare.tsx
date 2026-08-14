import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useSearchParams, Link } from 'react-router-dom'
import { api, historyApi, configApi, formatVND, toTitleCase } from '../lib'
import type { TcoResult, CarInfo, YearlyBreakdownEntry } from '../lib'
import AccentButton from '../components/AccentButton'
import GlassCard from '../components/ui/GlassCard'
import CarMedia from '../components/CarMedia'
import SocialProofLine from '../components/SocialProofLine'
import { CheckeredFlag } from '../components/AutomotivePatterns'
import CarSearchSelect from '../components/CarSearchSelect'
import PressToEditNumber from '../components/PressToEditNumber'
import { useI18n } from '../lib/i18n'
import DropdownMenu from '../components/DropdownMenu'
import { registerShortcutHandlers, unregisterShortcutHandlers } from '../hooks/useGlobalShortcuts'

// Imperative-free snapshot of every input that feeds a comparison. Compared
// against the live form state to drive the Calculate / Reset / Recalculate
// button. `city_ratio_pct` is the integer 0–100 form to avoid float drift.
interface CompareInputSignature {
  car_ids: string[]
  city: string
  km: number
  years: number
  city_ratio_pct: number
  show_opp_cost: boolean
  rush_hour: boolean
}

function compareInputsEqual(a: CompareInputSignature, b: CompareInputSignature): boolean {
  return (
    a.city === b.city &&
    a.km === b.km &&
    a.years === b.years &&
    a.city_ratio_pct === b.city_ratio_pct &&
    a.show_opp_cost === b.show_opp_cost &&
    a.rush_hour === b.rush_hour &&
    a.car_ids.length === b.car_ids.length &&
    a.car_ids.every((id, i) => id === b.car_ids[i])
  )
}

export default function Compare() {
  const { t, locale } = useI18n()
  const prefersReduced = useReducedMotion()
  const [searchParams, setSearchParams] = useSearchParams()
  const phase1 = import.meta.env.VITE_COMPETITIVE_PHASE === '1'

  // Assumption metadata for the legal stamp (last_updated from Thông tư 155/2025 basis).
  const { data: assumptionsMeta } = useQuery({
    queryKey: ['assumptions-meta'],
    queryFn: () => configApi.getAssumptions(),
    select: (res) => res?.metadata,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // Parse deep-link params. Compare self-sync + the TCO "Compare" CTA use the
  // car0/car1/... format; the legacy single-car form uses `car`. Restoring all
  // inputs from the URL lets a shared link reproduce the exact scenario.
  // Compare is capped at a maximum of 4 cars.
  const MAX_COMPARE_CARS = 4
  const initialCarIds = (() => {
    const ids: string[] = []
    const single = searchParams.get('car')
    if (single) ids.push(single)
    for (let i = 0; i < MAX_COMPARE_CARS; i++) {
      const id = searchParams.get(`car${i}`)
      if (id) ids.push(id)
    }
    while (ids.length < 2) ids.push('')
    return ids.slice(0, MAX_COMPARE_CARS)
  })()
  const [carIds, setCarIds] = useState<string[]>(initialCarIds)
  const [city, setCity] = useState(searchParams.get('city') || 'hanoi')
  const [km, setKm] = useState(Number(searchParams.get('km')) || 15000)
  const [years, setYears] = useState(Number(searchParams.get('years')) || 5)
  const [cityRatio, setCityRatio] = useState(Number(searchParams.get('ratio')) || 30)
  const [showOppCost, setShowOppCost] = useState(searchParams.get('opp') === '1')
  const [rushHour, setRushHour] = useState(searchParams.get('rush') === '1')
  const [copyDone, setCopyDone] = useState(false)
  const [pdfState, setPdfState] = useState<'idle' | 'exporting'>('idle')
  // Which compared car the yearly cumulative breakdown shows. null = best car.
  const [yearlyCarIdx, setYearlyCarIdx] = useState<number | null>(null)
  // Snapshot of the inputs that produced the current comparison result, used
  // to detect parameter changes for the Calculate / Reset / Recalculate button.
  const [committedCompare, setCommittedCompare] = useState<CompareInputSignature | null>(null)
  const committedCompareRef = useRef<CompareInputSignature | null>(null)

  // Collapsible section state — all expanded by default (matches TCO page).
  const [sectionsOpen, setSectionsOpen] = useState<{ acquisition: boolean; operations: boolean; depreciation: boolean }>({
    acquisition: true,
    operations: true,
    depreciation: true,
  })
  const toggleSection = (key: 'acquisition' | 'operations' | 'depreciation') =>
    setSectionsOpen((s) => ({ ...s, [key]: !s[key] }))

  const { data: cars } = useQuery({ queryKey: ['cars'], queryFn: () => api.getCars() })
  const { data: cities } = useQuery({ queryKey: ['cities'], queryFn: () => api.getCities() })

  // Merge custom car from sessionStorage so it appears in the car dropdown
  const [customCar, setCustomCar] = useState<CarInfo | null>(null)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('vidrive-custom-car')
      if (stored) setCustomCar(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const allCars = useMemo(() => {
    if (!cars) return []
    return customCar ? [customCar, ...cars] : cars
  }, [cars, customCar])

  const mutation = useMutation({
    mutationFn: (req: Parameters<typeof api.compareTco>[0]) => api.compareTco(req),
    onSuccess: () => {
      if (committedCompareRef.current) setCommittedCompare(committedCompareRef.current)
    },
  })
  const queryClient = useQueryClient()

  const carName = (id: string) => {
    const car = allCars.find(c => c.id === id)
    return car ? `${car.brand} ${car.model}` : id.toUpperCase()
  }

  const handleCalculate = useCallback(() => {
    const validIds = carIds.filter(id => id)
    if (validIds.length < 2) return
    if (mutation.isPending) return
    const req: CompareInputSignature = {
      car_ids: validIds,
      city,
      km,
      years,
      city_ratio_pct: cityRatio,
      show_opp_cost: showOppCost,
      rush_hour: rushHour,
    }
    committedCompareRef.current = req
    mutation.mutate({
      car_ids: validIds,
      city,
      km,
      years,
      city_ratio: cityRatio / 100,
      show_opp_cost: showOppCost,
      rush_hour: rushHour,
    })
  }, [carIds, city, km, years, cityRatio, showOppCost, mutation])

  const addCar = () => {
    if (carIds.length < MAX_COMPARE_CARS) {
      setCarIds([...carIds, ''])
    }
  }

  const removeCar = (idx: number) => {
    if (carIds.length > 2) {
      setCarIds(carIds.filter((_, i) => i !== idx))
    }
  }

  const handleExportCsv = async () => {
    if (!results) return
    const validIds = carIds.filter(id => id)
    try {
      const { blob, filename } = await api.exportCsv({
        export_type: 'compare',
        car_ids: validIds,
        results,
        years,
        city,
        km,
        ratio: cityRatio / 100,
        show_opp: showOppCost,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
    }
  }

  const handleExportPdf = async () => {
    if (!results) return
    setPdfState('exporting')
    const validIds = carIds.filter(id => id)
    try {
      const { blob, filename } = await api.exportPdf({
        export_type: 'compare',
        lang: locale,
        car_ids: validIds,
        results,
        years,
        city,
        km,
        ratio: cityRatio / 100,
        show_opp: showOppCost,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setPdfState('idle')
    }
  }

  const results: TcoResult[] | undefined = mutation.data?.results
  const validIds = carIds.filter(id => id)
  const bestIdx = results ? results.findIndex(r => r.tco === Math.min(...results.map(r => r.tco))) : -1

  const handleCopyLink = async () => {
    const base = window.location.origin + '/compare?'
    const params = new URLSearchParams()
    validIds.forEach((id, i) => params.set(`car${i}`, id))
    params.set('city', city)
    params.set('km', String(km))
    params.set('years', String(years))
    params.set('ratio', String(cityRatio))
      if (showOppCost) params.set('opp', '1')
      if (rushHour) params.set('rush', '1')
      const url = base + params.toString()
    try {
      await navigator.clipboard.writeText(url)
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2000)
    }
  }

  const handleSaveToHistory = async () => {
    if (!results) return
    await historyApi.saveHistory(
      `compare_${validIds.join('_')}`,
      { type: 'compare', car_ids: validIds, city, km, years, ratio: cityRatio / 100, show_opp: showOppCost, results }
    )
   queryClient.invalidateQueries({ queryKey: ['history'] })
   }

   // Sync state to URL with 400ms debounce (review 6.1)
  useEffect(() => {
    const handler = setTimeout(() => {
      const params: Record<string, string> = {}
      carIds.forEach((id, i) => { if (id) params[`car${i}`] = id })
      params.city = city
      params.km = String(km)
      params.years = String(years)
      params.ratio = String(cityRatio)
      if (showOppCost) params.opp = '1'
      if (rushHour) params.rush = '1'
      setSearchParams(params, { replace: true })
    }, 400)
    return () => clearTimeout(handler)
  }, [carIds, city, km, years, cityRatio, showOppCost, setSearchParams])

  // Parameter-change tracking for the unified Compare / Reset / Recalculate button.
  const currentCompare: CompareInputSignature = {
    car_ids: validIds,
    city,
    km,
    years,
    city_ratio_pct: cityRatio,
    show_opp_cost: showOppCost,
    rush_hour: rushHour,
  }
  const compareParamsChanged = !!committedCompare && !compareInputsEqual(committedCompare, currentCompare)

  // Car ids frozen at the time of the last successful comparison. The result
  // card (car name + image + yearly title + verdict) renders off these so it
  // does not hot-reload when the user picks a different car before hitting
  // Re-compare. Matches the TCO page's displayedCarId pattern.
  const displayedCarIds: string[] = committedCompare?.car_ids ?? validIds

  const comparePrimaryLabel = mutation.isPending
    ? t('comparing')
    : !results
      ? t('compare.compareBtn')
      : compareParamsChanged
        ? t('compare.recalculate')
        : t('tco.resetButton')

  // Unified primary action: Reset (clear results) when nothing changed, else
  // Compare / Re-compare with the current inputs.
  const handleComparePrimary = useCallback(() => {
    if (mutation.isPending) return
    if (results && !compareParamsChanged) {
      mutation.reset()
      setCommittedCompare(null)
    } else {
      handleCalculate()
    }
  }, [mutation.isPending, results, compareParamsChanged, handleCalculate])

  // Enter is the single keyboard shortcut and mirrors the button exactly.
  useEffect(() => {
    registerShortcutHandlers({
      onCalculate: () => {
        if (!mutation.isPending) handleComparePrimary()
      },
    })
    return () => unregisterShortcutHandlers(['onCalculate'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutation.isPending, handleComparePrimary])

  // Per-section rows for each car. Mirrors the TCO page grouping.
  // Acquisition = MSRP + reg-tax + plate + inspection (= on_road).
  // Operations = fuel + maint + legal + optional insurance + parking.
  // Depreciation & Resale = resale (negative styling) + depreciation.
  const acquisitionRows = results ? [
    { key: 'onRoad', label: t('tco.onRoadPrice'), get: (r: TcoResult) => r.on_road },
  ] : []

  const operationsRows = results ? [
    { key: 'fuel', label: t('tco.fuel'), get: (r: TcoResult) => r.fuel },
    { key: 'maint', label: t('tco.maintenance'), get: (r: TcoResult) => r.maint },
    { key: 'legal', label: t('tco.insurance'), get: (r: TcoResult) => r.legal },
    ...(results.some(r => r.insurance_optional)
      ? [{ key: 'optIns', label: t('tco.physicalDamageInsurance'), get: (r: TcoResult) => r.insurance_optional ?? 0 }]
      : []),
    { key: 'parking', label: t('tco.parkingTolls'), get: (r: TcoResult) => r.parking_toll.total_over_period },
    ...(showOppCost ? [{ key: 'oppCost', label: t('tco.opportunityCost'), get: (r: TcoResult) => r.opp_cost }] : []),
  ] : []

  const depreciationRows = results ? [
    { key: 'depreciation', label: t('compare.depreciation'), get: (r: TcoResult) => r.depreciation, isNegative: true },
  ] : []

  const acquisitionSubtotal = (r: TcoResult) => r.on_road
  const operationsSubtotal = (r: TcoResult) =>
    r.fuel + r.maint + r.legal + (r.insurance_optional ?? 0) + r.parking_toll.total_over_period + (showOppCost ? r.opp_cost : 0)
  const depreciationNet = (r: TcoResult) => -r.depreciation

  // Yearly breakdown query — one selectable car (default = best value).
  const effectiveYearlyIdx = yearlyCarIdx != null ? yearlyCarIdx : bestIdx
  const yearlyCarId = displayedCarIds[effectiveYearlyIdx] ?? validIds[0]
  const { data: yearlyData } = useQuery({
    queryKey: ['compare-yearly', yearlyCarId, city, km, years, cityRatio, rushHour],
    queryFn: () => api.getYearlyBreakdown({ car_id: yearlyCarId, city, km, years, city_ratio: cityRatio / 100, rush_hour: rushHour }),
    enabled: !!results && !!yearlyCarId,
    staleTime: 60_000,
  })

  const sliderStyle = (val: number, min: number, max: number) => {
    const pct = ((val - min) / (max - min)) * 100
    const clamped = Math.max(0, Math.min(100, pct))
    return { '--val': `${clamped}%` } as React.CSSProperties
  }

  const isML = (r: TcoResult) => r.resale_logic === 'ml'

  return (
    <div className="space-y-8">
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Inputs */}
        <div className="lg:col-span-1 space-y-5">
          <GlassCard className="p-6 space-y-5">
            {carIds.map((id, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-[var(--text-primary)]" htmlFor={`compare-car-${idx}`}>
                    {t('compare.carN')} {idx + 1}
                  </label>
                  {carIds.length > 2 && (
                    <button
                      onClick={() => removeCar(idx)}
                      className="text-xs text-[var(--text-secondary)] hover:text-danger transition-colors"
                      aria-label={`${t('compare.removeCar')} ${idx + 1}`}
                      title={t('compare.removeCar')}
                    >
                      {t('compare.remove')}
                    </button>
                  )}
                </div>
                <CarSearchSelect
                  label=""
                  value={id}
                  onChange={(val) => {
                    const newIds = [...carIds]
                    newIds[idx] = val
                    setCarIds(newIds)
                  }}
                  cars={allCars}
                  searchPlaceholder={t('compare.searchPlaceholder')}
                  chooseLabel={t('tco.chooseCar')}
                />
              </div>
            ))}

            {carIds.length < MAX_COMPARE_CARS && (
              <AccentButton variant="outline" onClick={addCar} className="w-full">
                {t('compare.addCar')}
              </AccentButton>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="compare-city">{t('tco.city')}</label>
              <select
                id="compare-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-colors"
                aria-label={t('tco.city')}
              >
                {cities?.map(c => (
                  <option key={c.name} value={c.name.toLowerCase().replace(/\s+/g, '-')}>
                    {toTitleCase(c.diacritic)}
                 </option>
                ))}
              </select>
            </div>

            <div>
              <div className={km > 50000 ? 'ring-1 ring-danger/60 rounded-lg px-1 pt-1' : ''}>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="compare-km">
                  {t('tco.annualKm')}: <PressToEditNumber value={km} min={1000} max={100000} step={1000} onSave={setKm} format={(v) => v.toLocaleString()} ariaLabel={t('tco.annualKm')} />
                </label>
                <input
                  id="compare-km"
                  type="range" min="1000" max="50000" step="1000" value={km}
                  onChange={(e) => setKm(Number(e.target.value))}
                  className={`w-full ${km > 50000 ? 'slider-overflow' : ''}`}
                  style={{ ...sliderStyle(km, 1000, 50000), ...(km > 50000 ? { '--slider-fill': 'var(--danger)' } : {}) }}
                  aria-valuenow={km} aria-valuemin={1000} aria-valuemax={50000}
                  aria-valuetext={`${km.toLocaleString()} km`}
                  aria-label={t('tco.annualKm')}
                />
              </div>
            </div>

            <div>
              <div className={years > 10 ? 'ring-1 ring-danger/60 rounded-lg px-1 pt-1' : ''}>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="compare-years">
                  {t('tco.years')}: <PressToEditNumber value={years} min={1} max={20} step={1} onSave={setYears} ariaLabel={t('tco.years')} />
                </label>
                <input
                  id="compare-years"
                  type="range" min="1" max="10" step="1" value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className={`w-full ${years > 10 ? 'slider-overflow' : ''}`}
                  style={{ ...sliderStyle(years, 1, 10), ...(years > 10 ? { '--slider-fill': 'var(--danger)' } : {}) }}
                  aria-valuenow={years} aria-valuemin={1} aria-valuemax={10}
                  aria-valuetext={`${years} ${t('unit.years')}`}
                  aria-label={t('tco.years')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="compare-ratio">
                {t('tco.cityDriving')}: <span className="font-mono text-accent">{cityRatio}%</span>
              </label>
              <input
                id="compare-ratio"
                type="range" min="0" max="100" step="5" value={cityRatio}
                onChange={(e) => setCityRatio(Number(e.target.value))}
                className="w-full" style={sliderStyle(cityRatio, 0, 100)}
                aria-valuenow={cityRatio} aria-valuemin={0} aria-valuemax={100}
                aria-valuetext={t('tco.cityDrivingAriaText', { value: cityRatio })}
                aria-label={t('tco.cityDriving')}
              />
            </div>

            <div className="flex items-start gap-3">
              <input type="checkbox" id="opp-cost-cmp" checked={showOppCost} onChange={(e) => setShowOppCost(e.target.checked)} className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent bg-[rgba(var(--bg-base-rgb),0.5)] border-[var(--border-default)] rounded focus:ring-accent/50" />
              <label htmlFor="opp-cost-cmp" className="text-sm text-[var(--text-primary)]">
                <span>{t('tco.oppCost')}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{t('tco.oppCostHint')}</span>
              </label>
            </div>

            <div className="flex items-start gap-3">
              <input type="checkbox" id="rush-hour-cmp" checked={rushHour} onChange={(e) => setRushHour(e.target.checked)} className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent bg-[rgba(var(--bg-base-rgb),0.5)] border-[var(--border-default)] rounded focus:ring-accent/50" />
              <label htmlFor="rush-hour-cmp" className="text-sm text-[var(--text-primary)]">
                <span>{t('tco.rushHour')}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{t('tco.rushHourHint')}</span>
              </label>
            </div>

            <AccentButton
              onClick={handleComparePrimary}
              disabled={mutation.isPending || (results ? false : validIds.length < 2)}
              className="w-full"
            >
              {comparePrimaryLabel}
            </AccentButton>

            <Link to="/methodology" className="block w-full">
              <AccentButton variant="outline" className="w-full text-xs">
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.878 8.125a3 3 0 115.244 2.037c0 1.35-.7 1.8-1.28 2.13-.5.28-.8.57-.8 1.08v.67" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 17h.01" />
                  </svg>
                  {t('common.howWeCalculate')}
                </span>
              </AccentButton>
            </Link>
          </GlassCard>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          {mutation.isError && (
            <GlassCard className="p-4 border-danger/20">
              <p className="text-danger text-sm" role="alert">{t('common.error')}: {mutation.error?.message}</p>
            </GlassCard>
          )}

          {results && (
            <div className="space-y-6" role="status" aria-live="polite" aria-atomic="true">
              <SocialProofLine localeKey="compare" skeleton />
              {/* Comparison cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((r, i) => (
                  <GlassCard
                    key={i}
                    glow={i === bestIdx}
                    className="p-5"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    {i === bestIdx && (
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent text-xs font-semibold mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb),0.6)]" aria-hidden="true" />
                        {t('compare.bestValueBadge')}
                    </div>
                    )}
                    <div className="mb-3">
                      <CarMedia carId={displayedCarIds[i]} type={cars?.find(c => c.id === displayedCarIds[i])?.type} segment={cars?.find(c => c.id === displayedCarIds[i])?.segment} aspect="16 / 9" disableHover />
                   </div>
                    <h3 className="text-lg font-heading font-bold text-[var(--text-primary)] mb-3">
                      {carName(displayedCarIds[i])}
                   </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{t('tco.onRoadPrice')}</span>
                        <span className="font-mono text-[var(--text-primary)]">{formatVND(r.on_road)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{t('tco.netTco')}</span>
                        <span className="font-mono accent-text font-bold">{formatVND(r.tco)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{t('tco.monthly')}</span>
                        <span className="font-mono text-[var(--text-primary)]">{formatVND(r.monthly)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">{t('compare.depreciation')}</span>
                        <span className="font-mono text-danger">{formatVND(r.depreciation)}</span>
                      </div>
                      {isML(r) && (
                        <div className="inline-flex items-center gap-1.25 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs font-medium">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L18 9.27l-.75 3.08L15.58 14l-2.94 1.79.69 3.4L12 20l-2.94 1.79.69-3.4L6.75 12.27 6 9.27l2.09-1.01L12 8.26z"/></svg>
                          {t('compare.mlBadge')}
                        </div>
                      )}
                    </div>
                  </GlassCard>
                ))}
              </div>

              {/* Summary — three collapsible sections, columns = cars */}
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-heading font-bold text-[var(--text-primary)]">{t('compare.summary')}</h2>
                   <div className="flex gap-2 items-center">
                     <DropdownMenu
                       trigger={
                         <button
                           type="button"
                           className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
                           aria-label={t('compare.moreActions')}
                         >
                           <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                             <circle cx="8" cy="3" r="1.5" fill="currentColor" />
                             <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                             <circle cx="8" cy="13" r="1.5" fill="currentColor" />
                           </svg>
                         </button>
                       }
                     >
                        <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleExportCsv}>
                          {t('compare.exportCsv')}
                        </button>
                        <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleExportPdf} disabled={pdfState === 'exporting'}>
                          {pdfState === 'exporting' ? '...' : t('compare.exportPdf')}
                        </button>
                       <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleCopyLink}>
                         {copyDone ? t('compare.copyLinkDone') : t('compare.copyLink')}
                       </button>
                       {results && (
                         <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleSaveToHistory}>
                           {t('compare.saveToHistory')}
                         </button>
                       )}
                     </DropdownMenu>
                   </div>
                </div>

                {([
                  { key: 'acquisition' as const, title: t('tco.sectionAcquisition'), rows: acquisitionRows, subtotal: acquisitionSubtotal },
                  { key: 'operations' as const, title: t('tco.sectionOperations'), rows: operationsRows, subtotal: operationsSubtotal },
                  { key: 'depreciation' as const, title: t('tco.sectionDepreciation'), rows: depreciationRows, subtotal: depreciationNet },
                ]).map((section) => (
                  <div key={section.key} className="border border-[var(--border-default)] rounded-xl overflow-hidden mb-3 last:mb-0">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      className="w-full flex justify-between items-center px-4 py-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] transition-colors text-left cursor-pointer"
                      aria-expanded={sectionsOpen[section.key]}
                      aria-controls={`compare-section-${section.key}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                        <span aria-hidden="true" className={`transition-transform text-accent ${sectionsOpen[section.key] ? 'rotate-0' : '-rotate-90'}`}>▾</span>
                        {section.title}
                      </span>
                      <div className="flex gap-3">
                        {results.map((r, i) => (
                          <span key={i} className={`text-xs font-mono ${i === bestIdx ? 'accent-text font-semibold' : 'text-[var(--text-secondary)]'}`}>
                            {formatVND(section.subtotal(r))}
                          </span>
                        ))}
                      </div>
                    </button>
                    <AnimatePresence initial={false}>
                      {sectionsOpen[section.key] && (
                        <motion.div
                          id={`compare-section-${section.key}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
                            {/* Desktop table — one column per car */}
                            <div className="hidden sm:block overflow-x-auto">
                              <table className="w-full text-sm">
                                <tbody>
                                  {section.rows.map((item) => (
                                    <tr key={item.key} className="border-b border-[var(--border-subtle)] last:border-0">
                                      <td className="py-2 text-[var(--text-secondary)] w-1/3">{item.label}</td>
                                      {results.map((r, i) => {
                                        const val = item.get(r)
                                        const isMLResale = section.key === 'depreciation' && isML(r) && item.key === 'depreciation'
                                        return (
                                          <td key={i} className="text-right py-2 font-mono align-top">
                                            <div className={item.isNegative ? 'text-danger' : 'text-[var(--text-primary)]'}>
                                              {formatVND(val)}
                                            </div>
                                            {isMLResale && (
                                              <>
                                                <div className="inline-flex items-center gap-1 mt-1 text-[10px] text-accent">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                                                  {t('compare.mlBadge')}
                                                </div>
                                                {r.resale_spread != null && (
                                                  <div className="text-[10px] text-[var(--text-secondary)]">
                                                    {formatVND(r.resale - r.resale_spread / 2)} – {formatVND(r.resale + r.resale_spread / 2)}
                                                  </div>
                                                )}
                                                {r.resale_note_key && (
                                                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{t(r.resale_note_key)}</div>
                                                )}
                                              </>
                                            )}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Mobile stacked rows */}
                            <div className="sm:hidden space-y-2">
                              {section.rows.map((item) => (
                                <div key={item.key} className="flex flex-col py-2 border-b border-[var(--border-subtle)] last:border-0">
                                  <span className="text-xs text-[var(--text-secondary)]">{item.label}</span>
                                  <div className="flex justify-between gap-2 mt-1">
                                    {results.map((r, i) => (
                                      <span key={i} className={`text-sm font-mono ${i === bestIdx ? 'accent-text font-semibold' : item.isNegative ? 'text-danger' : 'text-[var(--text-primary)]'}`}>
                                        {formatVND(item.get(r))}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}

                {/* Net TCO footer row */}
                <div className="mt-4 pt-3 border-t border-[var(--border-default)]">
                  <div className="flex justify-between items-center">
                    <span className="text-accent font-semibold text-sm">{t('tco.netTco')}</span>
                    <div className="flex gap-3">
                      {results.map((r, i) => (
                        <span key={i} className={`font-mono font-bold ${i === bestIdx ? 'accent-text text-lg' : 'text-[var(--text-primary)]'}`}>
                          {formatVND(r.tco)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Yearly Cumulative breakdown — always visible for best car */}
              {yearlyData && (
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h3 className="text-lg font-heading font-semibold text-[var(--text-primary)]">{t('tco.cumulativeCost')}</h3>
                    <select
                      value={effectiveYearlyIdx < 0 ? '' : String(effectiveYearlyIdx)}
                      onChange={(e) => setYearlyCarIdx(e.target.value === '' ? null : Number(e.target.value))}
                      className="px-3 py-2 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-colors"
                      aria-label={t('compare.selectCar')}
                    >
                      {results.map((r, i) => (
                        <option key={i} value={String(i)}>
                          {i === bestIdx ? `★ ${carName(displayedCarIds[i])}` : carName(displayedCarIds[i])}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-accent mb-3">{carName(displayedCarIds[effectiveYearlyIdx])}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)]">
                          <th scope="col" className="text-left text-[var(--text-secondary)] py-2">{t('tco.years')}</th>
                          <th scope="col" className="text-right text-[var(--text-primary)] py-2">{t('tco.netTco')}</th>
                          <th scope="col" className="text-right text-[var(--text-secondary)] py-2">{t('compare.depreciation')}</th>
                          <th scope="col" className="text-right text-[var(--text-secondary)] py-2">{t('tco.fuel')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yearlyData.yearly.map((entry: YearlyBreakdownEntry) => (
                          <tr key={entry.year} className="border-b border-[var(--border-subtle)] last:border-0">
                            <td className="py-2 text-[var(--text-primary)]">{entry.year_label}</td>
                            <td className="text-right font-mono text-accent py-2">{formatVND(entry.cumulative_tco)}</td>
                            <td className="text-right font-mono text-[var(--text-primary)] py-2">{formatVND(entry.depreciation)}</td>
                            <td className="text-right font-mono text-[var(--text-primary)] py-2">{formatVND(entry.fuel)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              )}

              {/* Verdict */}
              {results.length >= 2 && bestIdx >= 0 && (
                <GlassCard glow className="p-6">
                  <h3 className="text-lg font-heading font-semibold accent-text mb-3">{t('compare.verdict')}</h3>
                  <p className="text-[var(--text-primary)] text-lg mb-2">
                    <span className="accent-text font-bold">{carName(displayedCarIds[bestIdx])}</span> {t('compare.mostEconomical')}
                 </p>
                  <div className="space-y-1">
                    {results.map((r, i) => i !== bestIdx && (
                      <p key={i} className="text-[var(--text-secondary)] text-sm">
                        {t('compare.saves')} <span className="text-success font-mono">{formatVND(r.tco - results[bestIdx].tco)}</span> {t('compare.vs')} {carName(displayedCarIds[i])}
                     </p>
                    )).filter(Boolean)}
                  </div>
                </GlassCard>
              )}

               {/* G — inline explainers (parity with TcoCalculator), gated on phase 1 */}
               {phase1 && (
                 <div className="noprint space-y-2 mb-2">
                   <details className="bg-[var(--glass-bg)]/60 border border-[var(--border-subtle)] rounded-lg p-3">
                     <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] list-none flex items-center justify-between">
                       <span>{t('tco.explainTco')}</span><span className="text-[var(--text-muted)]" aria-hidden="true">▼</span>
                     </summary>
                     <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('tco.explainTcoBody')}</p>
                   </details>
                   <details className="bg-[var(--glass-bg)]/60 border border-[var(--border-subtle)] rounded-lg p-3">
                     <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] list-none flex items-center justify-between">
                       <span>{t('tco.explainResale')}</span><span className="text-[var(--text-muted)]" aria-hidden="true">▼</span>
                     </summary>
                     <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('tco.explainResaleBody')}</p>
                   </details>
                   <details className="bg-[var(--glass-bg)]/60 border border-[var(--border-subtle)] rounded-lg p-3">
                     <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] list-none flex items-center justify-between">
                       <span>{t('tco.explainMl')}</span><span className="text-[var(--text-muted)]" aria-hidden="true">▼</span>
                     </summary>
                     <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('tco.explainMlBody')}</p>
                   </details>
                 </div>
               )}

               {/* Legal stamp — fee basis per Thông tư 155/2025 (plan §B) */}
              {(assumptionsMeta as any)?.last_updated && (
                <div className="text-center noprint">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-[var(--border-default)] text-[var(--text-muted)]">
                    {t('compare.legalStamp').replace('{date}', new Date((assumptionsMeta as any).last_updated).toLocaleDateString())}
                  </span>
                </div>
              )}

            </div>
          )}
          {mutation.isPending && (
            <GlassCard className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent mb-3" />
              <p className="text-[var(--text-secondary)] text-sm">{t('comparing')}</p>
          </GlassCard>
          )}

         {!results && !mutation.isError && !mutation.isPending && (
             <GlassCard className="p-16 text-center">
               <div className="text-[var(--text-secondary)] text-lg">{t('compare.emptyState')}</div>
            </GlassCard>
           )}
         </div>
       </div>

       {/* Save to History — moved into the summary dropdown */}
    </div>
  )
}
