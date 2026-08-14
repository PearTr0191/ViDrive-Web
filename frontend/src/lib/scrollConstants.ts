/**
 * Shared constants between TachometerScroll (desktop) and VerticalScrollbar (mobile).
 *
 * REDLINE_THRESHOLD marks the scroll-progress point at which the indicator
 * enters its "near-bottom" visual state. On desktop the tachometer needle/arc
 * turns red at this threshold. The mobile VerticalScrollbar uses this same
 * boundary for its pre-painted track gradient (83 % → 90 % green→red,
 * 90 % → 100 % solid red), plus a separate CRITICAL_THRESHOLD (0.97) local
 * to that component for the "entire bar turns red" race-car override.
 */
export const REDLINE_THRESHOLD = 0.9
