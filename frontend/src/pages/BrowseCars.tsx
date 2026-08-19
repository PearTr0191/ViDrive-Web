import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useKeyboardShortcut, isModShortcut } from '../hooks/useKeyboardShortcut'
import { registerShortcutHandlers, unregisterShortcutHandlers } from '../hooks/useGlobalShortcuts'
import { api, formatVND, stripDiacritics, formatConsumption } from '../lib'
import type { CarInfo } from '../lib'
import { useSeoMetaSafe, JsonLd, breadcrumbLd, SITE_URL } from '../lib/seo'
import AccentButton from '../components/AccentButton'
import GlassCard from '../components/ui/GlassCard'
import CarMedia from '../components/CarMedia'
import { useI18n } from '../lib/i18n'
import { Link, useLoaderData, useSearchParams } from 'react-router-dom'

const powertrainColors: Record<string, string> = {
  'EV': 'inline-flex bg-emerald-900 text-white',
  'HEV': 'inline-flex bg-blue-800 text-white',
  'ICE': 'inline-flex bg-accent text-[var(--bg-base)]',
  'ICE-D': 'inline-flex bg-amber-800 text-white',
}

const powertrainDotColors: Record<string, string> = {
  'EV': 'bg-emerald-400',
  'HEV': 'bg-blue-400',
  'ICE': 'bg-accent',
  'ICE-D': 'bg-amber-400',
}

type SortState = { key: string | null; direction: 'asc' | 'desc' | null }

type SortableHeaderProps = {
  column: string
  sortState: SortState
  onSort: (key: string) => void
  align?: 'left' | 'center' | 'right'
  children: ReactNode
}

function SortableHeader({ column, sortState, onSort, align = 'right', children }: SortableHeaderProps) {
  const isActive = sortState.key === column
  const direction = isActive && sortState.direction
  const ariaSortValue = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
  const alignClass = align === 'center' ? 'text-center justify-center' : align === 'left' ? 'text-left justify-start' : 'text-right justify-end'

  return (
    <th
      scope="col"
      aria-sort={ariaSortValue}
      onClick={() => onSort(column)}
      className={`py-3 px-4 font-heading font-semibold cursor-pointer select-none text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors ${alignClass}`}
    >
      <div className="flex items-center gap-1">
        {children}
        {isActive && direction && (
          <span className="text-accent">{direction === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  )
}

export default function BrowseCars() {
  const { t } = useI18n()
  useSeoMetaSafe({ title: `ViDrive - ${t('nav.browse')}`, description: t('page.browseDescription') })
  const [searchParams] = useSearchParams()
  // C1 — initialize the search box from the URL (?q=) so the sitelinks search box works
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') ?? '')
  const [activeType, setActiveType] = useState<string | null>(null)
  const [sortState, setSortState] = useState<SortState>({ key: null, direction: null })
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 18

  const handleSortClick = useCallback((key: string) => {
    setSortState(prev => {
      if (prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'asc') return { key, direction: 'desc' }
      if (prev.direction === 'desc') return { key: null, direction: null }
      return { key, direction: 'asc' }
    })
  }, [])

  const loaderData = useLoaderData() as { cars?: CarInfo[] }

  const { data: cars, isLoading, isError, refetch } = useQuery({
    queryKey: ['cars'],
    queryFn: () => api.getCars(),
    retry: 1,
    initialData: loaderData?.cars ?? undefined,
  })

  const [customCar, setCustomCar] = useState<CarInfo | null>(null)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('vidrive-custom-car')
      if (stored) setCustomCar(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  const allCars = useMemo(() => {
    if (!cars) return []
    const base = customCar ? [customCar, ...cars] : cars
    return base
  }, [cars, customCar])

  const types = useMemo(() => Array.from(new Set(cars?.map(c => c.type) || [])), [cars])

  const matchesRegex = (value: string, term: string): boolean => {
    if (!term) return true
    const normalized = stripDiacritics(term.toLowerCase())
    try {
      const regex = new RegExp(normalized, 'i')
      return regex.test(stripDiacritics(value.toLowerCase()))
    } catch {
      return stripDiacritics(value.toLowerCase()).includes(normalized)
    }
  }

  const filteredCars = useMemo(() => {
    if (!allCars.length) return []
    return allCars.filter((c) => {
      const searchable = stripDiacritics([c.brand, c.model, c.id, c.segment, c.type].join(' ').toLowerCase())
      const matchesSearch = matchesRegex(searchable, searchTerm)
      const matchesType = !activeType || c.type === activeType
      return matchesSearch && matchesType
    })
  }, [allCars, searchTerm, activeType])

  const sortedCars = useMemo(() => {
    if (!sortState.key || !sortState.direction) return filteredCars
    const sorted = [...filteredCars].sort((a, b) => {
      let aVal: string | number, bVal: string | number
      switch (sortState.key) {
        case 'name':
          aVal = `${a.brand} ${a.model}`
          bVal = `${b.brand} ${b.model}`
          break
        case 'price':
          aVal = a.price
          bVal = b.price
          break
        case 'type':
          aVal = a.type
          bVal = b.type
          break
        case 'consumption':
          aVal = a.consumption
          bVal = b.consumption
          break
        case 'seats':
          aVal = a.seats
          bVal = b.seats
          break
        default:
          return 0
      }
      if (aVal < bVal) return sortState.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortState.direction === 'asc' ? 1 : -1
      return 0
    })
    return sorted
  }, [filteredCars, sortState])

  const totalPages = Math.max(1, Math.ceil(sortedCars.length / PAGE_SIZE))
  const paginatedCars = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return sortedCars.slice(start, start + PAGE_SIZE)
  }, [sortedCars, currentPage])

  const handlePrev = () => setCurrentPage(p => Math.max(1, p - 1))
  const handleNext = () => setCurrentPage(p => Math.min(totalPages, p + 1))

  const hasActiveFilters = searchTerm !== '' || activeType !== null || sortState.key !== null

  const handleClearFilters = () => {
    setSearchTerm('')
    setActiveType(null)
    setSortState({ key: null, direction: null })
    setCurrentPage(1)
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, activeType, sortState])

  // Ctrl+K → focus search
  const searchInputRef = useRef<HTMLInputElement>(null)
  useKeyboardShortcut(
    (e) => {
      if (isModShortcut(e, 'k')) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    },
    [],
  )

  // `/` → focus search (global shortcut)
  useEffect(() => {
    registerShortcutHandlers({ onFocusSearch: () => searchInputRef.current?.focus() })
    return () => {
      unregisterShortcutHandlers(['onFocusSearch'])
    }
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-16 bg-[rgba(var(--bg-base-rgb),0.3)] rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-8">
        <GlassCard className="p-12 text-center">
          <p className="text-[var(--text-secondary)] mb-4" role="alert">
            {t('browse.error')}
          </p>
          <AccentButton variant="outline" onClick={() => refetch()}>
            {t('history.refresh')}
          </AccentButton>
        </GlassCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <JsonLd data={breadcrumbLd([
        { name: t('nav.home'), url: SITE_URL },
        { name: t('nav.browse'), url: `${SITE_URL}/car` },
      ])} />
      <h1 className="text-3xl md:text-4xl font-heading font-bold text-[var(--text-primary)] mb-1">{t('browse.title')}</h1>
      {/* Custom car CTA — FIRST thing on the page for discoverability */}
      <Link to="/wizard" className="block">
        <GlassCard className="p-5 md:p-6 border-accent/40 bg-accent/5 hover:bg-accent/10 transition-colors cursor-pointer">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 text-accent">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              <div>
                <div className="font-heading font-semibold text-[var(--text-primary)] text-lg">
                  {t('browse.createCustomCar')}
                </div>
                <div className="text-sm text-[var(--text-secondary)]">
                  {t('browse.createCustomCarDesc')}
                </div>
              </div>
            </div>
            <AccentButton size="sm" className="shrink-0">
              {t('wizard.title')}
            </AccentButton>
          </div>
        </GlassCard>
      </Link>

      {/* Single Search Box + Type Chips */}
      <GlassCard className="p-4">
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              ref={searchInputRef}
              placeholder={t('browse.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50 transition-colors"
              aria-label={t('browse.search')}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </div>
          </div>

          {/* Type filter chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveType(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                !activeType
                  ? 'bg-accent/10 border-accent/40 text-accent'
                  : 'bg-[rgba(var(--bg-base-rgb),0.3)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
              }`}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 opacity-70" />
              {t('browse.allTypes')}
            </button>
            {types.map((type) => (
              <button
                key={type}
                onClick={() => setActiveType(activeType === type ? null : type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  activeType === type
                    ? `${powertrainColors[type] || 'text-[var(--text-primary)] bg-[var(--bg-surface)]'} border-current`
                    : 'bg-[rgba(var(--bg-base-rgb),0.3)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                }`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${powertrainDotColors[type] || 'bg-current opacity-70'}`} />
                {type}
              </button>
            ))}
          </div>

          {/* Sort + Pagination controls */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-[var(--text-secondary)]">
              {filteredCars.length} {t('browse.carsFound')}
            </span>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-sm text-accent hover:text-accent-warm transition-colors border border-accent/30 rounded-lg px-3 py-1.5 hover:bg-accent/10"
                aria-label={t('browse.clearFilters')}
              >
                {t('browse.clearFilters')}
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Results */}
      {filteredCars.length === 0 ? (
        <GlassCard className="p-16 text-center">
          <div className="text-[var(--text-secondary)] text-lg">{t('browse.noResults')}</div>
        </GlassCard>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-default)]">
                  <th className="w-32"></th>
                  <SortableHeader column="name" sortState={sortState} onSort={handleSortClick} align="center">
                    {t('browse.car')}
                  </SortableHeader>
                  <SortableHeader column="price" sortState={sortState} onSort={handleSortClick} align="right">
                    {t('browse.price')}
                  </SortableHeader>
                  <SortableHeader column="type" sortState={sortState} onSort={handleSortClick} align="right">
                    {t('browse.type')}
                  </SortableHeader>
                  <SortableHeader column="consumption" sortState={sortState} onSort={handleSortClick} align="right">
                    {t('browse.consumption')}
                  </SortableHeader>
                  <SortableHeader column="seats" sortState={sortState} onSort={handleSortClick} align="right">
                    {t('browse.seats')}
                  </SortableHeader>
                  <th scope="col" className="text-center text-[var(--text-primary)] py-3 px-4 font-heading font-semibold">{t('browse.actions')}</th>
                </tr>
              </thead>
              <tbody>
{paginatedCars.map((c: CarInfo, idx: number) => (
                <tr key={c.id} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[rgba(var(--bg-base-rgb),0.2)] transition-colors">
                  <td className="py-4 px-4 w-32">
                    <Link to={`/car/${c.id}`} className="block">
                       <CarMedia carId={c.id} type={c.type} segment={c.segment} car={c} aspect="4 / 3" disableHover priority={idx === 0} className="!border-[var(--border-subtle)]" />
                      </Link>
                    </td>
                    <td className="py-4 px-4">
                      <Link to={`/car/${c.id}`} className="block hover:text-accent-warm transition-colors">
                        <div className="font-medium text-[var(--text-primary)]">{c.brand} {c.model}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{c.id} • {c.segment}</div>
                      </Link>
                    </td>
                    <td className="text-right text-[var(--text-primary)] py-4 px-4 font-mono">{formatVND(c.price)}</td>
<td className="text-right py-4 px-4">
                      <div
                        className={'px-2 py-1 rounded text-xs font-mono ' + (powertrainColors[c.type] || 'text-[var(--text-primary)] bg-[var(--bg-surface)]')}
                        style={{
                          backgroundColor:
                            c.type === 'EV'
                              ? '#064e3b'
                              : c.type === 'HEV'
                              ? '#1e3a5f'
                              : c.type === 'ICE'
                              ? 'var(--accent)'
                              : c.type === 'ICE-D'
                              ? '#78350f'
                              : 'var(--bg-surface)',
                        }}
                      >
                        {c.type}
                      </div>
                    </td>
                    <td className="text-right text-[var(--text-primary)] py-4 px-4 font-mono text-sm">
                      {c.consumption.toFixed(2)}
                    </td>
                    <td className="text-right text-[var(--text-primary)] py-4 px-4">{c.seats}</td>
                    <td className="text-right py-4 px-4 whitespace-nowrap">
                      <Link to={`/car/${c.id}`} className="inline-block mr-2">
                        <AccentButton variant="outline" size="sm">
                          {t('browse.viewDetails')}
                        </AccentButton>
                      </Link>
                      <Link to={`/tco?car=${c.id}`}>
                        <AccentButton size="sm">
                          {t('browse.calculate')}
                        </AccentButton>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {paginatedCars.map((c: CarInfo, idx: number) => (
              <GlassCard key={c.id} className="p-4">
                <Link to={`/car/${c.id}`} className="block">
                  <div className="mb-3">
                      <CarMedia carId={c.id} type={c.type} segment={c.segment} car={c} aspect="16 / 9" priority={idx === 0} />
                  </div>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-medium text-[var(--text-primary)] text-lg">{c.brand} {c.model}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{c.id} • {c.segment}</div>
                    </div>
                    <div
                       className={'px-2 py-1 rounded text-xs font-mono ' + (powertrainColors[c.type] || 'text-[var(--text-primary)] bg-[var(--bg-surface)]')}
                      style={{
                        backgroundColor:
                          c.type === 'EV'
                            ? '#064e3b'
                            : c.type === 'HEV'
                            ? '#1e3a5f'
                            : c.type === 'ICE'
                            ? 'var(--accent)'
                            : c.type === 'ICE-D'
                            ? '#78350f'
                            : 'var(--bg-surface)',
                      }}
                    >
                      {c.type}
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-sm text-[var(--text-primary)]/70 mb-4">
                    <span className="font-mono">{formatVND(c.price)}</span>
                    <span>{c.seats} {t('browse.seats')} • {formatConsumption(c)}</span>
                  </div>
                </Link>
                <div className="flex gap-2">
                  <Link to={`/car/${c.id}`} className="flex-1">
                    <AccentButton variant="outline" size="sm" className="w-full">
                      {t('browse.viewDetails')}
                    </AccentButton>
                  </Link>
                  <Link to={`/tco?car=${c.id}`} className="flex-1">
                    <AccentButton size="sm" className="w-full">
                      {t('browse.calculate')}
                    </AccentButton>
                  </Link>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={handlePrev}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[rgba(var(--bg-base-rgb),0.3)]"
              aria-label={t('browse.previous')}
            >
              {t('browse.previous')}
            </button>
            <span className="text-sm text-[var(--text-secondary)]">
              {t('browse.pageOf').replace('{page}', String(currentPage)).replace('{total}', String(totalPages))}
            </span>
            <button
              onClick={handleNext}
              disabled={currentPage === totalPages || totalPages <= 1}
              className="px-4 py-2 text-sm border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[rgba(var(--bg-base-rgb),0.3)]"
              aria-label={t('browse.next')}
            >
              {t('browse.next')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}


