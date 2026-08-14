import { useState } from 'react'
import { configApi, formatVND, type AssumptionItem, type ConfigProposalIn, type ConfigProposalChange } from '../lib/api'

export interface ChangeRecord {
  value: number
  area?: number | string | null
  tier?: string | null
  car_type?: string | null
  currentValue: number | string | null
  key: string
}

export interface SubmitState {
  status: 'idle' | 'submitting' | 'success' | 'error'
  message?: string
}

/**
 * Build a unique change key that includes sub-qualifiers (area/tier/car_type)
 * and a row index to disambiguate duplicate items returned by the API.
 */
export function buildChangeKey(item: AssumptionItem, itemIdx: number): string {
  const parts: string[] = [item.key]
  if (item.area != null) parts.push(`area:${item.area}`)
  if (item.tier) parts.push(`tier:${item.tier}`)
  if (item.car_type) parts.push(`car_type:${item.car_type}`)
  parts.push(`idx:${itemIdx}`)
  return parts.join('|')
}

/**
 * Format a value for display based on type and unit.
 * Mirrors ConfigProposals' formatValue logic.
 */
export function formatItemValue(val: number | string | null, type: string, unit: string): string {
  if (val === null || val === undefined) return '—'
  if (type === 'int' || type === 'float') {
    const num = typeof val === 'number' ? val : parseFloat(String(val))
    if (isNaN(num)) return String(val)
    if (unit === 'VND' || unit === 'VND/year' || unit === 'VND/month') return formatVND(num)
    if (unit === 'ratio') return `${(num * 100).toFixed(1)}%`
    if (unit === 'percent') return `${num.toFixed(1)}%`
    if (num === Math.floor(num)) return num.toLocaleString('vi-VN')
    // Round to 2 decimal places to avoid floating-point artifacts like 6.901000000000001
    return Number(num.toFixed(2)).toLocaleString('vi-VN', { maximumFractionDigits: 2 })
  }
  return String(val)
}

/**
 * Maps backend error responses to user-friendly i18n messages.
 * Handles OfflineError, 400 (detail.errors[]), 422 (detail[]), and 500+ errors.
 */
function parseSubmitError(
  err: any,
  t: (key: string) => string,
): string {
  if (err?.isOffline) return t('config.error.offline')

  const raw = err?.message ?? ''

  // The backend returns JSON error bodies, not plain text.
  // 400 -> {"detail": {"errors": ["msg1", "msg2"]}}
  // 422 -> {"detail": [{"type": "float_parsing", "msg": "...", ...}]}
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Not JSON — could be a plain string error or network-level failure text.
    if (raw && raw.length > 0) return raw
    return t('config.error.unexpected')
  }

  const detail = parsed?.detail

  // ── 400: detail is an object with an `errors` array ──
  if (detail && typeof detail === 'object' && Array.isArray(detail.errors)) {
    const messages: string[] = []
    for (const e of detail.errors) {
      const text = String(e)
      messages.push(categorizeBackendError(text, t))
    }
    return messages.join(' ')
  }

  // ── 422: detail is an array of Pydantic validation error objects ──
  if (Array.isArray(detail)) {
    const messages: string[] = []
    for (const item of detail) {
      if (typeof item === 'object' && item !== null) {
        messages.push(categorizePydanticError(item.type ?? '', item.msg ?? '', t))
      } else {
        messages.push(String(item))
      }
    }
    return messages.join(' ')
  }

  // ── detail is a plain string (e.g. 500 Internal Server Error) ──
  if (typeof detail === 'string') {
    const statusMatch = raw.match(/status_code[:\s]+(\d+)/i)
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0
    if (status >= 500) return t('config.error.serverError')
    return detail
  }

  return t('config.error.unexpected')
}

/** Categorize a backend 400-level error string into a user-friendly message. */
function categorizeBackendError(text: string, t: (key: string) => string): string {
  const lower = text.toLowerCase()
  if (lower.includes('no changes provided')) return t('config.error.noChanges')
  if (lower.includes('not an editable assumption')) return t('config.error.notEditable')
  if (lower.includes('below minimum')) return t('config.error.belowMin')
  if (lower.includes('above maximum')) return t('config.error.aboveMax')
  return text
}

/** Map a Pydantic validation error type to a user-friendly message. */
function categorizePydanticError(
  type: string,
  msg: string,
  t: (key: string) => string,
): string {
  if (type.includes('parsing') || type.includes('number')) {
    return t('config.error.invalidNumber')
  }
  if (type.includes('literal')) {
    return t('config.error.invalidLocale')
  }
  if (type.includes('json_invalid') || type.includes('json')) {
    return t('config.error.malformed')
  }
  if (type === 'list_too_short' || type.includes('list_too_short')) {
    return t('config.error.noChanges')
  }
  if (type.includes('missing')) {
    return t('config.error.malformed')
  }
  // Fallback: include the raw Pydantic message so the user sees *something*.
  return msg || t('config.error.unexpected')
}

export interface UseConfigEditorReturn {
  changes: Record<string, ChangeRecord>
  author: string
  setAuthor: (v: string) => void
  submitState: SubmitState
  changeCount: number
  handleValueChange: (item: AssumptionItem, itemIdx: number, rawValue: string) => void
  revertChange: (changeKey: string) => void
  resetChanges: () => void
  handleSubmit: () => Promise<void>
}

/**
 * Encapsulates change-tracking and proposal-submission state for the
 * AssumptionsTable editor mode. Used by both Methodology (inline) and
 * ConfigProposals (standalone) to stay DRY.
 */
export function useConfigEditor(
  locale: 'en' | 'vi',
  t: (key: string) => string,
): UseConfigEditorReturn {
  const [changes, setChanges] = useState<Record<string, ChangeRecord>>({})
  const [author, setAuthor] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' })

  const handleValueChange = (item: AssumptionItem, itemIdx: number, rawValue: string) => {
    const numVal = item.type === 'int' ? parseInt(rawValue, 10) : parseFloat(rawValue)
    if (isNaN(numVal)) return

    const changeKey = buildChangeKey(item, itemIdx)
    const isDirty = item.value !== numVal

    setChanges((prev) => {
      if (!isDirty) {
        const next = { ...prev }
        delete next[changeKey]
        return next
      }
      const existing = prev[changeKey] || {
        currentValue: item.value,
        key: item.group,
      }
      return {
        ...prev,
        [changeKey]: {
          ...existing,
          value: numVal,
          area: item.area,
          tier: item.tier,
          car_type: item.car_type,
          key: item.group,
          currentValue: item.value,
        },
      }
    })
  }

  const revertChange = (changeKey: string) => {
    setChanges((prev) => {
      const next = { ...prev }
      delete next[changeKey]
      return next
    })
  }

  const resetChanges = () => {
    setChanges({})
    setAuthor('')
    setSubmitState({ status: 'idle' })
  }

  const changeCount = Object.keys(changes).length

  const buildSubmitPayload = (): ConfigProposalIn => {
    const payloadChanges: ConfigProposalChange[] = []
    for (const [changeKey, change] of Object.entries(changes)) {
      const entry: ConfigProposalChange = {
        key: changeKey.split('|')[0],
        value: change.value,
      }
      if (change.area != null) entry.area = change.area
      if (change.tier) entry.tier = change.tier
      if (change.car_type) entry.car_type = change.car_type
      payloadChanges.push(entry)
    }
    return {
      author: author || null,
      locale,
      changes: payloadChanges,
    }
  }

  const handleSubmit = async () => {
    if (changeCount === 0) return

    setSubmitState({ status: 'submitting' })
    try {
      const payload = buildSubmitPayload()
      const result = await configApi.submitProposal(payload)
      setSubmitState({
        status: 'success',
        message: `${t('config.successMsg')} (${result.path})`,
      })
      setChanges({})
      setAuthor('')
    } catch (err: any) {
      setSubmitState({ status: 'error', message: parseSubmitError(err, t) })
    }
  }

  return {
    changes,
    author,
    setAuthor,
    submitState,
    changeCount,
    handleValueChange,
    revertChange,
    resetChanges,
    handleSubmit,
  }
}
