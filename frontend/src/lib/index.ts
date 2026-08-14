export function stripDiacritics(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// Shared so every surface renders the correct, per-powertrain consumption unit
// (EV = kWh/100km, others = L/100km). Unit symbols are universal, so hardcoded.
export function formatConsumption(car: { consumption: number; type: string }): string {
  const rounded = car.consumption.toFixed(2)
  return car.type === 'EV' ? `${rounded} kWh/100km` : `${rounded} L/100km`
}

export { api, configApi, historyApi, formatVND, toTitleCase, calculateLoanLocal } from './api'
export type {
  CarInfo, CityInfo, TcoResult, TcoResponse, LoanResult, YearlyBreakdownEntry,
  AssumptionItem, AssumptionGroup, AssumptionsResponse, ConfigProposalIn, ProposalSubmitResult,
  HistoryEntry,
} from './api'
export { I18nProvider, useI18n } from './i18n'
export type { Locale } from './i18n'
export { default as AccentButton } from '../components/AccentButton'
export { default as TachometerScroll } from '../components/TachometerScroll'
export { default as VerticalScrollbar } from '../components/VerticalScrollbar'
export { REDLINE_THRESHOLD } from './scrollConstants'
export { GrillePattern, TireTread, RacingStripe, CheckeredFlag, DashboardGauge, SpeedLines } from '../components/AutomotivePatterns'
export { default as AccentText } from '../components/ui/AccentText'