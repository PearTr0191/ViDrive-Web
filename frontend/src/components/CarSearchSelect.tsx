import { useState, useMemo, useRef, useEffect } from 'react'
import { useI18n } from '../lib/i18n'
import type { CarInfo } from '../lib'
import { formatVND, stripDiacritics } from '../lib'

interface CarSearchSelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  cars: CarInfo[]
  searchPlaceholder?: string
  chooseLabel?: string
}

export default function CarSearchSelect({
  label,
  value,
  onChange,
  cars,
  searchPlaceholder,
  chooseLabel,
}: CarSearchSelectProps) {
  const { t } = useI18n()
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedCar = useMemo(
    () => cars.find((c) => c.id === value),
    [cars, value]
  )

const filteredCars = useMemo(() => {
    if (!cars?.length) return []
    if (!searchTerm) return cars
    // Split on whitespace so multi-word queries ("VinFast VF 8", "Vios 2026")
    // match when every word appears anywhere across brand/model/id/segment/type.
    // Without the split, a single-field substring test fails on the literal phrase
    // "vinfast vf 8" because brand holds "vinfast" and model holds "vf 8 eco" but
    // no single field contains "vinfast vf 8" verbatim.
    const tokens = stripDiacritics(searchTerm.toLowerCase()).split(/\s+/).filter(Boolean)
    if (!tokens.length) return cars
    return cars.filter((c) => {
      const haystack = stripDiacritics(
        [c.brand, c.model, c.id, c.segment, c.type].join(' ').toLowerCase()
      )
      return tokens.every((tok) => haystack.includes(tok))
    })
  }, [cars, searchTerm])

  useEffect(() => {
    setHighlightIndex(-1)
  }, [searchTerm])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputFocus = () => {
    setIsOpen(true)
    if (selectedCar) {
      setSearchTerm('')
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
    setIsOpen(true)
    setHighlightIndex(-1)
  }

  const handleSelectCar = (carId: string) => {
    onChange(carId)
    setIsOpen(false)
    setSearchTerm('')
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true)
        return
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIndex((prev) =>
          prev < filteredCars.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCars.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (
          highlightIndex >= 0 &&
          highlightIndex < filteredCars.length
        ) {
          handleSelectCar(filteredCars[highlightIndex].id)
        }
        break
      case 'Escape':
        setIsOpen(false)
        setSearchTerm('')
        inputRef.current?.blur()
        break
    }
  }

  const displayValue = isOpen
    ? searchTerm
    : selectedCar
      ? `${selectedCar.brand} ${selectedCar.model}`
      : ''

  return (
    <div className="space-y-1.5" ref={containerRef}>
      {label && (
        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={selectedCar ? '' : (searchPlaceholder || t('tco.searchPlaceholder'))}
          value={displayValue}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="w-full px-4 py-3 pr-10 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 text-sm transition-colors"
          aria-label={label || searchPlaceholder || t('tco.searchPlaceholder')}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        />

        {selectedCar && !isOpen && (
          <button
            type="button"
            onClick={() => {
              onChange('')
              setSearchTerm('')
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors rounded-full p-0.5"
            aria-label={t('common.clear')}
            title={t('common.clear')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="3" x2="11" y2="11" />
              <line x1="11" y1="3" x2="3" y2="11" />
            </svg>
          </button>
        )}

        {!selectedCar && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8l4 4 4-4" />
          </svg>
        </div>
        )}

        {isOpen && filteredCars.length > 0 && (
          <div className="absolute z-50 w-full mt-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl max-h-64 overflow-y-auto">
            <div role="listbox">
              {filteredCars.map((car, index) => (
                <button
                  key={car.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlightIndex}
                  onClick={() => handleSelectCar(car.id)}
                  onMouseEnter={() => setHighlightIndex(index)}
                  className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                    index === highlightIndex
                      ? 'bg-accent/10 text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)]/80 hover:bg-[rgba(var(--bg-base-rgb),0.5)]'
                  } ${car.id === value ? 'border-l-2 border-accent' : ''}`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {car.brand} {car.model}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {car.id} • {car.segment} • {car.type}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">
                    {formatVND(car.price)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isOpen && searchTerm && filteredCars.length === 0 && (
          <div className="absolute z-50 w-full mt-2 bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl shadow-2xl px-4 py-3 text-sm text-[var(--text-muted)]">
            {t('browse.noResults')}
          </div>
        )}
      </div>
    </div>
  )
}

