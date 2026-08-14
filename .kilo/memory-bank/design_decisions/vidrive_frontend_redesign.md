# ViDrive Frontend Redesign — Design Decisions

## Date: 2026-07-31

## Context
ViDrive is a Vietnamese automotive TCO (Total Cost of Ownership) calculator. The frontend currently uses an AI-generated aesthetic with gold accents, glassmorphism cards, and floating blur orbs. Five issues need addressing: theme-switch failures, small car silhouette, lack of automotive elements, templated look, and footer simplification.

## Key Decisions

### 1. Color Direction: Emissive Green (replaces gold entirely)
- **Problem:** Gold (`#C9A84C`) is overused in AI-generated UIs. Light mode gold (`#B8941F`) fails to resolve correctly because Tailwind classes use hardcoded hex, not CSS variables.
- **Decision:** Replace gold entirely with an emissive teal-green accent in BOTH themes.
- **Dark mode accent:** `#00FFBD` (emissive teal, glows like a HUD display)
- **Light mode accent:** `#00841D` (rich emerald, AA 4.54:1 on cream `#F8F7F4` — text/UI only). The hero's emissive LED uses a *separate* brighter `--car-led` (`#00E676` light / `#00FFBD` dark), decorative-only and exempt from the text-AA rule, so the signature still "glows" in daylight.
- **Fix mechanism:** Define `--accent` + `--accent-rgb` CSS variables per theme. All RGBA values use `rgba(var(--accent-rgb), N)` for automatic theme switching.
- **Tailwind:** Update config colors to reference CSS variables, not hardcoded hex.

### 2. Signature Element: Tachometer Scroll Indicator
- **Problem:** Generic thin progress bar at top of page.
- **Decision:** Circular tachometer/speedometer that sweeps as user scrolls. Distinctive, automotive-themed, replaces the generic progress bar.

### 3. Car Silhouette: Front-Profile Futuristic EV (visible, theme-adaptive)
- **Problem:** The side-profile art ended up at 0.12 opacity and pushed off-screen (`-translate-y-[115%]`); it was also a single faint shape that washed out in light mode — both the "invisible" and "not theme-adaptive" failures the redesign targeted.
- **Decision:** `CarSilhouette` renders a **Lucid-Air-inspired front-profile luxury EV** (slim signature DRL, swept headlight crescents, flat hood with character creases, upright windshield, low wide track), at **reduced body opacity** so the LED signature is the focal point. Rendered as a small `max-w-xs` low banner beneath the hero CTAs. Every color comes from a CSS var (`--car-body-1/2/3`, `--car-glass-1/2`, `--car-led`, `--car-led-glow`, plus `--accent`) so it re-skins automatically when the `.light` theme class toggles — **zero hardcoded hex, no JS theme branch**. The body/glass group renders at `opacity="0.4"` so the silhouette is a restrained shadow; the DRL + headlights stay at full brightness and are the only "glow" on the page. Light mode uses *darker gunmetal* body stops and a *brighter* emissive `--car-led` (decorative-only, exempt from text-AA) so the signature survives daylight. Animation is limited to a gentle 4-second LED breathing cycle; entrance and scroll-parallax are removed so the element stays decorative, not distracting. All motion disabled under `prefers-reduced-motion`. The face is grouped in `<g id="car-face">` for future flexibility.

### 4. Automotive Patterns: Per-page thematic elements
- Create `AutomotivePatterns` component library with: GrillePattern, TireTread, RacingStripe, CheckeredFlag, DashboardGauge.
- Each page gets at least one automotive-themed element.

### 5. Footer: Disclaimer Only
- Simplify from Logo + nav links + copyright → just the disclaimer text, centered.

### 6. Methodology: Replace Emoji with SVG
- Current emojis (📊📚⛽🔧🛡️) violate design system anti-pattern rules.
- Replace with automotive-themed SVG icons (wrench, fuel pump, tire gauge, clipboard, chart line).

## Benchmark Principles (adapted, not copied)
- **Apple:** Extreme typographic hierarchy, minimal navigation, product-as-hero
- **Monopo:** Cohesive animated background, scroll-snap depth layers, monochromatic + single accent
- **Immersive-G:** Interactive signature element, parallax depth, dark theme with bright accent

## Applied to ViDrive
- Replace floating orbs → automotive pattern background (grille/tire-track subtle patterns)
- Large typography hierarchy (already partially done with Space Grotesk)
- Parallax depth layers (z-indexed elements moving at different scroll speeds)
- Single accent color system (green)

## Fonts
Keep existing: Space Grotesk (heading) + DM Sans (body) + JetBrains Mono (data/mono).
These are already distinctive and work well for an automotive/futuristic aesthetic.
