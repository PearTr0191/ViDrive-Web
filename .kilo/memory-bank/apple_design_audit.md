# Apple Fluid Interfaces Protocol — Audit of ViDrive Web Frontend (STALE)

**Date:** 2026-08-18  
**Scope:** `frontend/src/` — React 19 + Tailwind + Framer Motion v12  
**Protocol basis:** Apple WWDC *Designing Fluid Interfaces* (2018), distilled to web primitives (CSS, Pointer Events, `requestAnimationFrame`, Framer Motion v12); springs preferred over CSS transitions/animated-GIF loops

---

## 1. Foundations (§D: Purpose, §Typography, §Materials/Depth, §K: Reduced Motion, §L: Multimodal Feedback)

### §Typography — PASS (4/4)

| Role | Font | Usage |
|------|------|-------|
| Heading | Space Grotesk, variable-weight 400;500;600;700 | Automotive futurist character, used with restraint |
| Body | DM Sans, opsz-axis 9..40 | Optical sizing present, good for readability at small sizes |
| Mono/Data | JetBrains Mono | Distinct from heading/body, good for numeric data |

**Gap:** No explicit letter-spacing (tracking) or line-height tokens in `:root`. Type scale relies on Tailwind defaults (`text-sm`, `text-lg`, etc.) rather than a defined modular scale.

**Recommendation:** Add `--tracking-tight`, `--tracking-normal`, `--tracking-wider` CSS vars; set `line-height: 1.5` on body, `1.2` on headings (tuned to Space Grotesk's taller ascenders).

### §Materials & Depth — PARTIAL (2/4)

Glassmorphism implemented via `backdrop-filter: blur(20px)` with `--glass-bg: rgba(..., 0.45) / rgba(..., 0.55)` for light mode — layered depth is present (background → surface → elevated → glass-card).

**Gap 1:** No `prefers-reduced-transparency` media query. Glass cards remain translucent even when the user has requested reduced transparency.

**Gap 2:** Elevation hierarchy uses only 3 surfaces (`--bg-base`, `--bg-surface`, `--bg-elevated`). No z-axis shadow tokens (e.g., `--shadow-sm`, `--shadow-lg`) — all shadows are inline on individual elements.

**Fix:**
```css
/* index.css — add after .glass-card block */
@media (prefers-reduced-transparency: reduce) {
  .glass-card,
  .glass-card-glow,
  [class*="glass-card"] {
    --glass-bg: rgba(var(--bg-base-rgb), 0.9);
    --glass-blur: 0px;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
```

### §K Reduced Motion — FAIL (1/4)

**CSS level:** Zero `@media (prefers-reduced-motion: reduce)` in `index.css`. Three CSS keyframe animations run unconditionally:
- `.skeleton` → `animation: shimmer 1.5s infinite` (index.css:334)
- `.accent-gradient` → `animation: accent-shift 3s ease infinite` (index.css:297)
- `.metallic-shine::before` → `animation: shimmer 2s infinite` (index.css:319)

**JS level:**
- `AnimatedCounter` (AnimatedCounter.tsx:27-48) — no `useReducedMotion()` guard; runs 1500ms rAF loop regardless
- `TcoCalculator` — `animate-spin` (lines 1089, 1655) with no guard
- `BrowseCars` — `animate-pulse` skeleton (line 204) with no guard

**Positive:** `CostBars`, `Hero3DCar`, `SocialProofLine`, `TachometerScroll`, `Layout` all correctly use `useReducedMotion()` / `prefersReduced`.

**Fix:**
```css
/* index.css — add to @layer components or at end */
@media (prefers-reduced-motion: reduce) {
  .skeleton,
  .accent-gradient,
  .metallic-shine::before,
  .animate-spin,
  .animate-pulse {
    animation: none !important;
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
  }
  .skeleton {
    background: linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-elevated) 50%, var(--bg-surface) 75%);
  }
}
```

```tsx
// AnimatedCounter.tsx — add guard (line 26-28)
const prefersReduced = useReducedMotion()
useEffect(() => {
  if (!isInView || prefersReduced) return
  // ... existing animation logic
}, [isInView, value, duration, prefersReduced])
```

### §L Multimodal Feedback — PARTIAL (2/4)

Visual feedback is strong and consistent: `AccentButton` uses scale transform + ripple; `CarMedia` uses hover scale + glow ring; `GlassCard` uses border-color + shadow intensification.

**Gap 1:** No non-visual feedback channel (haptics). No `navigator.vibrate()` call on primary actions. No screen-reader live region for calculation results. (Note: TCO result has `aria-live="polite"` + `aria-atomic="true"` at TcoCalculator.tsx:934 — this is correct and good.)

**Gap 2:** Button states use visual-only feedback. `select` elements in `TcoCalculator.tsx:743` and `Compare.tsx:430` have `focus:outline-none focus:border-accent/50` but **no `focus:ring`**.

**Fix:**
```tsx
// TcoCalculator.tsx line 743, Compare.tsx line 430
className="... focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/50 transition-colors"
```

---

## 2. Behavior Over Animation (§M: Behavior-Over-Animation, §N: Orchestration, §O: Restraint)

### §M Behavior-Over-Animation — PASS (3/3)

`TachometerScroll` is the standout — **1:1 pointer drag with `setPointerCapture`**, immediate position updates via `thumbY.set()` (no JS spring lag), velocity handoff via `window.scrollTo({behavior: 'smooth'})` on release. CSS provides "ebb and flow" smoothing (`SPRING_EASING = [0.34, 1.56, 0.64, 1]`).

`CostBars` uses Framer Motion for bar width growth — appropriate for data visualization feedback.

`Hero3DCar` wheel spin uses raw `requestAnimationFrame` — appropriate for continuous ambient motion, cancellable on unmount.

**One anti-pattern:** `CostBars` animates `width` (CSS property that triggers layout) instead of `transform: scaleX()`. Violates the motion engineering bar's "animate transform and opacity only" rule.

```tsx
// CostBars.tsx — replace width animation with transform
<motion.div
  initial={prefersReduced ? false : { scaleX: 0 }}
  animate={{ scaleX: 1 }}
  transition={{ duration: 0.6, ease: 'easeOut' }}
  className="absolute inset-y-0 left-0 origin-left rounded-full"
  style={{
    width: `${tcoPct}%`,  // for layout sizing, not animation
    background: 'linear-gradient(90deg, var(--accent), var(--accent-cold))',
  }}
/>
```

### §N Orchestration — PARTIAL (2/4)

`Compare.tsx` cards use staggered entrance: `transition={{ delay: i * 0.1 }}` (line 551) — good, but should be 30-80ms per protocol, not 100ms.

`Layout.tsx` page transitions use `duration: 0.35, ease: [0.33, 1, 0.68, 1]` — at the maximum acceptable (300ms cap). Route change `key={location.pathname}` triggers enter/exit simultaneously — could conflict.

`DropdownMenu` has **zero orchestration** — pops in instantly with no `AnimatePresence`. This is the single biggest "jarring change" on the site.

**Fix:**
```tsx
// DropdownMenu.tsx — add to the portal'd div
<motion.div
  initial={{ opacity: 0, y: -8, scale: 0.95 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, y: -8, scale: 0.95 }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
  ...
>
```

### §O Restraint — PASS (4/4)

Motion is sparse and purposeful. `Hero3DCar` ambient spin is the only continuous animation (justified — luxury car showcase). `AccentButton` ripple fires only on click. `CostBars` bar fill is a one-shot data-reveal.

No gratuitous parallax or floating elements. The `accent-gradient` keyframe shift is the only "always-on" animation (3s cycle, barely perceptible).

Minor: `metallic-shine` sweep animation on `AccentButton` primary variant is a `pointer-events-none` decorative overlay — acceptable under restraint principle.

---

## 3. Response (§A) and Direct Manipulation (§B)

### §A Response — PASS (4/4)

| Interaction | Latency | Rating |
|------------|---------|--------|
| AccentButton press | Immediate `whileTap scale 0.98` | ✅ |
| CarMedia hover | `transition-transform duration-500` | ⚠️ (500ms too slow; should be 150-300ms) |
| CarSearchSelect option hover | `transition-colors` | ✅ |
| Range slider drag | Live `onChange` → state update | ✅ |
| PressToEditNumber click | Immediate `<input>` swap | ✅ |

**Fix:**
```tsx
// CarMedia.tsx line 83
className="... transition-transform duration-200 group-hover:scale-105"
```

### §B Direct Manipulation — PASS (4/4)

- **TachometerScroll:** Full 1:1 pointer drag with `setPointerCapture`, `touch-action: 'none'`, immediate position mapping. Gold standard.
- **PressToEditNumber:** Click-to-edit with `role="spinbutton"`, Enter/Space to activate, Escape to revert. Correct.
- **CarSearchSelect:** Typeahead filter updates on `onChange` with immediate DOM feedback. Keyboard navigation (ArrowUp/Down, Enter) works. `onMouseEnter` highlights option.
- **Range sliders:** Live `onChange` → `setKm(years/ratio)` state update, slider fill bar updates via CSS `--val` variable. Correct.

---

## 4. Interruptibility & Velocity (§C, §D, §E)

### §C Interruptibility — PASS (4/4)

- **Hero3DCar wheel spin:** `requestAnimationFrame` loop, cancellable via cleanup function. ✅
- **AnimatedCounter:** `cancelAnimationFrame(rafId)` on cleanup. ✅
- **TachometerScroll:** During drag uses `scrollTo({behavior: 'instant'})` — no animation to interrupt. On release, `scrollTo({behavior: 'smooth'})` — browser handles momentum natively; user scroll mid-smooth-scroll overrides. ✅
- **CostBars:** Framer Motion animations inherently interruptible (auto-handled). ✅

### §D Momentum Projection — PASS (4/4)

- **TachometerScroll `handlePointerUp`:** Computes `targetTop`, then `window.scrollTo({top: targetTop, behavior: 'smooth'})` — native browser momentum. ✅
- **Hero3DCar wheel spin:** `spinSpring = useSpring(spin, {stiffness: 60, damping: 18})` adds natural resistance to idle rotation. ✅

### §E Spatial Consistency — PARTIAL (2/4)

- **DropdownMenu:** Correctly anchors to trigger via `getBoundingClientRect()` (line 20: `top: rect.bottom + 4, right: window.innerWidth - rect.right`). ✅
- **TachometerScroll:** Thumb position matches scroll position 1:1 — spatial consistency maintained. ✅

**Gap 1:** DropdownMenu does not flip to the left when near the right screen edge — can render partially off-screen. No collision detection.

**Gap 2:** CarMedia hover scale origin defaults to center — should originate from the car's visual weight, not the center of the container.

---

## 5. Gesture Details (§F, §G, §H)

### §F Hinting — PASS (3/4)

- **TachometerScroll:** `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-valuetext` — complete. ✅
- **Range sliders:** All have `aria-valuenow/min/max` + `aria-valuetext` with units (e.g., `${km.toLocaleString()} km`). ✅
- **PressToEditNumber:** `role="spinbutton"` + `aria-valuenow/min/max`. ✅
- **CarSearchSelect:** `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`, `aria-selected` on options. ✅

**Gap:** `Breadcrumbs` — `aria-current` is handled by `NavLink` in `Layout.tsx:89` (`aria-current={location.pathname === item.path ? 'page' : undefined}`), but `Breadcrumbs` reads from `useLocation()`, so the active crumb isn't marked `aria-current="page"`. (Note: Breadcrumbs.tsx was not read in this session — verify in codebase.)

### §G 1px Movement — PARTIAL (2/4)

- Range slider thumb grows `scale(1.2)` on hover (index.css:216) — acceptable, not 1px.
- AccentButton uses `whileTap={{ scale: 0.98 }}` — 2% shrink. ✅
- CarMedia hover scale uses `duration-500` — too slow (should be 150-300ms). Fix: `duration-200`.
- CarMedia hover glow ring (`opacity-0 transition-opacity duration-300 group-hover:opacity-100`) — 300ms at upper bound, acceptable.

### §H Accessibility Focus — PARTIAL (2/4)

- AccentButton: `focus:outline-none focus:ring-2 focus:ring-accent/50` — good. ✅
- PressToEditNumber: `<span>` has `tabIndex={0}` + `onClick` + `onKeyDown` for Enter/Space. ✅
- CarSearchSelect: Input has `focus:ring-2 focus:ring-accent/20`. ✅

**Gap:** `select` elements in `TcoCalculator.tsx:743` and `Compare.tsx:430` use `focus:outline-none focus:border-accent/50` but missing `focus:ring`. Also missing `:focus-visible` distinction.

```tsx
// TcoCalculator.tsx line 743, Compare.tsx line 430
className="... focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/50 transition-colors"
```

---

## 6. Frame-Level Smoothness (§L) — PASS (4/4)

All animation properties are `transform`/`opacity` (Framer Motion handles this automatically). ✅  
Hero3DCar uses `requestAnimationFrame` — 60fps. ✅  
AnimatedCounter uses `requestAnimationFrame` — 60fps. ✅

**Gap (resolved by P1 patch above):** `CostBars` animates `width` (not `transform`) — triggers layout recalc each frame. Fixed by switching to `transform: scaleX`.

---

## 7. Process (§P: Critique)

### What's Working

1. **Strong a11y foundation** — `aria-live`, `aria-atomic`, `sr-only` skip link, `role="img"` on charts with `aria-label`, `sr-only` data tables for screen readers
2. **SocialProofLine skeleton-delay pattern** (1500ms before showing skeleton) prevents flash of `₫0`
3. **Layout page transition** respects `prefersReduced`
4. **TachometerScroll** is a textbook implementation of direct manipulation with velocity handoff

### What Needs Change (ranked by impact + ease)

| Priority | Issue | Files | Effort |
|----------|-------|-------|--------|
| P0 | Add `@media (prefers-reduced-motion: reduce)` to suppress CSS keyframes | index.css | 5 min |
| P0 | Guard AnimatedCounter + animate-spin/animate-pulse with `useReducedMotion()` | AnimatedCounter.tsx, TcoCalculator.tsx, BrowseCars.tsx | 10 min |
| P0 | Add `prefers-reduced-transparency` fallback for glass cards | index.css | 5 min |
| P1 | Add `focus:ring` to all `select` elements | TcoCalculator.tsx:743, Compare.tsx:430 | 2 min |
| P1 | Animate CostBars bar width via `transform: scaleX` instead of `width` | CostBars.tsx | 5 min |
| P1 | Add `AnimatePresence` enter/exit to DropdownMenu portal | DropdownMenu.tsx | 10 min |
| P1 | Change CarMedia hover `duration-500` to `duration-200` | CarMedia.tsx:83 | 1 min |
| P2 | Change staggers from `delay: i * 0.1` to `i * 0.06` | Compare.tsx:551 | 1 min |
| P2 | Add explicit typography tracking/leading tokens | index.css | 5 min |

### Architectural Note

The codebase has a **mixed approach to reduced-motion** — some components use `useReducedMotion()` as a JS guard (`CostBars`, `TachometerScroll`, `Layout`, `SocialProofLine`), while others rely on CSS `animate-spin`/`animate-pulse`/`animate-[keyframes]` with no guard (`TcoCalculator`, `BrowseCars`, `AnimatedCounter`). The CSS `@media (prefers-reduced-motion: reduce)` block is the single missing piece that would catch the latter group in one stroke.

Additionally, `useReducedMotion()` from Framer Motion returns `boolean | null` — several components correctly handle this with ternary (`prefersReduced ? false : { ...motionProps }`), but `Hero3DCar` uses a custom ref-based check (`useReducedMotionFlag`) that **doesn't react to OS preference changes at runtime** (only checked on mount). Should be refactored to use the Framer Motion hook directly.
