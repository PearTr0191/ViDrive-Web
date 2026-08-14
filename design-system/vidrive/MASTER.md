# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** ViDrive
**Generated:** 2026-07-31 14:59:16
**Category:** Automotive/Car Dealership
**Design Dials:** Variance 8/10 (Bold / Asymmetric) | Motion 7/10 (Standard) | Density 5/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Dark Mode | Light Mode | CSS Variable |
|------|-----------|-----------|-------------|
| Base background | `#0A0A12` | `#F8F7F4` | `--bg-base` |
| Surface | `#131320` | `#FFFFFF` | `--bg-surface` |
| Elevated | `#1A1A2E` | `#F0EFEA` | `--bg-elevated` |
| Text primary | `#F5F0E8` | `#1A1A2E` | `--text-primary` |
| Text secondary | `#A8A8B8` | `#4A4A5E` | `--text-secondary` |
| Text muted | `#6B6B80` | `#8A8A9E` | `--text-muted` |
| **Accent** | `#00FFBD` | `#00C853` | `--accent` |
| Accent warm | `#00E6B3` | `#00B249` | `--accent-warm` |
| Accent RGB | `0, 255, 189` | `0, 200, 83` | `--accent-rgb` |
| Accent glow | `rgba(0,255,189,0.3)` | `rgba(0,200,83,0.2)` | `--accent-glow` |
| Border subtle | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` | `--border-subtle` |
| Border default | `rgba(255,255,255,0.10)` | `rgba(0,0,0,0.10)` | `--border-default` |
| Border strong | `rgba(255,255,255,0.15)` | `rgba(0,0,0,0.15)` | `--border-strong` |

**Color Notes:** Emissive teal-green accent for futuristic automotive feel. No gold anywhere.

### Typography

- **Heading Font:** Space Grotesk
- **Body Font:** DM Sans
- **Mono:** JetBrains Mono
- **Mood:** futuristic, automotive, clean, precise, digital cockpit

**Google Fonts:** [Space Grotesk + DM Sans + JetBrains Mono](https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 5/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: var(--accent);
  color: var(--bg-base);
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 2px solid var(--accent);
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.2);
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: var(--bg-surface);
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Signature Element

**Tachometer Scroll Indicator:** A circular tachometer/speedometer that serves as the page scroll progress indicator. The needle sweeps from 0 to max RPM as the user scrolls. It turns red near the end of the page and flashes green-red when the user attempts to scroll past the bottom, with the needle bouncing off the limiter. This replaces the generic progress bar and vertical scrollbar.

---

## Style Guidelines

**Style:** Digital Cockpit / Futuristic Automotive

**Keywords:** automotive, futuristic, emissive, teal, digital cockpit, speedometer, tachometer, grille, tire-tread, clean, precise, high-tech

**Best For:** Automotive websites, car dealerships, vehicle configuration tools, TCO calculators, car comparison platforms

**Key Effects:** 
- Tachometer scroll indicator (circular progress with needle)
- Grille patterns as section dividers
- Tire-tread timeline markers
- Checkered flag for "winner" indicators
- Emissive accent glow on interactive elements
- Car silhouette parallax backgrounds

---

## Motion

**Stagger List** (Standard) — Trigger: load or scroll | Duration: 300-450ms | Easing: `back.out(1.4)`

```js
gsap.from('.grid-item', { opacity: 0, scale: 0.92, y: 16, duration: 0.4, stagger: { each: 0.06, from: 'start', grid: 'auto' }, ease: 'back.out(1.4)' });
```

**Framework notes:** grid: 'auto' lets GSAP infer rows/columns from a CSS grid layout for a natural wave stagger

- ✅ Combine with from: 'center' for a bento-grid layout to draw the eye inward first
- ❌ Don't use back.out on dense data tables; the overshoot reads as sloppy on informational UI
- ⚡ Group DOM writes; avoid interleaving layout reads (getBoundingClientRect) between staggered tweens

---

## Anti-Patterns (Do NOT Use)

- ❌ Static product pages
- ❌ Poor UX
- ❌ Gold color (`#C9A84C`) anywhere in the codebase
- ❌ Floating glass orbs as background decoration
- ❌ Emoji icons in UI — use automotive SVG icons instead
- ❌ Hardcoded `rgba(201, 168, 76, ...)` values
- ❌ Templated numbered step markers unless representing a real sequence

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (AutomotivePatterns library)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y
- ❌ **Gold fonts in light mode** — Use emissive green (`--accent`) instead

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (AutomotivePatterns)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
- [ ] Accent color resolves correctly in both light and dark themes
- [ ] No hardcoded gold values (`#C9A84C`, `rgba(201, 168, 76, ...)`)
- [ ] Automotive elements present on all pages (car silhouette, grille patterns, etc.)