import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts'
import { api, historyApi, formatVND, toTitleCase, configApi } from '../lib'
import type { CarInfo, TcoResponse, YearlyBreakdownEntry } from '../lib'
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

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)']

// Reference constants for the EV charge-vs-fuel comparison (plan §F). These
// mirror backend/src/config.py so the "ideal" comparison stays in sync with the
// rest of the TCO maths. The comparator shows what an equivalent petrol car
// (EV_ICE_REFERENCE_L_PER_100KM) would cost to fuel over the same distance.
const EV_CHARGING_PRICE_VND_PER_KWH = 3858 // config.py: EV_CHARGING_PRICE_VND (V-Green)
const EV_REFERENCE_PETROL_VND_PER_L = 22320 // config.py: PETROL_PRICE_CURRENT_VND
const EV_ICE_REFERENCE_L_PER_100KM = 8 // typical C-segment petrol baseline

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
      className={`flex justify-between items-center text-sm px-2 py-1.5 rounded-md hover:bg-[rgba(var(--bg-base-rgb),0.3)] transition-colors`}
    >
      <span className={`flex items-center gap-2 ${bold ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
        <span
          aria-hidden="true"
          className="w-1 h-4 rounded-full"
          style={{ backgroundColor: `var(${accentVar})` }}
        />
        {label}
    </span>
      <span className={`font-mono ${bold ? 'text-[var(--text-primary)] font-semibold' : 'text-[var(--text-secondary)]'}`}>
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
  cityRatio: 30,
  showOppCost: false,
  rushHour: false,
  includeInsurance: false,
  showLoan: false,
  loanDownPct: 30,
  loanRate: 8.5,
  loanTerm: 5,
} as const

// Imperative-free snapshot of every input that feeds a TCO calculation.
// We compare the live form state against the snapshot that produced the
// current result to decide whether the primary button should read
// Calculate / Reset / Recalculate. `city_ratio_pct` is stored as the
// integer 0–100 form (not the 0–1 fraction) to avoid float drift.
interface TcoInputSignature {
  car_id: string
  city: string
  km: number
  years: number
  city_ratio_pct: number
  show_opp_cost: boolean
  rush_hour: boolean
  include_insurance: boolean
}

function tcoInputsEqual(a: TcoInputSignature, b: TcoInputSignature): boolean {
  return (
    a.car_id === b.car_id &&
    a.city === b.city &&
    a.km === b.km &&
    a.years === b.years &&
    a.city_ratio_pct === b.city_ratio_pct &&
    a.show_opp_cost === b.show_opp_cost &&
    a.rush_hour === b.rush_hour &&
    a.include_insurance === b.include_insurance
  )
}

export default function TcoCalculator() {
  const { t, locale } = useI18n()
  const [searchParams] = useSearchParams()
  const phase1 = import.meta.env.VITE_COMPETITIVE_PHASE === '1'
  const variant = searchParams.get('v') ?? 'default'
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [pdfState, setPdfState] = useState<'idle' | 'exporting'>('idle')
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
  const [linkCopied, setLinkCopied] = useState(false)
  const [showLoan, setShowLoan] = useState<boolean>(DEFAULTS.showLoan)
  const [loanDownPct, setLoanDownPct] = useState<number>(DEFAULTS.loanDownPct)
  const [loanRate, setLoanRate] = useState<number>(DEFAULTS.loanRate)
  const [loanTerm, setLoanTerm] = useState<number>(DEFAULTS.loanTerm)
  const [loanResult, setLoanResult] = useState<any>(null)
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
    const meta = assumptionsMeta as Record<string, any> | null | undefined
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

  // Parameter-change tracking for the unified Calculate / Reset / Recalculate
  // button. The live form state is compared against the snapshot that produced
  // the current result. No change → "Reset"; any change → "Recalculate".
  const currentTcoInput: TcoInputSignature = {
    car_id: selectedCar,
    city,
    km,
    years,
    city_ratio_pct: cityRatio,
    show_opp_cost: showOppCost,
    rush_hour: rushHour,
    include_insurance: includeInsurance,
  }
  const committedTcoInput: TcoInputSignature | null = result
    ? {
        car_id: result.car_id,
        city: result.city,
        km: result.km,
        years: result.years,
        city_ratio_pct: Math.round((result.city_ratio ?? 0) * 100),
        show_opp_cost: result.show_opp_cost,
        rush_hour: result.rush_hour ?? false,
        include_insurance: result.include_insurance ?? false,
      }
    : null
  const tcoParamsChanged = !!committedTcoInput && !tcoInputsEqual(committedTcoInput, currentTcoInput)

  // Label mirrors the button's action so the UI and keyboard shortcut always agree.
  const tcoPrimaryLabel = mutation.isPending
    ? t('tco.calculating')
    : !result
      ? t('tco.calculate')
      : tcoParamsChanged
        ? t('tco.recalculate')
        : t('tco.resetButton')

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
    setLinkCopied(false)
    setShowLoan(DEFAULTS.showLoan)
    setLoanDownPct(DEFAULTS.loanDownPct)
    setLoanRate(DEFAULTS.loanRate)
    setLoanTerm(DEFAULTS.loanTerm)
    setLoanResult(null)
  }, [mutation, queryClient])

  // Verbose breakdown query — uses displayed* inputs so it does not refetch
  // as the form sliders move.
  const { data: breakdown } = useQuery({
    queryKey: ['tco-breakdown', displayedCarId, displayedCity, displayedKm, displayedYears, displayedRatio, rushHour],
    queryFn: () => api.getBreakdown({ car_id: displayedCarId!, city: displayedCity, km: displayedKm, years: displayedYears, city_ratio: displayedRatio, rush_hour: rushHour }),
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
    queryKey: ['tco-yearly', displayedCarId, displayedCity, displayedKm, displayedYears, displayedRatio, rushHour],
    queryFn: () => api.getYearlyBreakdown({ car_id: displayedCarId!, city: displayedCity, km: displayedKm, years: displayedYears, city_ratio: displayedRatio, rush_hour: rushHour }),
    enabled: !!result && !!selectedCar,
    staleTime: 60_000,
  })

  const handleCalculate = () => {
    if (!selectedCar) return
    mutation.mutate({
      car_id: selectedCar,
      city,
      km,
      years,
      city_ratio: cityRatio / 100,
      show_opp_cost: showOppCost,
      rush_hour: rushHour,
      include_insurance: includeInsurance,
    })
  }

  // Unified primary action: Reset when a result exists and nothing changed,
  // otherwise Calculate / Recalculate (same code path either way).
  const handleTcoPrimary = () => {
    if (mutation.isPending) return
    if (!selectedCar) return
    if (result && !tcoParamsChanged) {
      handleReset()
    } else {
      handleCalculate()
    }
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

  useEffect(() => {
    registerShortcutHandlers({
      onCalculate: () => {
        handleTcoPrimaryRef.current()
      },
    })
    return () => unregisterShortcutHandlers(['onCalculate'])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // Restore a shared scenario from the URL (deep link) — auto-calculate on first mount.
  useEffect(() => {
    if (searchParams.get('car') && selectedCar) {
      handleCalculate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
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
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setPdfState('idle')
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
    if (variant) params.set('v', variant)
    const url = `${window.location.origin}/tco?${params.toString()}`
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

  const selectedCarInfo = cars?.find(c => c.id === selectedCar)

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

  const acquisitionItems = result ? [
    { label: t('tco.msrp'), value: result.result.price },
    { label: t('tco.regTax'), value: result.result.reg_tax },
  ] : []

  const operationsItems = result ? [
    { label: t('tco.fuel'), value: result.result.fuel },
    { label: t('tco.maintenance'), value: result.result.maint },
    { label: t('tco.insurance'), value: result.result.legal },
    ...(result.result.insurance_optional
      ? [{ label: t('tco.physicalDamageInsurance'), value: result.result.insurance_optional }]
      : []),
    ...(result.result.inspection_periodic
      ? [{ label: t('tco.periodicInspection'), value: result.result.inspection_periodic }]
      : []),
    { label: t('tco.parkingTolls'), value: result.result.parking_toll.total_over_period },
  ] : []

  const depreciationItems = result ? [
    { label: t('tco.predictedResale'), value: result.result.resale, isNegative: true, ml: result.result.resale_logic === 'ml', showNote: true },
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
  const pieData = result ? [
    { name: t('tco.msrp'), value: Math.abs(result.result.price) },
    { name: t('tco.regTax'), value: Math.abs(result.result.reg_tax) },
    { name: t('tco.fuel'), value: Math.abs(result.result.fuel) },
    { name: t('tco.maintenance'), value: Math.abs(result.result.maint) },
    { name: t('tco.insurance'), value: Math.abs(result.result.legal) },
    ...(result.result.insurance_optional
      ? [{ name: t('tco.physicalDamageInsurance'), value: Math.abs(result.result.insurance_optional) }]
      : []),
    { name: t('tco.totalDepreciation'), value: Math.abs(result.result.depreciation) },
  ].filter(d => d.value > 0) : []

  // Chart data — two lines:
  //  - resale: car's residual value at each year (concave decline)
  //  - operating: cumulative operating costs at each year (linear growth with maintenance escalation)
  // The visual gap between the two lines is the "value gap" — what you keep.
  // When the API returns yearlyData, use it directly (exact resale from ML/parametric model).
  // Fallback uses a generic y1_drop + annual_decay parametric curve.
  // Prepend a Y0 acquisition row so the chart starts at the purchase point.
  const baseLineData: { year: string; resale: number; operating: number; cumulative: number }[] = yearlyData?.yearly
    ? yearlyData.yearly.map((entry: YearlyBreakdownEntry) => ({
        year: entry.year_label,
        resale: entry.resale,
        operating: entry.operating_cumulative,
        cumulative: entry.cumulative_tco,
      }))
    : result
      ? Array.from({ length: years }, (_, i) => {
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
      : []

  // Y0 = acquisition point: full car value, zero operating, net TCO = on_road - price
  const lineData: { year: string; resale: number; operating: number; cumulative: number }[] = result
    ? [{
        year: 'Y0',
        resale: result.result.price,
        operating: 0,
        cumulative: Math.round(result.result.on_road - result.result.price),
      }, ...baseLineData]
    : baseLineData

  return (
    <div className="space-y-4">
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
                                className="w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors"
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
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="tco-km">
                  {t('tco.annualKm')}: <PressToEditNumber value={km} min={1000} max={100000} step={1000} onSave={setKm} format={(v) => v.toLocaleString()} ariaLabel={t('tco.annualKm')} />
                </label>
                <input
                  id="tco-km"
                  type="range"
                  min="1000"
                  max="50000"
                  step="1000"
                  value={km}
                  onChange={(e) => setKm(Number(e.target.value))}
                  className={`w-full ${km > 50000 ? 'slider-overflow' : ''}`}
                  style={{ ...sliderStyle(km, 1000, 50000), ...(km > 50000 ? { '--slider-fill': 'var(--danger)' } : {}) }}
                  aria-valuenow={km}
                  aria-valuemin={1000}
                  aria-valuemax={50000}
                  aria-valuetext={`${km.toLocaleString()} km`}
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
                  max="10"
                  step="1"
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className={`w-full ${years > 10 ? 'slider-overflow' : ''}`}
                  style={{ ...sliderStyle(years, 1, 10), ...(years > 10 ? { '--slider-fill': 'var(--danger)' } : {}) }}
                  aria-valuenow={years}
                  aria-valuemin={1}
                  aria-valuemax={10}
                  aria-valuetext={`${years} ${t('unit.years')}`}
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

          <AccentButton
            onClick={handleTcoPrimary}
            disabled={mutation.isPending || (!result && !selectedCar)}
            className="w-full"
          >
            {tcoPrimaryLabel}
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

          {/* TCO actions below the input card — only when results exist */}
          {result && (
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              <AccentButton
                variant="outline"
                onClick={async () => {
                  await historyApi.saveHistory(
                    `${selectedCar}_${city}_${years}y`,
                    { type: 'single', car_id: selectedCar, city, km, years, result: result.result }
                  )
                  queryClient.invalidateQueries({ queryKey: ['history'] })
                }}
              >
                {t('tco.saveToHistory')}
             </AccentButton>
              <Link to={`/compare?car=${selectedCar}`}>
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
           </GlassCard>
          )}

          {result && (
            <div className="space-y-3" role="status" aria-live="polite" aria-atomic="true">
{/* Car Image + Summary side by side */}
                <div className="flex flex-col md:flex-row gap-2 items-center">
                   {/* Car Image - slimmer */}
                   <div className="md:w-[20%]">
                     {selectedCarInfo && (
                       <GlassCard className="p-1">
                         <CarMedia
                           carId={selectedCarInfo.id}
                           type={selectedCarInfo.type}
                           segment={selectedCarInfo.segment}
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
                           {selectedCarInfo?.brand} {selectedCarInfo?.model}
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
                                 {t('tco.exportCsv')}
                               </button>
                               <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleCopyLink}>
                                 {linkCopied ? t('tco.shareUrlCopied') : t('tco.copyLink')}
                               </button>
                               {phase1 && (
                                 <>
                                <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleCopySummary}>
                                  {summaryCopied ? t('tco.summaryCopied') : t('tco.copySummary')}
                                </button>
                                <button type="button" className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors truncate" onClick={handleExportPdf} disabled={pdfState === 'exporting'}>
                                  {pdfState === 'exporting' ? '...' : t('tco.exportPdf')}
                                </button>
                                 </>
                               )}
                             </DropdownMenu>
                             <AccentButton
                               variant="outline"
                               size="sm"
                               onClick={() => document.getElementById('loan-calculator')?.scrollIntoView({ behavior: 'smooth' })}
                             >
                               {t('tco.jumpToLoan')}
                            </AccentButton>
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

              {/* Visual Charts */}
              <GlassCard className="p-6">
                <h3 className="text-lg font-heading font-semibold text-[var(--text-primary)] mb-4">{t('tco.charts')}</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Pie chart - cost composition */}
                  <div>
                    <h4 className="text-sm text-accent mb-3">{t('tco.costComposition')}</h4>
                    <div role="img" aria-label={t('tco.costComposition')}>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="var(--chart-1)"
                          dataKey="value"
                        >
                          {pieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                      </Pie>
                        <Tooltip
                          formatter={(value: any) => formatVND(value)}
                          contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid rgba(var(--accent-rgb), 0.2)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        />
                    </PieChart>
                  </ResponsiveContainer>
                  </div>
                    {/* Screen-reader accessible data table — visual chart conveys
                        composition, but blind users need the actual numbers. */}
                    <table className="sr-only">
                       <caption>{t('tco.costComposition')}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t('compare.metric')}</th>
                          <th scope="col">{t('compare.amount')}</th>
                      </tr>
                    </thead>
                      <tbody>
                        {pieData.map((row, i) => (
                          <tr key={i}>
                            <th scope="row">{row.name}</th>
                            <td>{formatVND(row.value)}</td>
                        </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                  {/* Line chart - operating costs vs car value retention (two-line comparison) */}
                  <div>
                    <h4 className="text-sm text-accent mb-3">{t('tco.cumulativeCost')}</h4>
                    <div role="img" aria-label={`${t('tco.cumulativeCost')} over ${displayedYears} years`}>
                    {yearlyLoading ? (
                      <div className="relative h-[250px] w-full">
                        <Skeleton className="h-[250px] w-full" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
                        </div>
                      </div>
                    ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={lineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis dataKey="year" stroke="var(--text-secondary)" fontSize={12} />
                        <YAxis stroke="var(--text-secondary)" fontSize={12} tickFormatter={(v) => {
                          // Drop the stray "0M" tick at the origin — recharts renders the
                          // zero point with this formatter even when min is non-zero.
                          if (!v) return ''
                          return v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : `${Math.round(v / 1e6)}M`
                        }} />
                        <Tooltip
                          formatter={(value, name) => [formatVND(Number(value ?? 0)), String(name ?? '')]}
                          contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid rgba(var(--accent-rgb), 0.2)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        />
                        <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12, paddingTop: 8 }} />
                         <Line
                           type="monotone"
                           dataKey="resale"
                           name={t('tco.carValueRetention')}
                           stroke="var(--accent)"
                           strokeWidth={2}
                           dot={{ r: 4, fill: 'var(--accent)' }}
                           activeDot={{ r: 6 }}
                         />
                         <Line
                           type="monotone"
                           dataKey="operating"
                           name={t('tco.operatingCumulative')}
                           stroke="var(--chart-operating)"
                           strokeWidth={2}
                           dot={{ r: 4, fill: 'var(--chart-operating)' }}
                           activeDot={{ r: 6 }}
                         />
                      </LineChart>
                    </ResponsiveContainer>
                      )}</div>
                     {/* Screen-reader accessible data table — visual chart conveys
                         trend, but blind users need the actual numbers. */}
                    <table className="sr-only">
                      <caption>{t('tco.cumulativeCost')}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t('tco.years')}</th>
                          <th scope="col">{t('tco.carValueRetention')}</th>
                          <th scope="col">{t('tco.operatingCumulative')}</th>
                       </tr>
                     </thead>
                      <tbody>
                        {lineData.map((row, i) => (
                          <tr key={i}>
                            <th scope="row">{row.year}</th>
                            <td>{formatVND(row.resale)}</td>
                            <td>{formatVND(row.operating)}</td>
                         </tr>
                        ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             </GlassCard>

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
                        <span aria-hidden="true" className={`transition-transform text-accent ${sectionsOpen.acquisition ? 'rotate-0' : '-rotate-90'}`}>▾</span>
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
                        <span aria-hidden="true" className={`transition-transform text-accent ${sectionsOpen.operations ? 'rotate-0' : '-rotate-90'}`}>▾</span>
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
                                    <span aria-hidden="true" className={`transition-transform text-accent ${fuelDetailOpen ? 'rotate-0' : '-rotate-90'}`}>▾</span>
                                    {t('tco.howFuelCalculated')}
                                  </span>
                                  <span className="font-mono">{breakdown.fuel.consumption?.toFixed(2)} {fuelUnit}</span>
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
                              <div key={i} className="flex justify-between items-center">
                                <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                                <span className="text-sm font-mono text-[var(--text-primary)]">{formatVND(item.value)}</span>
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
                        <span aria-hidden="true" className={`transition-transform text-accent ${sectionsOpen.depreciation ? 'rotate-0' : '-rotate-90'}`}>▾</span>
                        {t('tco.sectionDepreciation')}
                      </span>
                       <span className={`text-sm font-mono font-semibold ${depreciationNet < 0 ? 'text-success' : 'accent-text'}`}>{formatVND(depreciationNet)}</span>
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
                                <span className="text-sm text-[var(--text-secondary)]">
                                  {item.label}
                                  {item.ml && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-accent">
                                      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                                      {t('compare.mlBadge')}
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
                                <span className={`text-sm font-mono ${item.isNegative ? 'text-success' : 'text-[var(--text-primary)]'}`}>
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
                        <div className="text-xs text-[var(--text-muted)] mt-0.5">{t('tco.parkingFootnote')}</div>
                     </div>
                    )}
                  </div>
                </div>

                {/* Legal stamp — fee basis per Thông tư 155/2025 (plan §B) */}
                {(assumptionsMeta as any)?.last_updated && (
                  <div className="mt-3 text-center noprint">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium border border-[var(--border-default)] text-[var(--text-muted)]">
                      {t('tco.legalStamp').replace('{date}', new Date((assumptionsMeta as any).last_updated).toLocaleDateString())}
                    </span>
                  </div>
                )}

                {/* Data staleness badge */}
                {daysSinceUpdate != null && (
                  <div className="mt-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium noprint ${
                        (assumptionsMeta as any)?.data_stale
                          ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700'
                      }`}
                    >
                      <span aria-hidden="true">{(assumptionsMeta as any)?.data_stale ? '\u26A0' : '\u2713'}</span>
                      {(assumptionsMeta as any)?.data_stale
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
                          aria-valuetext={`${loanDownPct}%`}
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
                          aria-valuetext={`${loanRate}%`}
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
                          aria-valuetext={`${loanTerm} ${t('unit.years')}`}
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
                  to="/browse"
                  className="text-accent font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-accent/40 rounded"
                >
                  {t('tco.carNotFoundTipLink')}
               </Link>
             </p>
           </GlassCard>
          )}
       </div>
     </div>

   </div>
  )
}
