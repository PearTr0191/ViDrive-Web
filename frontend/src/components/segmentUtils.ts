type SegmentKey = 'sedan' | 'suv' | 'hatchback' | 'mpv' | 'ev'

export function mapSegment(type?: string, segment?: string): SegmentKey {
  const t = (type || '').toUpperCase()
  if (t === 'EV') return 'ev'
  const s = (segment || '').toLowerCase()
  if (s.includes('suv') || s.includes('crossover') || s.includes('cuv')) return 'suv'
  if (s.includes('hatch')) return 'hatchback'
  if (s.includes('mpv') || s.includes('van') || s.includes('minivan')) return 'mpv'
  if (s.includes('pickup') || s.includes('truck')) return 'suv'
  return 'sedan'
}