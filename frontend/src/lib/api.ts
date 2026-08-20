/** API client for ViDrive TCO backend. */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

class OfflineError extends Error {
  isOffline = true
  constructor(message: string) {
    super(message)
    this.name = 'OfflineError'
  }
}

async function safeFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (err: unknown) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new OfflineError('You appear to be offline. Some features may be unavailable.')
    }
    if (err instanceof Error && err.name === 'TypeError' && err.message === 'Failed to fetch') {
      throw new OfflineError('Unable to reach the backend server. Please check your connection.')
    }
    throw err
  }
}

/** Extract filename from Content-Disposition header, fall back to a generated default. */
async function _blobWithFilename(res: Response, fallback = 'download'): Promise<{ blob: Blob; filename: string }> {
  const [blob, cd] = await Promise.all([
    res.blob(),
    res.headers.get('Content-Disposition') ?? '',
  ])
  let filename = fallback
  if (cd) {
    const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i)
    if (match) filename = decodeURIComponent(match[1])
  }
  return { blob, filename }
}

export interface CarInfo {
  id: string
  brand: string
  model: string
  price: number
  type: string
  seats: number
  consumption: number
  annual_maintenance: number
  segment: string
  depreciation_rate?: number | null
  model_year?: number | null
}

export interface CityInfo {
  name: string
  area: number
  diacritic: string
}

export interface TcoResult {
  price: number
  reg: { tax: number; plate: number; inspection: number; total: number }
  reg_tax: number
  on_road: number
  fuel: number
  maint: number
  legal: number
  operating: number
  insurance_optional?: number
  inspection_periodic?: number
  rush_hour_applied?: boolean
  parking_toll: {
    monthly_parking: number
    monthly_toll: number
    monthly_total: number
    total_over_period: number
  }
  resale: number
  resale_logic: string
  resale_spread?: number
  resale_std?: number
  resale_note_key?: string
  resale_market_value?: number | null
  resale_guarantee_value?: number | null
  resale_guarantee_floor?: number | null
  warnings?: string[] | null
  depreciation: number
  opp_cost: number
  liquidity: string
  tco: number
  true_financial_impact: number
  monthly: number
  confidence_low?: number | null
  confidence_high?: number | null
  ml_max_year?: number | null
}

export interface TcoResponse {
  car_id: string
  car: CarInfo
  city: string
  area: number
  km: number
  years: number
  city_ratio: number
   show_opp_cost: boolean
  rush_hour?: boolean
  include_insurance?: boolean
  include_parking_toll?: boolean
  result: TcoResult
}

export interface YearlyBreakdownEntry {
  year: number
  year_label: string
  fuel: number
  maintenance: number
  legal: number
  inspection: number
  parking_toll: number
  operating_cumulative: number
    resale: number
  resale_guarantee_value: number | null
  depreciation: number
  cumulative_tco: number
}

export interface YearlyBreakdownResponse {
  car_id: string
  years: number
  yearly: YearlyBreakdownEntry[]
  warnings?: string[] | null
  ml_max_year?: number | null
}

export interface LoanResult {
  loan_amount: number
  down_payment: number
  monthly_payment: number
  total_interest: number
  total_repayment: number
  effective_cost: number
  term_months: number
  annual_rate: number
}

// ─── History (sessionStorage — ephemeral, tab-scoped) ────────────────────────

const HISTORY_STORAGE_KEY = 'vidrive-history'
const MAX_HISTORY_ENTRIES = 50

export interface HistoryEntry {
  name: string
  timestamp: string
  data: Record<string, unknown>
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

function writeHistory(entries: HistoryEntry[]): void {
  try {
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* storage full or unavailable — best-effort */
  }
}

export const historyApi = {
  /** Returns history entries from sessionStorage, newest-first. */
  getHistory(): Promise<HistoryEntry[]> {
    return Promise.resolve(readHistory())
  },

  /** Upserts an entry by name. Newest entries are unshifted; list is capped at MAX_HISTORY_ENTRIES. */
  saveHistory(name: string, data: Record<string, unknown>): Promise<void> {
    const entries = readHistory()
    const idx = entries.findIndex((e) => e.name === name)
    const entry: HistoryEntry = { name, timestamp: new Date().toISOString(), data }
    if (idx >= 0) entries.splice(idx, 1)
    entries.unshift(entry)
    if (entries.length > MAX_HISTORY_ENTRIES) entries.length = MAX_HISTORY_ENTRIES
    writeHistory(entries)
    return Promise.resolve()
  },

  /** Removes the entry with the given name from sessionStorage. */
  deleteHistory(name: string): Promise<void> {
    const entries = readHistory()
    const idx = entries.findIndex((e) => e.name === name)
    if (idx >= 0) {
      entries.splice(idx, 1)
      writeHistory(entries)
    }
    return Promise.resolve()
  },
}

export const api = {
  async getCars(): Promise<CarInfo[]> {
    const res = await safeFetch(`${API_BASE}/api/cars`)
    return res.json()
  },

  async searchCars(q: string): Promise<CarInfo[]> {
    const res = await safeFetch(`${API_BASE}/api/cars/search?q=${encodeURIComponent(q)}`)
    return res.json()
  },

  async getCar(id: string): Promise<CarInfo> {
    const res = await safeFetch(`${API_BASE}/api/cars/${id}`)
    if (!res.ok) throw new Error(`Car ${id} not found`)
    return res.json()
  },

  async getCities(): Promise<CityInfo[]> {
    const res = await safeFetch(`${API_BASE}/api/cities`)
    return res.json()
  },

  async calculateTco(req: {
    car_id: string
    car?: CarInfo
    city: string
    km: number
    years: number
    area?: number
    city_ratio?: number
    show_opp_cost?: boolean
    rush_hour?: boolean
    include_insurance?: boolean
    include_parking_toll?: boolean
  }): Promise<TcoResponse> {
    const res = await safeFetch(`${API_BASE}/api/tco/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  async compareTco(req: {
    car_ids: string[]
    custom_cars?: CarInfo[]
    city: string
    km: number
    years: number
    area?: number
    city_ratio?: number
    show_opp_cost?: boolean
    rush_hour?: boolean
    include_insurance?: boolean
    include_parking_toll?: boolean
  }): Promise<{ results: TcoResult[]; car_ids: string[] }> {
    const res = await safeFetch(`${API_BASE}/api/tco/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  async calculateLoan(req: {
    on_road_price: number
    down_pct?: number
    annual_rate?: number
    term_years?: number
  }): Promise<LoanResult> {
    const res = await safeFetch(`${API_BASE}/api/loan/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  async getConfig(): Promise<ConfigResponse> {
    const res = await safeFetch(`${API_BASE}/api/config`)
    return res.json()
  },

  async wizardCustom(req: {
    brand: string
    model?: string
    price: number
    type?: string
    consumption?: number
    annual_maintenance?: number
    seats?: number
    segment?: string
    depreciation_rate?: number
    city?: string
    km?: number
    years?: number
    city_ratio?: number
    show_opp_cost?: boolean
    rush_hour?: boolean
    include_insurance?: boolean
    include_parking_toll?: boolean
  }): Promise<TcoResponse> {
    const res = await safeFetch(`${API_BASE}/api/wizard/custom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

   async exportCsv(req: {
     export_type: 'single' | 'compare'
     car_id?: string
     years?: number
     city?: string
     km?: number
     area?: number
     ratio?: number
      show_opp?: boolean
      result?: TcoResult
      loan?: LoanResult
      car_ids?: string[]
      results?: TcoResult[]
      loans?: LoanResult[]
    }): Promise<{ blob: Blob; filename: string }> {
      const res = await safeFetch(`${API_BASE}/api/export/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!res.ok) throw new Error(await res.text())
      return _blobWithFilename(res, 'vidrive-tco.csv')
    },

  async exportPdf(req: {
     export_type: 'single' | 'compare'
     lang?: 'en' | 'vi'
     car_id?: string
     years?: number
     city?: string
     km?: number
     area?: number
     ratio?: number
     show_opp?: boolean
     result?: TcoResult
     loan?: LoanResult
     car_ids?: string[]
     results?: TcoResult[]
     loans?: LoanResult[]
   }): Promise<{ blob: Blob; filename: string }> {
     const res = await safeFetch(`${API_BASE}/api/export/pdf`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(req),
     })
     if (!res.ok) throw new Error(await res.text())
     return _blobWithFilename(res, 'vidrive-tco.pdf')
   },

  async getBreakdown(req: {
    car_id: string
    car?: CarInfo
    city: string
    km: number
    years: number
    city_ratio: number
    rush_hour?: boolean
  }): Promise<BreakdownResponse> {
    const res = await safeFetch(`${API_BASE}/api/tco/breakdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  async getYearlyBreakdown(req: {
    car_id: string
    car?: CarInfo
    city: string
    km: number
     years: number
     city_ratio?: number
     rush_hour?: boolean
     include_parking_toll?: boolean
   }): Promise<YearlyBreakdownResponse> {
    const res = await safeFetch(`${API_BASE}/api/tco/yearly-breakdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
}

export const calculateLoanLocal = (
  onRoadPrice: number,
  downPct: number,
  annualRate: number,
  termYears: number,
): LoanResult => {
  const pct = Math.max(0, Math.min(100, downPct))
  const loanAmount = onRoadPrice * (1 - pct / 100)
  const monthlyRate = annualRate / 12
  const numPayments = termYears * 12

  if (loanAmount <= 0) {
    return {
      loan_amount: 0,
      down_payment: onRoadPrice,
      monthly_payment: 0,
      total_interest: 0,
      total_repayment: 0,
      effective_cost: onRoadPrice,
      term_months: numPayments,
      annual_rate: annualRate,
    }
  }

  const monthlyPayment =
    monthlyRate === 0
      ? loanAmount / numPayments
      : (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
        (Math.pow(1 + monthlyRate, numPayments) - 1)

  const totalRepayment = monthlyPayment * numPayments
  const totalInterest = totalRepayment - loanAmount

  return {
    loan_amount: loanAmount,
    down_payment: onRoadPrice * pct / 100,
    monthly_payment: monthlyPayment,
    total_interest: totalInterest,
    total_repayment: totalRepayment,
    effective_cost: onRoadPrice + totalInterest,
    term_months: numPayments,
    annual_rate: annualRate,
  }
}

// ─── Config Assumptions / Proposals ──────────────────────────────────────────

export interface AssumptionItem {
  key: string
  group: string
  label_i18n: string
  type: string
  unit: string
  min: number | null
  max: number | null
  step: number | null
  value: number | string | null
  editable: boolean
  area: number | string | null
  tier: string | null
  car_type: string | null
  last_verified: string | null
}

export interface AssumptionGroup {
  key: string
  title_i18n: string
  items: AssumptionItem[]
}

export interface AssumptionsResponse {
  metadata: {
    last_updated: string
    data_recency_days: number
    app_version: string
    days_since_update?: number
    data_stale?: boolean
  }
  groups: AssumptionGroup[]
}

export interface ConfigResponse {
  version: string
  max_comparison_cars: number
  supported_cities: number
  last_updated: string
}

export interface FuelBreakdown {
  consumption: number
  adjusted_consumption: number
  freeway_mult: number
  city_mult: number
  final_mult: number
  price: number
  price_label: string
  car_type: string
  annual_fuel: number
  total_fuel: number
  years: number
  km: number
  city_ratio: number
}

export interface RegistrationBreakdown {
  price: number
  car_type: string
  seats: number
  area: number
  tax_rate: number
  tax: number
  tax_desc: string
  plate: number
  inspection: number
  road_fee: number
  insurance: number
  total: number
  on_road: number
}

export interface BreakdownResponse {
  fuel: FuelBreakdown
  registration: RegistrationBreakdown
}

export interface ConfigProposalChange {
  key: string
  value: number
  area?: number | string | null
  tier?: string | null
  car_type?: string | null
}

export interface ConfigProposalIn {
  author?: string | null
  locale: 'en' | 'vi'
  changes: ConfigProposalChange[]
  metadata?: Record<string, unknown> | null
}

export interface ProposalSubmitResult {
  status: string
  path: string
}

// Add config methods to the api object
// (appended via spread below)

export const configApi = {
  async getAssumptions(): Promise<AssumptionsResponse> {
    const res = await safeFetch(`${API_BASE}/api/config/assumptions`)
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  async submitProposal(req: ConfigProposalIn): Promise<ProposalSubmitResult> {
    const res = await safeFetch(`${API_BASE}/api/config/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
}

export interface OwnershipStats {
  min_annual_cost_vnd: number | null
  max_annual_cost_vnd: number | null
  mean_annual_cost_vnd: number | null
  user_percentile: number | null
  sample_size: number
  assumptions_version: string
  computed_at: string
  insufficient: boolean
}

export const statsApi = {
  async getOwnership(carId?: string): Promise<OwnershipStats> {
    const url = carId
      ? `${API_BASE}/api/stats/ownership?car_id=${encodeURIComponent(carId)}`
      : `${API_BASE}/api/stats/ownership`
    const res = await safeFetch(url)
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
}

export { OfflineError }

export const formatVND = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

export const toTitleCase = (str: string): string =>
  str.split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')