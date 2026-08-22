import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { api, historyApi, formatVND, toTitleCase, configApi } from '../lib'
import type { CarInfo, TcoResponse, YearlyBreakdownEntry } from '../lib'
import { useSeoMetaSafe, JsonLd, breadcrumbLd, SITE_URL, useLocalePath } from '../lib/seo'
import AccentButton from '../components/AccentButton'
import GlassCard from '../components/ui/GlassCard'
import CostBars from '../components/CostBars'
import SocialProofLine from '../components/SocialProofLine'
import Skeleton from '../components/ui/Skeleton'
import DropdownMenu from '../components/DropdownMenu'
import CarMedia from '../components/CarMedia'
import CarSearchSelect from '../components/CarSearchSelect'
import PressToEditNumber from '../components/PressToEditNumber'
import { useI18n } from '../lib/i18n'
import { registerShortcutHandlers, unregisterShortcutHandlers } from '../hooks/useGlobalShortcuts'

// E2 — recharts is heavy; the charts live in a lazily-loaded component so the
// initial TCO bundle stays small (charts only load once a result exists).
const TcoCharts = lazy(() => import('../components/TcoCharts'))

// Reference constants for the EV charge-vs-fuel comparison (plan §F). These
// mirror backend/src/config.py so the "ideal" comparison stays in sync with the
// rest of the TCO maths. The comparator shows what an equivalent petrol car
// (EV_ICE_REFERENCE_L_PER_100KM) would cost to fuel over the same distance.
const EV_CHARGING_PRICE_VND_PER_KWH = 3858 // config.py: EV_CHARGING_PRICE_VND (V-Green)
const EV_REFERENCE_PETROL_VND_PER_L = 22320 // config.py: PETROL_PRICE_CURRENT_VND
const EV_ICE_REFERENCE_L_PER_100KM = 8 // typical C-segment petrol baseline

// Normalize a city display name into the diacritic-free slug the API resolves
// (e.g. "Hà Nội" -> "hanoi"). Keeps the <select> value in sync with the
// diacritic-free `city` state so the dropdown shows the selected option.
const slugifyCity = (name: string): string =>
  name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '-')

// Signature line item for the on-road breakdown. Each row is tagged with a
// category-specific accent color so the uniquely-Vietnamese cost line items
// read as a visual signature rather than a uniform table.
function RegLineItem({
  label,
  value,
  accentVar,
  bold = false,
}: {
  label: string
  value: string
  accentVar: string
  bold?: boolean
}) {
  return (
    <div
      className="flex justify-between items-center text-sm px-2 py-1.5 rounded-md hover:bg-[rgba(var(--bg-base-rgb),0.3)] transition-colors"
    >
      <span className={'flex items-center gap-2 ' + (bold ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]')}>
        <span
          aria-hidden="true"
          className="w-1 h-4 rounded-full"
          style={{ backgroundColor: 'var(' + accentVar + ')' }}
        />
        {label}
    </span>
      <span className={'font-mono ' + (bold ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]')}>
        {value}
    </span>
  </div>
  )
}

// Default form values — used for both initial state and the Reset button.
const DEFAULTS = {
  city: 'hanoi',
  km: 15000,
  years: 5,
  cityRatio: 60,
  showOppCost: false,
  rushHour: false,
  includeInsurance: false,
  includeParkingToll: true,
  showLoan: false,
  loanDownPct: 30,
  loanRate: 8.5,
  loanTerm: 5,
} as const

const isCustomCarId = (id: string): boolean => id.startsWith('custom-')

// Trigger a client-side download that does NOT revoke the object URL until the
// browser has started the save. Revoking synchronously after a.click() can hand
// the browser a released/empty blob, producing a corrupt file that won't open.
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function TcoCalculator() {
  const { t, locale } = useI18n()
  useSeoMetaSafe({ title: `ViDrive - ${t('nav.tco')}`, description: t('page.tcoDescription') })
  const [searchParams] = useSearchParams()
  const phase1 = import.meta.env.VITE_COMPETITIVE_PHASE === '1'
  const variant = searchParams.get('v') ?? 'default'
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [pdfState, setPdfState] = useState<'idle' | 'exporting' | 'exported'>('idle')
  const [csvExported, setCsvExported] = useState(false)
  // D1 — prefill a popular car so the calculator auto-runs on first load
  const [selectedCar, setSelectedCar] = useState<string>(searchParams.get('car') || '')
  const [city, setCity] = useState(searchParams.get('city') || DEFAULTS.city)
  const [km, setKm] = useState<number>(() => {
    const v = searchParams.get('km')
    const n = v ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : DEFAULTS.km
  })
  const [years, setYears] = useState<number>(() => {
    const v = searchParams.get('years')
    const n = v ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : DEFAULTS.years
  })
  const [cityRatio, setCityRatio] = useState<number>(() => {
    const v = searchParams.get('ratio')
    const n = v ? Number(v) : NaN
    return Number.isFinite(n) ? n : DEFAULTS.cityRatio
  })
  const [showOppCost, setShowOppCost] = useState<boolean>(DEFAULTS.showOppCost)
  const [rushHour, setRushHour] = useState(searchParams.get('rush') === '1')
  const [includeInsurance, setIncludeInsurance] = useState(searchParams.get('ins') === '1')
  const [includeParkingToll, setIncludeParkingToll] = useState(searchParams.get('park') !== '0')
  // Fuel pricing mode: "forecast_avg" (default) glides today's pump/charging price to
  // the multi-year consensus across the ownership window; "current" pins every year
  // to today's price. Deep-linkable via ?fuel=current.
  const [useCurrentPrices, setUseCurrentPrices] = useState(searchParams.get('fuel') === 'current')
  const fuelPriceMode: 'forecast_avg' | 'current' = useCurrentPrices ? 'current' : 'forecast_avg'
  const [linkCopied, setLinkCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  // Flip the Save button back to its idle label whenever inputs change
  useEffect(() => {
    setSaved(false)
  }, [selectedCar, city, km, years])
  const [showLoan, setShowLoan] = useState<boolean>(DEFAULTS.showLoan)
  const [loanDownPct, setLoanDownPct] = useState<number>(DEFAULTS.loanDownPct)
  const [loanRate, setLoanRate] = useState<number>(DEFAULTS.loanRate)
  const [loanTerm, setLoanTerm] = useState<number>(DEFAULTS.loanTerm)
  const [loanResult, setLoanResult] = useState<any>(null)
  const [resaleWarning, setResaleWarning] = useState<string | null>(null)
  const [warningDismissed, setWarningDismissed] = useState(false)
  const [mlMaxYear, setMlMaxYear] = useState<number | null>(null)
  const [customCarWarning, setCustomCarWarning] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: cars, isError: isCarsError, refetch: refetchCars } = useQuery({ queryKey: ['cars'], queryFn: () => api.getCars(), retry: 1 })
  const { data: cities } = useQuery({ queryKey: ['cities'], queryFn: () => api.getCities() })

  // Fetch assumption metadata for the staleness badge (last_updated, days_since_update, data_stale)
  const { data: assumptionsMeta } = useQuery({
    queryKey: ['assumptions-meta'],
    queryFn: () => configApi.getAssumptions(),
    select: (res) => res?.metadata,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // Compute days since last update (API-provided or fallback from last_updated date)
  const daysSinceUpdate = useMemo(() => {
    const meta = assumptionsMeta
    if (!meta) return null
    if (typeof meta.days_since_update === 'number') return meta.days_since_update
    const lu = meta.last_updated
    if (typeof lu === 'string') {
      const d = new Date(lu)
      if (!isNaN(d.getTime())) return Math.floor((Date.now() - d.getTime()) / 86_400_000)
    }
    return null
  }, [assumptionsMeta])

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
    mutationFn: (req: Parameters<typeof api.calculateTco>[0]) => api.calculateTco(req),
    onSuccess: (data) => {
      queryClient.setQueryData(['lastTco'], data)
    },
  })

  const result: TcoResponse | undefined = mutation.data

  // Displayed inputs — frozen at the time of the last successful calculation.
  // These power every "(5Y)" label and the chart query keys so the result card
  // does not hot-reload when the form sliders move. The user must click
  // Calculate again to refresh the result with new inputs.
  const displayedYears = result?.years ?? years
  const displayedKm = result?.km ?? km
  const displayedRatio = result?.city_ratio ?? cityRatio / 100
  const displayedCity = result?.city ?? city
  const displayedCarId = result?.car_id ?? selectedCar


  // A freshly picked car with no result yet (or a result from a different car)
  // is a "new car" awaiting its first calculation.
  const isNewCar = !result || result.car_id !== selectedCar

  // Label mirrors the button's action so the UI and keyboard shortcut always agree.
  const tcoPrimaryLabel = mutation.isPending
    ? t('tco.calculating')
    : isNewCar
      ? t('tco.calculate')
      : t('tco.recalculate')

  // Reset — clears the result screen and restores all form fields to defaults
  const handleReset = useCallback(() => {
    mutation.reset()
    queryClient.removeQueries({ queryKey: ['tco-breakdown'] })
    queryClient.removeQueries({ queryKey: ['tco-yearly'] })
    queryClient.removeQueries({ queryKey: ['lastTco'] })
    setSelectedCar('')
    setCity(DEFAULTS.city)
    setKm(DEFAULTS.km)
    setYears(DEFAULTS.years)
    setCityRatio(DEFAULTS.cityRatio)
    setShowOppCost(DEFAULTS.showOppCost)
    setRushHour(DEFAULTS.rushHour)
    setIncludeInsurance(DEFAULTS.includeInsurance)
    setIncludeParkingToll(DEFAULTS.includeParkingToll)
    setUseCurrentPrices(false)
    setLinkCopied(false)
    setShowLoan(DEFAULTS.showLoan)
    setLoanDownPct(DEFAULTS.loanDownPct)
    setLoanRate(DEFAULTS.loanRate)
    setLoanTerm(DEFAULTS.loanTerm)
    setLoanResult(null)
  }, [mutation, queryClient])

  // Verbose breakdown query — uses displayed* inputs so it does not refetch
  // as the form sliders move.
  const displayedCarInfo = allCars.find(c => c.id === displayedCarId)
  const displayedIsCustom = displayedCarId ? isCustomCarId(displayedCarId) : false
  const { data: breakdown } = useQuery({
    queryKey: ['tco-breakdown', displayedCarId, displayedCity, displayedKm, displayedYears, displayedRatio, rushHour, result?.result?.fuel_price_mode],
    queryFn: () => api.getBreakdown({ car_id: displayedCarId!, car: displayedIsCustom ? displayedCarInfo : undefined, city: displayedCity, km: displayedKm, years: displayedYears, city_ratio: displayedRatio, rush_hour: rushHour, fuel_price_mode: result?.result?.fuel_price_mode }),
    enabled: !!selectedCar,
    staleTime: 60_000,
  })

  // Yearly breakdown query for line chart (non-linear curve data from backend).
  // queryKey uses the *displayed* (calculated-time) inputs so the chart does
  // not refetch as the user drags the form sliders. The user must click
  // Calculate again to update the chart with new inputs.
  //
  // The API curve (ML/parametric + VinFast floor) is the single source of
  // truth for the resale line. While this query is in flight `yearlyData` is
  // undefined, so `baseLineData` would otherwise fall through to the stale
  // client-side parametric fallback (hard-coded y1_drop=0.20, annual_decay=0.15,
  // no VinFast floor) — a *different* pattern that "spawns out" before the real
  // curve resolves. We gate the chart on `yearlyLoading` and show a skeleton so
  // the wrong curve is never painted, then render the exact API curve once it
  // arrives.
  const { data: yearlyData, isInitialLoading: yearlyLoading } = useQuery({
     queryKey: ['tco-yearly', displayedCarId, displayedCity, displayedKm, displayedYears, displayedRatio, rushHour, includeParkingToll, result?.result?.fuel_price_mode],
     queryFn: () => api.getYearlyBreakdown({ car_id: displayedCarId!, car: displayedIsCustom ? displayedCarInfo : undefined, city: displayedCity, km: displayedKm, years: displayedYears, city_ratio: displayedRatio, rush_hour: rushHour, include_parking_toll: includeParkingToll, fuel_price_mode: result?.result?.fuel_price_mode }),
    enabled: !!result && !!selectedCar,
    staleTime: 60_000,
  })

// Detect parametric fallback warnings from yearly data or main TCO result.
  // Surface as a floating notification that auto-dismisses after 5 seconds.
  // `warningDismissed` gates this effect so the timer can actually clear the
  // banner — without it the effect re-shows the warning immediately after
  // the timer fires (resaleWarning is in the dep array), creating a loop that
  // only breaks when the user changes to a supported term.
  useEffect(() => {
    if (warningDismissed) return
    const allWarnings: string[] = []
    if (yearlyData?.warnings) allWarnings.push(...yearlyData.warnings)
    if (result?.result?.warnings) allWarnings.push(...result.result.warnings)

    const hasFallback = allWarnings.includes('resale.fallbackToParametric')
    if (hasFallback) {
      const mlMaxYear = yearlyData?.ml_max_year ?? result?.result?.ml_max_year ?? displayedYears
      if (resaleWarning === null) {
        setResaleWarning('resale.fallbackToParametric')
      }
      setMlMaxYear(mlMaxYear)
    } else if (resaleWarning !== null) {
      setResaleWarning(null)
    }
  }, [yearlyData?.warnings, result?.result?.warnings, yearlyData?.ml_max_year, result?.result?.ml_max_year, resaleWarning, warningDismissed])

  // Auto-dismiss the resale warning after 5 seconds from when it first appears.
  useEffect(() => {
    if (!resaleWarning) return
    const timer = setTimeout(() => {
      setResaleWarning(null)
      setWarningDismissed(true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [resaleWarning])

  // Re-arm the warning so it can reappear when the underlying calculation
  // changes (new car, new term, new result). The dismiss flag is only
  // cleared when the warning data itself shifts, so an unrelated re-render
  // (e.g. dragging the km slider) never resurrects a dismissed banner.
  useEffect(() => {
    setWarningDismissed(false)
  }, [result?.result?.warnings, yearlyData?.warnings])

  const handleCalculate = () => {
    if (!selectedCar) return
    const req: Parameters<typeof api.calculateTco>[0] = {
      car_id: selectedCar,
      city,
      km,
      years,
      city_ratio: cityRatio / 100,
      show_opp_cost: showOppCost,
      rush_hour: rushHour,
      include_insurance: includeInsurance,
      include_parking_toll: includeParkingToll,
      fuel_price_mode: fuelPriceMode,
    }
    if (isCustomCarId(selectedCar)) {
      let customCarData = allCars.find(c => c.id === selectedCar)
      // Fallback: deep-link auto-calc may fire before customCar state (loaded
      // from sessionStorage) is populated. Read directly as a last resort.
      if (!customCarData) {
        try {
          const stored = sessionStorage.getItem('vidrive-custom-car')
          if (stored) {
            const parsed: CarInfo = JSON.parse(stored)
            if (parsed.id === selectedCar) customCarData = parsed
          }
        } catch { /* ignore parse errors */ }
      }
      if (customCarData) req.car = customCarData
    }
    mutation.mutate(req)
  }

  // Unified primary action: Reset when a result exists and nothing changed,
  // otherwise Calculate / Recalculate (same code path either way).
  const handleTcoPrimary = () => {
    if (mutation.isPending || !selectedCar) return
    // Primary action is always Calculate / Recalculate (the same code path).
    handleCalculate()
  }

  // Enter is the single keyboard shortcut and must mirror the button exactly
  // (Calculate / Reset / Recalculate), so the key never fires a stale calc.
  //
  // Ref pattern: the global keydown handler is registered ONCE per mount and
  // always calls the freshest handleTcoPrimary via this ref. The earlier
  // version captured handleTcoPrimary directly in the useEffect closure and
  // depended on [mutation.isPending, selectedCar, result, tcoParamsChanged] —
  // but dragging a slider doesn't change tcoParamsChanged if it was already
  // true (the user already had a stale result), so the effect didn't
  // re-register and Enter submitted with the closure's OLD cityRatio/km/years.
  // Symptom: pressing Enter once recalculated with the old input (no visible
  // change), pressing it again recalculated with the fresh input.
  const handleTcoPrimaryRef = useRef(handleTcoPrimary)
  handleTcoPrimaryRef.current = handleTcoPrimary

  const handleCalculateRef = useRef(handleCalculate)
  handleCalculateRef.current = handleCalculate

  useEffect(() => {
    registerShortcutHandlers({
      onCalculate: () => {
        handleTcoPrimaryRef.current()
      },
    })
    return () => unregisterShortcutHandlers(['onCalculate'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // Deep-link auto-calc on first mount only when URL params are present.
  // A plain visit to /tco with no query string shows the empty form; the user
  // picks a car and clicks Calculate. A shared link like ?car=vios_2026&city=hanoi
  // still computes immediately on load.
  useEffect(() => {
    if (!result && searchParams.toString()) {
      handleCalculateRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hot-reload the results card when the fuel-pricing toggle flips and a result
  // is already shown — the pricing choice changes the number, not the inputs,
  // so requiring a manual Recalculate would feel broken. Skipped before any
  // result exists (the toggle then just shapes the first calculation).
  const prevFuelModeRef = useRef(fuelPriceMode)
  useEffect(() => {
    if (prevFuelModeRef.current === fuelPriceMode) return
    prevFuelModeRef.current = fuelPriceMode
    if (result && !mutation.isPending) {
      handleCalculateRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuelPriceMode])

  const handleCalculateLoan = useCallback(async () => {
    if (!result) return
    try {
      const res = await api.calculateLoan({
        on_road_price: result.result.on_road,
        down_pct: loanDownPct,
        annual_rate: loanRate / 100,
        term_years: loanTerm,
      })
      setLoanResult(res)
    } catch (err) {
      console.error('Loan calculation failed:', err)
    }
  }, [result, loanDownPct, loanRate, loanTerm])

  // Auto-calculate loan when TCO result or loan params change (hot-reload)
  useEffect(() => {
    if (result) {
      setShowLoan(true)
      void handleCalculateLoan()
    }
  }, [result, loanDownPct, loanRate, loanTerm, handleCalculateLoan])

  const handleExportCsv = async () => {
    if (!result) return
    const { blob, filename } = await api.exportCsv({
      export_type: 'single',
      car_id: selectedCar,
      years,
      city,
      km,
      ratio: cityRatio / 100,
      show_opp: showOppCost,
      result: result.result,
    })
    downloadBlob(blob, filename)
    setCsvExported(true)
    window.setTimeout(() => setCsvExported(false), 2000)
  }

  const handleExportPdf = async () => {
    if (!result) return
    setPdfState('exporting')
    try {
      const { blob, filename } = await api.exportPdf({
        export_type: 'single',
        lang: locale,
        car_id: selectedCar,
        years,
        city,
        km,
        ratio: cityRatio / 100,
        show_opp: showOppCost,
        result: result.result,
        loan: loanResult ?? undefined,
      })
      downloadBlob(blob, filename)
      setPdfState('exported')
      window.setTimeout(() => setPdfState('idle'), 2000)
    } catch (e) {
      console.error('PDF export failed:', e)
      setPdfState('idle')
    }
  }

  const handleCopyLink = async () => {
    const params = new URLSearchParams()
    params.set('car', selectedCar)
    params.set('city', city)
    params.set('km', String(km))
    params.set('years', String(years))
    params.set('ratio', String(cityRatio))
    if (rushHour) params.set('rush', '1')
    if (includeInsurance) params.set('ins', '1')
    if (!includeParkingToll) params.set('park', '0')
    if (useCurrentPrices) params.set('fuel', 'current')
    if (variant) params.set('v', variant)
    const url = `${window.location.origin}${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      setLinkCopied(false)
    }
  }

  // G/H — competitive summary helpers
   const handleCopySummary = async () => {
    if (!result?.result || !selectedCarInfo) return
    const carName = `${selectedCarInfo.brand} ${selectedCarInfo.model}`
    const text = [
      t('tco.summaryHeader', { name: carName }),
      `${t('tco.summaryOnRoad')}: ${formatVND(result.result.on_road)}`,
      `${t('tco.summaryNetTco', { years: displayedYears })}: ${formatVND(result.result.tco)}`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setSummaryCopied(true)
      window.setTimeout(() => setSummaryCopied(false), 2000)
    } catch {
      setSummaryCopied(false)
    }
  }

   const selectedCarInfo = allCars.find(c => c.id === selectedCar)

  // Surface a warning when a custom car is used, since ML depreciation is
  // not available for custom cars — the parametric fallback is expected and
  // correct, but the user should see a custom-car-specific message rather
  // than the generic "year limit" parametric-fallback warning.
  useEffect(() => {
    if (isCustomCarId(selectedCar)) {
      setCustomCarWarning('resale.customCarNoMl')
      const timer = setTimeout(() => setCustomCarWarning(null), 5000)
      return () => clearTimeout(timer)
    } else {
      setCustomCarWarning(null)
    }
  }, [selectedCar])

  // Suppress the generic parametric-fallback warning when a custom car is
  // selected — the custom-car warning above is more informative.
  const showResaleWarning = resaleWarning && !isCustomCarId(displayedCarId)

  // Car info for the image + heading is keyed off the *calculated* result, not
  // the live selection. This keeps the car image and name in lock-step with the
  // TCO numbers: selecting a new car no longer hot-reloads the image/name ahead
  // of the (auto-triggered) recalculation — both update together when `result`
  // resolves.
  const resultCarInfo = cars?.find(c => c.id === result?.car_id)

  const sliderStyle = (val: number, min: number, max: number) => {
    const pct = ((val - min) / (max - min)) * 100
    // Clamp so that values outside [min, max] (e.g. entered via PressToEditNumber)
    // don't visually overflow the slider track beyond 0–100%.
    const clamped = Math.max(0, Math.min(100, pct))
    return { '--val': `${clamped}%` } as React.CSSProperties
  }

  // Collapsible section open/closed state. All expanded by default per product
  // decision (2026-08-09): users can collapse but the happy path shows numbers
  // immediately. State is local; resets to all-open on remount (route change).
  const [sectionsOpen, setSectionsOpen] = useState<{ acquisition: boolean; operations: boolean; depreciation: boolean }>({
    acquisition: true,
    operations: true,
    depreciation: true,
  })
  const toggleSection = (key: 'acquisition' | 'operations' | 'depreciation') =>
    setSectionsOpen((s) => ({ ...s, [key]: !s[key] }))
  // Nested collapsible for the fuel breakdown — closed by default; the fuel row
  // itself stays visible as a top-level operations line item.
  const [fuelDetailOpen, setFuelDetailOpen] = useState(false)
  // Nested collapsible for the Insurance & Fees breakdown — mirrors the fuel
  // breakdown so the recurring legal costs (road fee + civil insurance +
  // periodic inspection) are as inspectable as the fuel maths.
  const [insuranceDetailOpen, setInsuranceDetailOpen] = useState(false)

  const acquisitionItems = result ? [
    { label: t('tco.msrp'), value: result.result.price },
    { label: t('tco.regTax'), value: result.result.reg_tax },
  ] : []

  const operationsItems: Array<{
    label: string
    value: number
    isInsurance?: boolean
  }> = result ? [
    { label: t('tco.fuel'), value: result.result.fuel },
    { label: t('tco.maintenance'), value: result.result.maint },
    { label: t('tco.insurance'), value: result.result.legal, isInsurance: true },
    ...(result.result.insurance_optional
      ? [{ label: t('tco.physicalDamageInsurance'), value: result.result.insurance_optional }]
      : []),
    ...(result.result.inspection_periodic
      ? [{ label: t('tco.periodicInspection'), value: result.result.inspection_periodic }]
      : []),
    ...(result.include_parking_toll
      ? [{ label: t('tco.parkingTolls'), value: result.result.parking_toll.total_over_period }]
      : []),
  ] : []

  const depreciationItems: Array<{
    label: string
    value: number
    isNegative?: boolean
    ml?: boolean
    parametric?: boolean
    showNote?: boolean
    guaranteeFloor?: boolean
  }> = result ? [
    { label: t('tco.predictedResale'), value: result.result.resale, isNegative: true, ml: result.result.resale_logic === 'ml', parametric: result.result.resale_logic !== 'ml', showNote: true },
    // Option B (VinFast buyback): always disclose the RAW scheduled guarantee floor
    // for VinFast cars (null for non-VinFast). The floor is a guaranteed minimum,
    // not a resale forecast — the headline above is the expected open-market resale.
    // Showing it unconditionally makes the floor visible even when it sits below
    // the open-market estimate (previously hidden when guarantee_value == market).
    ...(result.result.resale_guarantee_floor != null
      ? [{ label: t('tco.guaranteeFloor'), value: result.result.resale_guarantee_floor, guaranteeFloor: true }]
      : []),
    { label: t('tco.totalDepreciation'), value: result.result.depreciation },
  ] : []

  const acquisitionSubtotal = result ? result.result.on_road : 0
  const operationsSubtotal = result
    ? result.result.fuel + result.result.maint + result.result.legal + (result.result.insurance_optional ?? 0) + (result.result.inspection_periodic ?? 0) + result.result.parking_toll.total_over_period
    : 0
  // Fuel unit is kWh/100km for EVs, L/100km for everything else — matches backend
  // get_fuel_breakdown which returns price_label ("VND/kWh" vs "VND/L") accordingly.
  const fuelUnit = selectedCarInfo?.type === 'EV' ? t('tco.fuelUnitEV') : t('tco.fuelUnitICE')
  const depreciationNet = result ? -result.result.resale : 0
  // Chart data for pie chart (cost composition)
  const pieData = useMemo(() => result ? [
    { name: t('tco.msrp'), value: Math.abs(result.result.price) },
    { name: t('tco.regTax'), value: Math.abs(result.result.reg_tax) },
    { name: t('tco.fuel'), value: Math.abs(result.result.fuel) },
    { name: t('tco.maintenance'), value: Math.abs(result.result.maint) },
    { name: t('tco.insurance'), value: Math.abs(result.result.legal) },
    ...(result.result.insurance_optional
      ? [{ name: t('tco.physicalDamageInsurance'), value: Math.abs(result.result.insurance_optional) }]
      : []),
    { name: t('tco.totalDepreciation'), value: Math.abs(result.result.depreciation) },
  ].filter(d => d.value > 0) : [], [result])

  // Chart data — two lines:
  //  - resale: car's residual value at each year (concave decline)
  //  - operating: cumulative operating costs at each year (linear growth with maintenance escalation)
  // The visual gap between the two lines is the "value gap" — what you keep.
  // When the API returns yearlyData, use it directly (exact resale from ML/parametric model).
  // Fallback uses a generic y1_drop + annual_decay parametric curve.
  // Prepend a Y0 acquisition row so the chart starts at the purchase point.
    // VinFast buyback guarantee is a FIXED window. Detect its last guaranteed year
    // from the raw floors: schedule ratios (0.914..1.0 for the 5-yr ramp; flat 1.0
    // for the 3-yr liquidity floor) are all > the decay ratio 1-0.095=0.905, so the
    // window ends at the first year whose floor-to-previous-floor ratio <= 0.905.
    // baseLineData / lineData are memoized so the chart does NOT redraw on every
    // unrelated state change (typing in other inputs, hovers) — only when the
    // underlying yearly curve or the committed result actually changes.
    const baseLineData = useMemo((): { year: string; resale: number; operating: number; cumulative: number; guarantee?: number | null }[] => {
      if (!yearlyData?.yearly) {
        if (!result) return []
        return Array.from({ length: years }, (_, i) => {
          const year = i + 1
          const annualFuel = result.result.fuel / years
          const annualMaintBase = result.result.maint / years
          const annualLegal = result.result.legal / years
          const annualParking = result.result.parking_toll.total_over_period / years

          // Maintenance escalates with vehicle age (~15% per year, mirrors backend)
          let cumulativeOperating = 0
          for (let y = 1; y <= year; y++) {
            const ageFactor = 1.0 + 0.15 * (y - 1)
            cumulativeOperating += annualFuel + annualMaintBase * ageFactor + annualLegal + annualParking
          }

          // Non-linear depreciation: steeper in year 1, then exponential decay
          // Mirrors backend parametric: y1_drop=0.20, annual_decay=0.15
          const y1Drop = 0.20
          const annualDecay = 0.15
          const retention =
            year === 1
              ? 1 - y1Drop
              : (1 - y1Drop) * Math.pow(1 - annualDecay, year - 1)
          const resaleAtYear = result.result.price * retention

          const cumulativeTco = result.result.on_road + cumulativeOperating - resaleAtYear

          return {
            year: String(year),
            resale: Math.round(resaleAtYear),
            operating: Math.round(cumulativeOperating),
            cumulative: Math.round(cumulativeTco),
          }
        })
      }

      const rawFloors = yearlyData.yearly.map((e: YearlyBreakdownEntry) => e.resale_guarantee_value)
      let vfWindowEnd = rawFloors.length
      for (let k = 1; k < rawFloors.length; k++) {
        const cur = rawFloors[k], prev = rawFloors[k - 1]
        if (cur != null && prev != null && prev > 0 && cur / prev <= 1 - 0.095 + 1e-9) { vfWindowEnd = k; break }
      }

      return yearlyData.yearly.map((entry: YearlyBreakdownEntry, i) => ({
        year: entry.year_label,
        resale: entry.resale,
        // VinFast buyback guarantee is a FIXED window: the per-year floor is the guarantee
        // ONLY inside it; past it (S10 post-window decay, config.py
        // VINFAST_FLOOR_DECAY=0.095) there is no buyback promise, so the dashed floor
        // line terminates at the window end and the green market-resale line continues
        // (merge into the main line where support ends). vfWindowEnd (above) is the
        // first post-window year; keep the floor only where i < vfWindowEnd.
        guarantee:
          entry.resale_guarantee_value != null && i < vfWindowEnd
            ? entry.resale_guarantee_value
            : null,
        operating: entry.operating_cumulative,
        cumulative: entry.cumulative_tco,
      }))
    }, [yearlyData, result, years])

  // Y0 = acquisition point: full car value, zero operating, net TCO = on_road - price
    const lineData = useMemo((): { year: string; resale: number; operating: number; cumulative: number; guarantee?: number | null }[] => result
    ? [{
        year: 'Y0',
        resale: result.result.price,
        operating: 0,
        cumulative: Math.round(result.result.on_road - result.result.price),
      }, ...baseLineData]
    : baseLineData, [result, baseLineData])

    return (
    <div className="space-y-4">
      <JsonLd data={breadcrumbLd([
        { name: t('nav.home'), url: SITE_URL },
        { name: t('tco.title'), url: `${SITE_URL}/tco` },
      ])} />
      {/* C7/E1 — visible keyword h1 at the top of the page content */}
      <h1 className="text-3xl md:text-4xl font-heading font-bold text-[var(--text-primary)] mb-1">{t('tco.title')}</h1>
      {/* SoftwareApplication — identifies the TCO calculator as a web app for AEO */}
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: t('tco.title'),
        url: `${SITE_URL}/tco`,
        applicationCategory: 'AutomotiveApplication',
        operatingSystem: 'Web browser',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'VND',
        },
        inLanguage: locale,
      }} />
      {/* Floating warning notifications — surfaces when resale predictions
          fall back to parametric modeling (years beyond ML training range)
          for regular cars, or when a custom car is used (no ML data). */}
      <AnimatePresence>
        {showResaleWarning && (
          <motion.div
            className="fixed top-20 left-1/2 -translate-x-1/2 max-w-md px-4 py-2.5 rounded-lg bg-[rgba(var(--color-warning-rgb),0.1)] border border-[rgba(var(--color-warning-rgb),0.3)] text-[var(--color-warning)] text-sm font-medium z-50 shadow-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5.5l7 12a1 1 0 01-.866 1.5H4.866a1 1 0 01-.866-1.5l7-12z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
              <span>
                {t('resale.fallbackToParametric', { maxYear: mlMaxYear ?? displayedYears })}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {customCarWarning && (
          <motion.div
            className="fixed top-20 left-1/2 -translate-x-1/2 max-w-md px-4 py-2.5 rounded-lg bg-[rgba(var(--color-warning-rgb),0.1)] border border-[rgba(var(--color-warning-rgb),0.3)] text-[var(--color-warning)] text-sm font-medium z-50 shadow-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5.5l7 12a1 1 0 01-.866 1.5H4.866a1 1 0 01-.866-1.5l7-12z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
              </svg>
              <span>
                {t('resale.customCarNoMl')}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Inputs */}
        <div className="lg:col-span-1 space-y-3">
          <GlassCard
            className="p-4 space-y-3"
          >
            <CarSearchSelect
              label={t('tco.searchCar')}
              value={selectedCar}
              onChange={setSelectedCar}
              cars={allCars}
              searchPlaceholder={t('tco.searchPlaceholder')}
              chooseLabel={t('tco.chooseCar')}
            />

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="tco-city">{t('tco.city')}</label>
              <select
                id="tco-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                                className="w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/50 transition-colors"
                aria-label={t('tco.city')}
              >
                {cities?.map(c => (
                  <option key={c.name} value={slugifyCity(c.name)}>
                    {toTitleCase(c.diacritic)}
                 </option>
                ))}
             </select>
            </div>

            <div>
              <div className={km > 50000 ? 'ring-1 ring-danger/60 rounded-lg px-1 pt-1' : ''}>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="tco-km">
                  {t('tco.annualKm')}: <PressToEditNumber value={km} min={1000} max={100000} step={1000} onSave={setKm} format={(v) => v.toLocaleString()} ariaLabel={t('tco.annualKm')} />
                </label>
                <input
                  id="tco-km"
                  type="range"
                  min="1000"
                  max="100000"
                  step="1000"
                  value={km}
                  onChange={(e) => setKm(Number(e.target.value))}
                  className={'w-full ' + (km > 100000 ? 'slider-overflow' : '')}
                  style={{ ...sliderStyle(km, 1000, 100000), ...(km > 100000 ? { '--slider-fill': 'var(--danger)' } : {}) }}
                  aria-valuenow={km}
                  aria-valuemin={1000}
                  aria-valuemax={100000}
                  aria-valuetext={km.toLocaleString() + ' km'}
                  aria-label={t('tco.annualKm')}
                />
              </div>
           </div>

            <div>
              <div className={years > 10 ? 'ring-1 ring-danger/60 rounded-lg px-1 pt-1' : ''}>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="tco-years">
                  {t('tco.years')}: <PressToEditNumber value={years} min={1} max={20} step={1} onSave={setYears} ariaLabel={t('tco.years')} />
                </label>
                <input
                  id="tco-years"
                  type="range"
                  min="1"
                  max="20"
                  step="1"
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className={'w-full ' + (years > 20 ? 'slider-overflow' : '')}
                  style={{ ...sliderStyle(years, 1, 20), ...(years > 20 ? { '--slider-fill': 'var(--danger)' } : {}) }}
                  aria-valuenow={years}
                  aria-valuemin={1}
                  aria-valuemax={20}
                  aria-valuetext={years + ' ' + t('unit.years')}
                  aria-label={t('tco.years')}
                />
              </div>
           </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="tco-ratio">
                {t('tco.cityDriving')}: <span className="font-mono text-accent">{cityRatio}%</span>
             </label>
              <input
                id="tco-ratio"
                type="range"
                min="0"
                max="100"
                step="5"
                value={cityRatio}
                onChange={(e) => setCityRatio(Number(e.target.value))}
                className="w-full"
                style={sliderStyle(cityRatio, 0, 100)}
                aria-valuenow={cityRatio}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={t('tco.cityDrivingAriaText', { value: cityRatio })}
                aria-label={t('tco.cityDriving')}
              />
              <div className="flex justify-between text-[11px] text-[var(--text-muted)] mt-1">
                <span>{t('tco.highwayOnly')}</span>
                <span>{t('tco.cityOnly')}</span>
             </div>
           </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="opp-cost"
              checked={showOppCost}
              onChange={(e) => setShowOppCost(e.target.checked)}
              className="w-4 h-4 flex-shrink-0 text-accent bg-[rgba(var(--bg-base-rgb),0.5)] border-[var(--border-default)] rounded focus:ring-accent/50"
            />
            <label htmlFor="opp-cost" className="text-sm text-[var(--text-primary)]">
              <span>{t('tco.oppCost')}</span>
              <span className="block text-[11px] text-[var(--text-muted)]">{t('tco.oppCostHint')}</span>
           </label>
         </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="rush-hour"
              checked={rushHour}
              onChange={(e) => setRushHour(e.target.checked)}
              className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent bg-[rgba(var(--bg-base-rgb),0.5)] border-[var(--border-default)] rounded focus:ring-accent/50"
            />
            <label htmlFor="rush-hour" className="text-sm text-[var(--text-primary)]">
              <span>{t('tco.rushHour')}</span>
              <span className="block text-[11px] text-[var(--text-muted)]">{t('tco.rushHourHint')}</span>
           </label>
         </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="ins-opt"
              checked={includeInsurance}
              onChange={(e) => setIncludeInsurance(e.target.checked)}
              className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent bg-[rgba(var(--bg-base-rgb),0.5)] border-[var(--border-default)] rounded focus:ring-accent/50"
            />
            <label htmlFor="ins-opt" className="text-sm text-[var(--text-primary)]">
              <span>{t('tco.physicalDamageInsurance')}</span>
              <span className="block text-[11px] text-[var(--text-muted)]">{t('tco.optionalInsuranceHint')}</span>
           </label>
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="parking-toll"
              checked={includeParkingToll}
              onChange={(e) => setIncludeParkingToll(e.target.checked)}
              className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent bg-[rgba(var(--bg-base-rgb),0.5)] border-[var(--border-default)] rounded focus:ring-accent/50"
            />
            <label htmlFor="parking-toll" className="text-sm text-[var(--text-primary)]">
              <span>{t('tco.parkingTollsToggle')}</span>
              <span className="block text-[11px] text-[var(--text-muted)]">{t('tco.parkingTollsHint')}</span>
            </label>
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="fuel-pricing"
              checked={useCurrentPrices}
              onChange={(e) => setUseCurrentPrices(e.target.checked)}
              aria-describedby="fuel-pricing-hint"
              className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent bg-[rgba(var(--bg-base-rgb),0.5)] border-[var(--border-default)] rounded focus:ring-accent/50"
            />
            <label htmlFor="fuel-pricing" className="text-sm text-[var(--text-primary)]">
              <span>{t('tco.currentFuelPrices')}</span>
              <span id="fuel-pricing-hint" className="block text-[11px] text-[var(--text-muted)]">{t('tco.currentFuelPricesHint')}</span>
            </label>
          </div>

          <AccentButton
            onClick={handleTcoPrimary}
            disabled={mutation.isPending || (!result && !selectedCar)}
            className="w-full"
          >
            {tcoPrimaryLabel}
          </AccentButton>

          {/* D6 — Reset demoted to a small secondary action (never the primary CTA) */}
          {result && (
            <button
              type="button"
              onClick={handleReset}
              className="w-full mt-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline underline-offset-2 transition-colors"
            >
              {t('tco.resetButton')}
            </button>
          )}

          <Link to={useLocalePath('/methodology')} className="block w-full">
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

          {/* TCO actions below the input card — only when results exist */}
          {result && (
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              <AccentButton
                variant="outline"
                onClick={async () => {
                  try {
                    await historyApi.saveHistory(
                      `${selectedCar}_${city}_${years}y`,
                      { type: 'single', car_id: selectedCar, city, km, years, result: result.result }
                    )
                    queryClient.invalidateQueries({ queryKey: ['history'] })
                    setSaved(true)
                    window.setTimeout(() => setSaved(false), 2000)
                  } catch {
                    setSaved(false)
                  }
                }}
              >
                {saved ? t('common.savedToHistory') : t('tco.saveToHistory')}
             </AccentButton>
                <Link to={useLocalePath('/compare') + '?car0=' + selectedCar + '&car1=fortuner_2026'}>
                <AccentButton variant="outline">
                  {t('tco.compareWith')}
                </AccentButton>
              </Link>
           </div>
          )}
       </div>

        {/* Results */}
        <div className="lg:col-span-2">
          {isCarsError && (
            <GlassCard className="p-3 border-danger/20 mb-3">
              <p className="text-danger text-sm" role="alert">{t('tco.errorCars')}{' '}
                <button onClick={() => refetchCars()} className="text-accent hover:text-accent-warm underline transition-colors">
                  {t('common.tryAgain')}
               </button>
             </p>
           </GlassCard>
          )}
          {mutation.isError && (
            <GlassCard className="p-3 border-danger/20" >
              <p className="text-danger text-sm" role="alert">{t('common.error')}: {mutation.error?.message}</p>
              <div className="flex flex-wrap gap-3 mt-3">
                <Link to={useLocalePath('/')} className="text-sm text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent/40 rounded">{t('nav.home')}</Link>
                <Link to={useLocalePath('/car')} className="text-sm text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent/40 rounded">{t('nav.browse')}</Link>
              </div>
            </GlassCard>
          )}

          {result && (
            <div className="space-y-3" role="status" aria-live="polite" aria-atomic="true">
{/* Car Image + Summary side by side */}
                <div className="flex flex-col md:flex-row gap-2 items-center">
                   {/* Car Image - slimmer */}
                    <div className="md:w-[20%]">
                      {resultCarInfo && (
                        <GlassCard className="p-1">
                          <CarMedia
                            carId={resultCarInfo.id}
                            type={resultCarInfo.type}
                            segment={resultCarInfo.segment}
                            car={resultCarInfo}
                            aspect="4 / 3"
                            priority
                            className="w-full h-full object-contain"
                          />
                       </GlassCard>
                      )}
                   </div>

                  {/* Summary Info - wider */}
                  <div className="md:w-[80%]">
                     <GlassCard glow className="p-2 pl-4">
                       <div className="flex justify-between items-center mb-3">
                          <h2 className="text-base md:text-lg font-heading font-bold text-[var(--text-primary)] whitespace-nowrap ml-1">
                            {resultCarInfo?.brand} {resultCarInfo?.model}
                         </h2>
                           <div className="flex gap-2 items-center">
                             <DropdownMenu
                               trigger={
                                 <button
                                   type="button"
                                   className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
                                   aria-label={t('tco.moreActions')}
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
                                  {csvExported ? t('tco.exported') : t('tco.exportCsv')}
                                </button>
                               <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleCopyLink}>
                                {linkCopied ? t('tco.shareUrlCopied') : t('tco.copyLink')}
                                </button>
                                <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleCopySummary}>
                                  {summaryCopied ? t('tco.summaryCopied') : t('tco.copySummary')}
                                </button>
                                 <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleExportPdf} disabled={pdfState === 'exporting'}>
                                   {pdfState === 'exporting' ? '...' : pdfState === 'exported' ? t('tco.exported') : t('tco.exportPdf')}
                                 </button>
                              </DropdownMenu>
                              <AccentButton
                                variant="outline"
                                size="sm"
                                onClick={handleCopyLink}
                              >
                                {linkCopied ? t('tco.shareUrlCopied') : t('tco.share')}
                              </AccentButton>
                              <AccentButton
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById('loan-calculator')?.scrollIntoView({ behavior: 'smooth' })}
                              >
                                {t('tco.jumpToLoan')}
                             </AccentButton>
                             {(csvExported || pdfState === 'exported') && (
                               <span
                                 className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[var(--accent)] bg-[rgba(var(--accent-rgb),0.12)] border border-[rgba(var(--accent-rgb),0.25)]"
                                 role="status"
                                 aria-live="polite"
                                >
                                 <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                   <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                 </svg>
                                 {t('tco.exported')}
                               </span>
                             )}
                            </div>
                      </div>
                       <div className="flex flex-wrap justify-evenly items-center gap-x-3 gap-y-2 text-center">
                          <div className="flex-1 min-w-[110px]">
                            <div className="text-xs text-[var(--text-secondary)] mb-0.5">{t('tco.onRoadPrice')}</div>
                            <div className="text-lg font-bold font-mono text-[var(--text-primary)] leading-tight whitespace-nowrap">{formatVND(result.result.on_road)}</div>
                         </div>
                          <div className="flex-1 min-w-[110px]">
                              <div className="text-xs text-[var(--text-secondary)] mb-0.5">{t('tco.netTco')}</div>
                             <div className="text-lg font-bold font-mono accent-text leading-tight whitespace-nowrap">{formatVND(result.result.tco)}</div>
                             {result.result.confidence_low != null && result.result.confidence_high != null && (
                               <div className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                                  {formatVND(result.result.confidence_low)} – {formatVND(result.result.confidence_high)}
                               </div>
                              )}
                          </div>
                          {showOppCost && (
                            <div className="flex-1 min-w-[110px]">
                              <div className="text-xs text-[var(--text-secondary)] mb-0.5">{t('tco.trueImpact')}</div>
                               <div className="text-lg font-bold font-mono text-[var(--text-primary)] leading-tight whitespace-nowrap">{formatVND(result.result.true_financial_impact)}</div>
                            </div>
                           )}
                          <div className="flex-1 min-w-[110px]">
                            <div className="text-xs text-[var(--text-secondary)] mb-0.5">{t('tco.monthly')}</div>
                            <div className="text-lg font-bold font-mono text-[var(--text-primary)] leading-tight whitespace-nowrap">{formatVND(result.result.monthly)}</div>
                         </div>
                       </div>
                     </GlassCard>
                 </div>
               </div>

                             {/* E2 — charts are lazy-loaded so recharts stays out of the initial bundle */}
                <Suspense fallback={<GlassCard className="p-6"><div className="h-[250px] w-full"><Skeleton className="h-[250px] w-full" /></div></GlassCard>}>
                  <TcoCharts pieData={pieData} lineData={lineData} displayedYears={displayedYears} result={result} yearlyLoading={yearlyLoading} />
               </Suspense>


              {/* Cost Breakdown — three collapsible sections */}
              <GlassCard className="p-6">
                <h3 className="text-lg font-heading font-semibold text-[var(--text-primary)] mb-4">{t('tco.costBreakdown')}</h3>
                <div className="space-y-4">
                  {/* Acquisition section */}
                  <div className="border border-[var(--border-default)] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('acquisition')}
                      className="w-full flex justify-between items-center px-4 py-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] transition-colors text-left cursor-pointer"
                      aria-expanded={sectionsOpen.acquisition}
                      aria-controls="tco-section-acquisition"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                         <span aria-hidden="true" className={'transition-transform text-accent ' + (sectionsOpen.acquisition ? 'rotate-0' : '-rotate-90')}>▾</span>
                        {t('tco.sectionAcquisition')}
                      </span>
                      <span className="text-sm font-mono accent-text font-semibold">{formatVND(acquisitionSubtotal)}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {sectionsOpen.acquisition && (
                        <motion.div
                          id="tco-section-acquisition"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-4 py-3 space-y-2 border-t border-[var(--border-subtle)]">
                            {acquisitionItems.map((item, i) => (
                              <div key={i} className="flex justify-between items-center">
                                <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                                <span className="text-sm font-mono text-[var(--text-primary)]">{formatVND(item.value)}</span>
                              </div>
                            ))}
                            {breakdown?.registration && (
                              <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                                <div className="text-xs uppercase tracking-wide text-[var(--text-muted)] mb-2 px-1">
                                  {t('tco.regTaxRate')}
                               </div>

                                {/* Vietnamese cost-line signature — each row tagged with
                                    a category color so the uniquely-local math (Thuế /
                                    Biển số / Đăng kiểm / Phí đường bộ / Bảo hiểm TNDS /
                                    Giá lăn bánh) reads as the second visual signature
                                    alongside the wireframe car. */}
                                <div className="space-y-0.5">
                                  <RegLineItem
                                    label={t('tco.regTax')}
                                    value={formatVND(breakdown.registration.tax)}
                                    accentVar="--accent"
                                  />
                                  <RegLineItem
                                    label={t('tco.regPlateFee')}
                                    value={formatVND(breakdown.registration.plate)}
                                    accentVar="--accent-warm"
                                  />
                                  <RegLineItem
                                    label={t('tco.regInspection')}
                                    value={formatVND(breakdown.registration.inspection)}
                                    accentVar="--accent-cold"
                                  />
                                  <div className="my-1.5 border-t border-[var(--border-subtle)]" />
                                  <RegLineItem
                                    label={t('tco.regTotal')}
                                    value={formatVND(breakdown.registration.total - breakdown.registration.road_fee - breakdown.registration.insurance)}
                                    accentVar="--accent"
                                    bold
                                  />
                                  <RegLineItem
                                    label={t('tco.regRoadFee')}
                                    value={formatVND(breakdown.registration.road_fee)}
                                    accentVar="--accent-speed"
                                  />
                                  <RegLineItem
                                    label={t('tco.regInsurance')}
                                    value={formatVND(breakdown.registration.insurance)}
                                    accentVar="--accent-warm"
                                  />

                                  {/* On-road total — visual hero of the acquisition block */}
                                  <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-[rgba(var(--accent-rgb),0.08)] to-transparent border border-[rgba(var(--accent-rgb),0.2)]">
                                    <div className="flex justify-between items-center">
                                      <span className="text-sm font-semibold accent-text">{t('tco.onRoadTotal')}</span>
                                      <span className="text-base font-mono font-bold accent-text">{formatVND(breakdown.registration.on_road)}</span>
                                   </div>
                                 </div>
                               </div>
                            </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Operations section */}
                  <div className="border border-[var(--border-default)] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('operations')}
                      className="w-full flex justify-between items-center px-4 py-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] transition-colors text-left cursor-pointer"
                      aria-expanded={sectionsOpen.operations}
                      aria-controls="tco-section-operations"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                         <span aria-hidden="true" className={'transition-transform text-accent ' + (sectionsOpen.operations ? 'rotate-0' : '-rotate-90')}>▾</span>
                        {t('tco.sectionOperations')}
                      </span>
                      <span className="text-sm font-mono accent-text font-semibold">{formatVND(operationsSubtotal)}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {sectionsOpen.operations && (
                        <motion.div
                          id="tco-section-operations"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-4 py-3 space-y-2 border-t border-[var(--border-subtle)]">
                            {/* Fuel row — top-level operations line item */}
                            {operationsItems[0] && (
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-[var(--text-secondary)]">{operationsItems[0].label}</span>
                                <span className="text-sm font-mono text-[var(--text-primary)]">{formatVND(operationsItems[0].value)}</span>
                              </div>
                            )}
                            {/* Fuel breakdown — nested collapsible under the fuel row */}
                            {breakdown?.fuel && (
                              <div className="ml-1">
                                <button
                                  type="button"
                                  onClick={() => setFuelDetailOpen((v) => !v)}
                                  aria-expanded={fuelDetailOpen}
                                  aria-controls="tco-fuel-detail"
                                  className="w-full flex justify-between items-center text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer py-1"
                                >
                                  <span className="flex items-center gap-1.5">
                                     <span aria-hidden="true" className={'transition-transform text-accent ' + (fuelDetailOpen ? 'rotate-0' : '-rotate-90')}>▾</span>
                                    {t('tco.howFuelCalculated')}
                                  </span>
                                </button>
                                <AnimatePresence initial={false}>
                                  {fuelDetailOpen && (
                                    <motion.div
                                      id="tco-fuel-detail"
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="pt-1 pb-2 pl-6 space-y-1.5">
                                        <div className="flex justify-between text-sm">
                                          <span className="text-[var(--text-muted)]">{t('tco.fuelConsumption')}</span>
                                          <span className="font-mono text-[var(--text-secondary)]">{breakdown.fuel.consumption?.toFixed(2)} {fuelUnit}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                          <span className="text-[var(--text-muted)]">{t('tco.fuelAdjusted')}</span>
                                          <span className="font-mono text-[var(--text-secondary)]">{breakdown.fuel.adjusted_consumption?.toFixed(2)} {fuelUnit}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                          <span className="text-[var(--text-muted)]">{t('tco.fuelPrice')}</span>
                                          <span className="font-mono text-[var(--text-secondary)]">{breakdown.fuel.price_label}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                          <span className="text-[var(--text-muted)]">{t('tco.fuelAnnual')}</span>
                                          <span className="font-mono text-[var(--text-secondary)]">{formatVND(breakdown.fuel.annual_fuel)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm pt-1.5 border-t border-[var(--border-subtle)]">
                                          <span className="text-[var(--text-secondary)] font-medium">{t('tco.fuelTotal')}</span>
                                          <span className="font-mono text-[var(--text-secondary)] font-semibold">{formatVND(breakdown.fuel.total_fuel)}</span>
                                        </div>
                                        {/* F — EV charge-vs-fuel comparison (nested row, no new section) */}
                                        {selectedCarInfo?.type === 'EV' && (() => {
                                          const kwhPer100 = breakdown.fuel.consumption ?? 0
                                          const evCharge5y = Math.round(displayedKm * displayedYears * (kwhPer100 / 100) * EV_CHARGING_PRICE_VND_PER_KWH)
                                          const iceFuel5y = Math.round(displayedKm * displayedYears * (EV_ICE_REFERENCE_L_PER_100KM / 100) * EV_REFERENCE_PETROL_VND_PER_L)
                                          const savings = iceFuel5y - evCharge5y
                                          return (
                                            <div className="pt-2 mt-1.5 border-t border-[var(--border-subtle)] space-y-1">
                                              <div className="text-xs font-medium accent-text">{t('tco.evChargeCompare', { years: displayedYears })}</div>
                                              <div className="text-sm text-[var(--text-secondary)]">{t('tco.evCharge5y', { years: displayedYears, amount: formatVND(evCharge5y) })}</div>
                                              <div className="text-sm text-[var(--text-secondary)]">{t('tco.evChargeIceEquivalent', { ref: EV_ICE_REFERENCE_L_PER_100KM, amount: formatVND(iceFuel5y) })}</div>
                                              <div className="text-sm text-[var(--text-secondary)] font-semibold accent-text">{t('tco.evChargeSavings', { amount: formatVND(savings) })}</div>
                                              <div className="text-xs text-[var(--text-muted)] italic">{t('tco.evChargeDisclaimer')}</div>
                                            </div>
                                          )
                                        })()}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}
                            {/* Remaining operations line items: maintenance, insurance, optional, parking */}
                            {operationsItems.slice(1).map((item, i) => (
                              <div key={i}>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                                  <span className="text-sm font-mono text-[var(--text-primary)]">{formatVND(item.value)}</span>
                                </div>
                                {/* Insurance & Fees breakdown — nested collapsible mirroring the
                                    fuel breakdown. The recurring `legal` total (road fee +
                                    civil insurance + periodic inspection) is decomposed so
                                    the user can inspect what the aggregate hides. */}
                                {item.isInsurance && breakdown?.registration && result && (
                                  <div className="ml-1">
                                    <button
                                      type="button"
                                      onClick={() => setInsuranceDetailOpen((v) => !v)}
                                      aria-expanded={insuranceDetailOpen}
                                      aria-controls="tco-insurance-detail"
                                      className="w-full flex justify-between items-center text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer py-1"
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <span aria-hidden="true" className={'transition-transform text-accent ' + (insuranceDetailOpen ? 'rotate-0' : '-rotate-90')}>▾</span>
                                        {t('tco.howInsuranceCalculated')}
                                      </span>
                                    </button>
                                    <AnimatePresence initial={false}>
                                      {insuranceDetailOpen && (
                                        <motion.div
                                          id="tco-insurance-detail"
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.2 }}
                                          className="overflow-hidden"
                                        >
                                          <div className="pt-1 pb-2 pl-6 space-y-1.5">
                                            <div className="flex justify-between text-sm">
                                              <span className="text-[var(--text-muted)]">{t('tco.roadFeeAnnual')}</span>
                                              <span className="font-mono text-[var(--text-secondary)]">{formatVND(breakdown.registration.road_fee)} × {Math.max(0, displayedYears - 1)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                              <span className="text-[var(--text-muted)]">{t('tco.civilInsuranceAnnual')}</span>
                                              <span className="font-mono text-[var(--text-secondary)]">{formatVND(breakdown.registration.insurance)} × {Math.max(0, displayedYears - 1)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                              <span className="text-[var(--text-muted)]">{t('tco.periodicInspectionBreakdown')}</span>
                                              <span className="font-mono text-[var(--text-secondary)]">{formatVND(result.result.inspection_periodic ?? 0)}</span>
                                            </div>
                                            <div className="flex justify-between text-sm pt-1.5 border-t border-[var(--border-subtle)]">
                                              <span className="text-[var(--text-secondary)] font-medium">{t('tco.insuranceFeesTotal')}</span>
                                              <span className="font-mono text-[var(--text-secondary)] font-semibold">{formatVND(result.result.legal)}</span>
                                            </div>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                )}
                              </div>
                            ))}
                            {showOppCost && (
                              <div className="flex justify-between items-center pt-1.5 border-t border-[var(--border-subtle)]">
                                <span className="text-sm text-[var(--text-secondary)]">{t('tco.opportunityCost')}</span>
                                <span className="text-sm font-mono text-[var(--text-primary)]">{formatVND(result.result.opp_cost)}</span>
                              </div>
                            )}
                            {/* Operations Total — visual hero of the operations block */}
                            <div className="mt-3 p-3 rounded-lg bg-gradient-to-r from-[rgba(var(--accent-rgb),0.08)] to-transparent border border-[rgba(var(--accent-rgb),0.2)]">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold accent-text">{t('tco.sectionOperationsTotal')}</span>
                                <span className="text-base font-mono font-bold accent-text">{formatVND(operationsSubtotal)}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Depreciation & Resale section */}
                  <div className="border border-[var(--border-default)] rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('depreciation')}
                      className="w-full flex justify-between items-center px-4 py-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] transition-colors text-left cursor-pointer"
                      aria-expanded={sectionsOpen.depreciation}
                      aria-controls="tco-section-depreciation"
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                         <span aria-hidden="true" className={'transition-transform text-accent ' + (sectionsOpen.depreciation ? 'rotate-0' : '-rotate-90')}>▾</span>
                        {t('tco.sectionDepreciation')}
                      </span>
                        <span className={'text-sm font-mono font-semibold ' + (depreciationNet < 0 ? 'text-success' : 'accent-text')}>{formatVND(depreciationNet)}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {sectionsOpen.depreciation && (
                        <motion.div
                          id="tco-section-depreciation"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="px-4 py-3 space-y-2 border-t border-[var(--border-subtle)]">
                            {depreciationItems.map((item, i) => (
                              <div key={i} className="flex justify-between items-start">
                                <span className={item.guaranteeFloor ? 'text-sm text-[var(--text-muted)]' : 'text-sm text-[var(--text-secondary)]'}>
                                  {item.guaranteeFloor && <span aria-hidden="true" className="mr-1">🔒</span>}
                                  {item.label}
                                  {item.guaranteeFloor && (
                                    <span className="block text-[10px] text-[var(--text-muted)] mt-1">
                                      {result.result.resale_guarantee_floor != null && result.result.resale_guarantee_floor < result.result.resale
                                        ? t('tco.guaranteeFloorBelowMarket')
                                        : t('tco.guaranteeFloorCaption')}
                                    </span>
                                  )}
                                  {item.ml && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-accent">
                                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                                      {t('compare.mlBadge')}
                                    </span>
                                  )}
                                  {item.parametric && !item.ml && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-[var(--text-muted)]">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
                                      {t('compare.parametricBadge')}
                                    </span>
                                  )}
                                  {item.ml && result.result.resale_spread != null && (
                                    <span className="block text-[10px] text-[var(--text-secondary)] mt-0.5">
                                      {formatVND(result.result.resale - result.result.resale_spread / 2)} – {formatVND(result.result.resale + result.result.resale_spread / 2)}
                                   </span>
                                  )}
                                  {item.showNote && result.result.resale_note_key && (
                                    <span className="block text-xs text-[var(--text-muted)] mt-1">{t(result.result.resale_note_key)}</span>
                                  )}
                               </span>
                                 <span className={'text-sm font-mono ' + (item.isNegative ? 'text-success' : 'text-[var(--text-primary)]')}>
                                  {formatVND(item.value)}
                               </span>
                             </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Net TCO footer — same as before, anchored to the bottom */}
                  <div className="border-t border-[var(--border-default)] pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-accent font-semibold">{t('tco.netTco')}</span>
                      <span className="text-accent font-bold text-xl font-mono">{formatVND(result.result.tco)}</span>
                    </div>
                    {result.result.confidence_low != null && result.result.confidence_high != null && (
                      <div className="mt-2 text-center">
                        <div className="text-xs text-[var(--text-secondary)] mb-1">{t('tco.confidenceRange')}</div>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm font-mono text-[var(--text-primary)]">{formatVND(result.result.confidence_low)}</span>
                          <span className="text-xs text-[var(--text-secondary)]">–</span>
                          <span className="text-sm font-mono text-[var(--text-primary)]">{formatVND(result.result.confidence_high)}</span>
                          <span className="text-xs text-[var(--text-secondary)]">(95%)</span>
                       </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">{t('tco.ciExplainer')}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">{t('tco.ciDisclaimer')}</div>
                     </div>
                    )}
                  </div>
                </div>

                {/* Legal stamp — fee basis per Thông tư 155/2025 (plan §B) */}
                {assumptionsMeta?.last_updated && (
                  <div className="mt-3 text-center noprint">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-[var(--border-default)] text-[var(--text-muted)]">
                      {t('tco.legalStamp').replace('{date}', new Date(assumptionsMeta?.last_updated ?? '').toLocaleDateString())}
                    </span>
                  </div>
                )}

                {/* Data freshness badge — pill style matching landing trust badges */}
                {daysSinceUpdate != null && (
                  <div className="mt-4 text-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      <span className="text-accent" aria-hidden="true">✓</span>
                      {assumptionsMeta?.data_stale
                        ? t('common.dataStale').replace('{days}', String(daysSinceUpdate))
                        : t('common.dataCurrent')}
                    </span>
                  </div>
                )}

                {/* On-road vs 5-year TCO — two-bar visual (plan §A) */}
                <div className="mt-6">
                  <CostBars
                    onRoad={result.result.on_road}
                    tco={result.result.tco}
                    labels={{
                      onRoad: t('tco.tcoVsOnRoad'),
                      fiveYearTco: t('tco.netTco'),
                    }}
                  />
                  <SocialProofLine localeKey="tco" skeleton carId={result.car_id} onRoad={result.result.on_road} tco={result.result.tco} />
                </div>
               </GlassCard>

               {/* G — inline explainers (plan §G), gated on phase 1 */}
               {phase1 && (
                 <details className="noprint bg-[var(--glass-bg)]/60 border border-[var(--border-subtle)] rounded-lg p-3 mb-2">
                   <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] list-none flex items-center justify-between">
                     <span>{t('tco.explainTco')}</span>
                     <span className="text-[var(--text-muted)]" aria-hidden="true">▼</span>
                   </summary>
                   <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('tco.explainTcoBody')}</p>
                 </details>
               )}
               {phase1 && (
                 <details className="noprint bg-[var(--glass-bg)]/60 border border-[var(--border-subtle)] rounded-lg p-3 mb-2">
                   <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] list-none flex items-center justify-between">
                     <span>{t('tco.explainResale')}</span>
                     <span className="text-[var(--text-muted)]" aria-hidden="true">▼</span>
                   </summary>
                   <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('tco.explainResaleBody')}</p>
                 </details>
               )}
               {phase1 && (
                 <details className="noprint bg-[var(--glass-bg)]/60 border border-[var(--border-subtle)] rounded-lg p-3 mb-2">
                   <summary className="cursor-pointer text-sm font-medium text-[var(--text-primary)] list-none flex items-center justify-between">
                     <span>{t('tco.explainMl')}</span>
                     <span className="text-[var(--text-muted)]" aria-hidden="true">▼</span>
                   </summary>
                   <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('tco.explainMlBody')}</p>
                 </details>
               )}

               {/* Loan Calculator Section */}
              <GlassCard id="loan-calculator" className="p-6 scroll-mt-4">
                <button
                  onClick={() => setShowLoan(!showLoan)}
                  className="w-full flex justify-between items-center text-left cursor-pointer"
                  aria-expanded={showLoan}
                >
                  <div>
                    <h3 className="text-lg font-heading font-semibold text-[var(--text-primary)]">{t('tco.loanSection')}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{t('tco.loanSectionDesc')}</p>
                 </div>
                  <span className="text-accent text-2xl">{showLoan ? '−' : '+'}</span>
               </button>

                {showLoan && (
                  <div className="mt-6 space-y-5">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                <label className="block text-sm text-[var(--text-primary)] mb-2" htmlFor="loan-down">
                  {t('loan.downPayment')}: <span className="font-mono text-accent">{loanDownPct}%</span>
               </label>
                        <input
                          id="loan-down"
                          type="range"
                          min="0"
                          max="90"
                          step="5"
                          value={loanDownPct}
                          onChange={(e) => setLoanDownPct(Number(e.target.value))}
                          className="w-full"
                          style={sliderStyle(loanDownPct, 0, 90)}
                          aria-valuenow={loanDownPct}
                          aria-valuemin={0}
                          aria-valuemax={90}
                           aria-valuetext={loanDownPct + '%'}
                          aria-label={t('loan.downPayment')}
                        />
                     </div>
                      <div>
                <label className="block text-sm text-[var(--text-primary)] mb-2" htmlFor="loan-rate">
                  {t('loan.interestRate')}: <span className="font-mono text-accent">{loanRate}%</span>
               </label>
                        <input
                          id="loan-rate"
                          type="range"
                          min="0"
                          max="20"
                          step="0.5"
                          value={loanRate}
                          onChange={(e) => setLoanRate(Number(e.target.value))}
                          className="w-full"
                          style={sliderStyle(loanRate, 0, 20)}
                          aria-valuenow={loanRate}
                          aria-valuemin={0}
                          aria-valuemax={20}
                           aria-valuetext={loanRate + '%'}
                          aria-label={t('loan.interestRate')}
                        />
                     </div>
                      <div>
                <label className="block text-sm text-[var(--text-primary)] mb-2" htmlFor="loan-term">
                  {t('loan.loanTerm')}: <span className="font-mono text-accent">{loanTerm}Y</span>
                </label>
                        <input
                          id="loan-term"
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={loanTerm}
                          onChange={(e) => setLoanTerm(Number(e.target.value))}
                          className="w-full"
                          style={sliderStyle(loanTerm, 1, 10)}
                          aria-valuenow={loanTerm}
                          aria-valuemin={1}
                          aria-valuemax={10}
                           aria-valuetext={loanTerm + ' ' + t('unit.years')}
                          aria-label={t('loan.loanTerm')}
                        />
                     </div>
                   </div>

                    {loanResult && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-[var(--border-default)]">
                        <div>
                          <div className="text-xs text-[var(--text-secondary)] mb-1">{t('loan.loanAmount')}</div>
                          <div className="text-sm font-mono text-[var(--text-primary)]">{formatVND(loanResult.loan_amount)}</div>
                       </div>
                        <div>
                          <div className="text-xs text-[var(--text-secondary)] mb-1">{t('loan.monthlyPayment')}</div>
                          <div className="text-sm font-mono accent-text font-bold">{formatVND(loanResult.monthly_payment)}</div>
                       </div>
                        <div>
                          <div className="text-xs text-[var(--text-secondary)] mb-1">{t('loan.totalInterest')}</div>
                          <div className="text-sm font-mono text-[var(--text-primary)]">{formatVND(loanResult.total_interest)}</div>
                       </div>
                        <div>
                          <div className="text-xs text-[var(--text-secondary)] mb-1">{t('loan.totalRepayment')}</div>
                          <div className="text-sm font-mono text-[var(--text-primary)]">{formatVND(loanResult.total_repayment)}</div>
                       </div>
                        <div>
                          <div className="text-xs text-[var(--text-secondary)] mb-1">{t('loan.effectiveCost')}</div>
                          <div className="text-sm font-mono text-[var(--text-primary)]">{formatVND(loanResult.effective_cost)}</div>
                       </div>
                     </div>
                    )}
                 </div>
                )}
             </GlassCard>


           </div>
          )}

          {mutation.isPending && (
            <GlassCard className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent mb-3" />
              <p className="text-[var(--text-secondary)] text-sm">{t('tco.calculating')}</p>
           </GlassCard>
          )}

          {!result && !mutation.isError && !mutation.isPending && (
            <GlassCard className="p-16 text-center">
              <div className="text-[var(--text-secondary)] text-lg mb-6">
                {!selectedCar ? t('tco.emptyStateWithCarPrompt') : t('tco.emptyStateCarSelected')}
             </div>
              <p className="text-[var(--text-muted)] text-sm">
                {t('tco.carNotFoundTipPrefix')}{' '}
                <Link
                  to={useLocalePath('/car')}
                  className="text-accent font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-accent/40 rounded"
                >
                  {t('tco.carNotFoundTipLink')}
               </Link>
             </p>
           </GlassCard>
          )}

          {/* C2 — page-specific FAQ (server-rendered, indexable) */}
          <section className="max-w-3xl mx-auto pt-4">
            <h2 className="text-2xl md:text-3xl font-heading font-bold text-center text-[var(--text-primary)] mb-8">{t('tco.faqTitle')}</h2>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <details key={n} className="bg-[var(--glass-bg)]/60 border border-[var(--border-subtle)] rounded-lg p-3">
                  <summary className="cursor-pointer font-medium text-[var(--text-primary)] list-none flex items-center justify-between">
                    <span>{t(`tco.faqQ${n}`)}</span>
                    <span className="text-[var(--text-muted)]" aria-hidden="true">▼</span>
                  </summary>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{t(`tco.faqA${n}`)}</p>
                </details>
              ))}
            </div>
          </section>
          <JsonLd data={{
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            inLanguage: locale,
            mainEntity: [1, 2, 3, 4, 5, 6].map(n => ({
              '@type': 'Question',
              name: t(`tco.faqQ${n}`),
              acceptedAnswer: {
                '@type': 'Answer',
                text: t(`tco.faqA${n}`),
              },
            })),
          }} />
        </div>
      </div>

    </div>
   )
}
