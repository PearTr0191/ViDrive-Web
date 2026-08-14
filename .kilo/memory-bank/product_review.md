# ViDrive Web — Product Review (Persona UX Audit)

**Date:** 2026-08-14
**Reviewer:** Kilo (persona-based UX audit, executed directly)
**Scope:** Frontend UX only — all primary surfaces (Landing, TCO Calculator, Compare, Browse, Wizard, Car Detail, History, Methodology, Config, Layout). No code/architecture/naming review except where it directly affects UX.
**Method:** Market research (Vietnam car-TCO context) → read every page/component → 6-persona walkthrough → 8-category scoring matrix.
**Servers at review time:** backend `:8000` (PID 20172), frontend Vite `:5173` (PID 25376). Locale verified via `localStorage['vidrive-locale']='vi'` + reload (the `?lang=` query param is a no-op).

---

## 1. Executive Summary

ViDrive ships a coherent, distinctive "emissive-green glassmorphism" identity and a genuinely useful cost-of-ownership tool. Core flows (TCO calc, comparison, browse, custom-car wizard) are complete with thoughtful touches: debounced URL sync for shareable links, CSV/PDF export, keyboard shortcuts, reduced-motion support, and a clear "best value" verdict.

**Two concrete, reproducible UX bugs were found** that each break a primary call-to-action:

1. **The "Compare" button on a Car Detail page is dead.** It deep-links with `?cars=<id>`, but the Compare page only reads `?car=` / `?car0..3`. The ID is silently dropped and the user lands on an **empty Compare form** (P1).
2. **Browse mobile cards mislabel EV consumption as `L/100km`.** The app already knows the correct `kWh/100km` unit (used on Car Detail), but the mobile card hardcodes `L/100km` for every drivetrain (P2).

Overall UX score: **~4.0 / 5** with strong polish and two clear P1/P2 fixes. Neither defect requires a large change; both are small, well-localized edits.

---

## 2. Market Research Brief (Vietnam car-TCO)

Typical ViDrive user = Vietnamese first-time or upgrading car buyer, 25–45, researching a 5-year ownership cost before visiting a showroom. Key local vocabulary and mental models confirmed via web research:

- **"Giá lăn bánh"** (on-road price) is the number buyers actually compare — MSRP + registration tax (phí trước bạ) + plate + inspection + year-1 road/insurance fees. The app's `on_road` concept maps perfectly to this.
- **Registration tax**: Hanoi 12%, HCMC 10% (other provinces 10–12%); EV incentive schedule — **2026 = 100% exempt, 2027–2029 = 50%, post-2029 = full** — is a live, high-salience topic Vietnamese buyers track.
- **VinFast buyback/liquidity floor** is a real differentiator ViDrive already models (resale note in results) — strong trust signal for local users.
- **Mandatory civil insurance** (~480k–1M VND/yr) and **registration fee** (~340k) are expected line items, not surprises.
- **5-year ownership** framing matches how Vietnamese buyers think; the app's default `years=5`, `km=15000` is realistic.

**Implication for UX:** the jargon and defaults already match the market. The bugs below hurt *trust* (a broken "Compare" link reads as "this app is half-finished") more than function, which is exactly why they rank P1.

---

## 3. Persona Walkthroughs

### Persona 1 — First-Time User (young Hanoi buyer, phone-first)
- **Landing → TCO**: hero CTA + "Calculate" path is obvious; stats (car count, cities, ML models, 5–30 yr range) build credibility.
- **Pain point**: taps **"Compare"** on a car she's viewing → lands on blank Compare with *no car selected*. She assumes the feature is broken and bounces. **(Bug #1, P1)**
- **Browse on mobile**: sees an EV listed as `15.50 L/100km` — contradicts the `kWh/100km` she saw on the detail page; she distrusts the data. **(Bug #2, P2)**

### Persona 2 — Beta Tester (power user, desktop)
- Loves: URL-sync share links, `Ctrl+K` / `/` search focus, CSV/PDF export, "best value" glow.
- Flags: pasting a `/compare?cars=...` link from a friend does nothing (same root cause as #1); the `?cars=` param is also what a shared deep-link would use, so shareability of a *single pre-filled Compare* is broken.

### Persona 3 — Existing Customer (returning to re-run a scenario)
- History page + "Save to History" from Compare works; re-opening a saved compare restores inputs.
- Minor: locale is sticky via localStorage, but the `?lang=` param in shared links does nothing — a returning user who shares a `?lang=en` link to a Vietnamese friend gets VI anyway. Low severity (defaults are sensible) but worth a note.

### Persona 4 — Skeptical User ("is this just a guess?")
- Reassured by: Methodology page, legal stamp (Thông tư 155/2025 basis), ML badge + resale spread, VinFast liquidity note.
- The unit mismatch (#2) and dead Compare link (#1) actively undermine the "we're precise" positioning. Fixing them is the highest-leverage trust win.

### Persona 5 — Accessibility Reviewer
- **Good**: `useReducedMotion` honored on Landing/Compare/CarDetail; `aria-sort` on Browse sortable headers; focus rings on inputs; keyboard shortcuts (Enter=calc, Ctrl+K=search).
- **Gaps**: 
  - Browse mobile card hardcodes a non-localized `L/100km` literal (fails i18n *and* unit correctness).
  - Powertrain badges use colored text on colored backgrounds (`bg-emerald-900 text-white`, `bg-accent text-[var(--bg-base)]`) — verify AA contrast in both themes (light-mode `bg-accent`=#00841D on light bg is fine; dark-mode emerald-900 on dark bg for the *badge text* is fine, but the *unselected* chip `text-[var(--text-secondary)]` on `bg-[rgba(...)]` should be spot-checked).
  - `aria-live="polite"` on Compare results is good; ensure it doesn't announce on every keystroke (it's gated behind `results`, so OK).

### Persona 6 — Startup Investor (demoing to a partner)
- Impression: "polished, serious, local-market-aware." 
- The two bugs are exactly what a sharp investor clicks first ("show me compare two cars") → blank form → deal-room awkwardness. **P1 fix is demo-critical.**

---

## 4. Scoring Matrix (0–5, weighted toward trust-critical categories)

| Category | Score | Notes |
|---|---|---|
| First Impression | 4.0 | Strong hero/CTA; dead Compare link dents confidence. |
| Learnability | 4.0 | Inline hints + phase-1 explainers; unit assumptions undocumented. |
| Navigation | 4.0 | Breadcrumbs, shortcuts, consistent shell; deep-link dead-end. |
| Efficiency | 4.5 | Sliders, debounced URL sync, export, keyboard shortcuts. |
| Reliability | 4.0 | Good error/404 states; `?cars=` param silently ignored = functional gap. |
| Accessibility | 3.5 | Reduced-motion, aria-sort, focus rings present; hardcoded non-i18n unit + badge contrast to verify. |
| Polish | 3.5 | Two concrete unit/param bugs break the "pixel-perfect" feel. |
| Delight | 4.0 | Signature silhouette, ML badge, verdict, best-value glow. |
| **Weighted Overall** | **~4.0** | Excellent baseline; 2 small fixes → ~4.5. |

---

## 5. Detailed Findings

### P1 — Car Detail "Compare" deep-link is dead
- **Where:** `frontend/src/pages/CarDetail.tsx:164` → `<Link to={`/compare?cars=${car.id}`}>`
- **Root cause:** `frontend/src/pages/Compare.tsx:64-74` parses only `searchParams.get('car')` and `car0..car3`. The `cars` key is never read, so `initialCarIds` falls back to `['', '']` and the selected car is lost.
- **Impact:** Every "Compare" CTA from a Car Detail page (and any shared `/compare?cars=...` link) opens an empty form. Highest-visibility broken flow; directly hurts trust for First-Time/Skeptical/Investor personas.
- **Recommended fix:** Either change `CarDetail.tsx:164` to `/compare?car=${car.id}` (single-car Compare input is already supported at `Compare.tsx:66-67`), **or** add `cars` parsing to `Compare.tsx` initialCarIds. The single-line `?car=` change is the minimal, safe fix and keeps param semantics consistent with Browse's `/tco?car=` and TCO's own `?car=` convention.

### P2 — Browse mobile cards show EV consumption as `L/100km`
- **Where:** `frontend/src/pages/BrowseCars.tsx:444` → `{c.consumption.toFixed(2)} L/100km` (mobile card only).
- **Root cause:** unit is hardcoded as a literal string. The app already has the correct logic in `CarDetail.tsx:55-59` (`formatConsumption` returns `kWh/100km` for `type==='EV'`, else `L/100km`). Desktop table (line 390) dodges this by showing only the number under a `browse.consumption` header, but the mobile card appends the wrong unit.
- **Impact:** EVs display physically impossible "litres/100km"; contradicts Car Detail; fails i18n (literal English unit, not localized). Affects mobile-first Vietnamese users (Persona 1).
- **Recommended fix:** reuse/extract `formatConsumption` (or a shared util) so Browse mobile renders the correct, localized unit per `type`. Also localize the unit string via i18n rather than a hardcoded literal.

### P3 — `?lang=` query param is a no-op (consistency, low severity)
- **Where:** `Layout.tsx` locale switching is driven by `localStorage['vidrive-locale']` only.
- **Impact:** Shared `?lang=en` links don't switch language; minor confusion, no data loss.
- **Recommended fix (optional):** on app load, if `?lang=` is present, set `localStorage` and reload once, then strip the param. Low priority.

### P4 — Verify powertrain-badge contrast in both themes
- **Where:** `BrowseCars.tsx:13-25` (`powertrainColors` / `powertrainDotColors`) and Compare type badges.
- **Action:** spot-check AA contrast for the unselected chip text `text-[var(--text-secondary)]` on the translucent `bg-[rgba(var(--bg-base-rgb),0.3)]` in light mode, and the dark-mode emerald/amber badges. No change needed if compliant; document the check.

---

## 6. Prioritized Recommendations

| Priority | Fix | Effort | Trust impact |
|---|---|---|---|
| **P1** | CarDetail Compare link → `?car=` (or parse `cars` in Compare) | ~1 line | High — restores a primary CTA |
| **P2** | Browse mobile EV unit via shared `formatConsumption` + i18n | ~5 lines | Medium-High — data correctness + i18n |
| P3 | Honor `?lang=` on load (optional) | ~10 lines | Low |
| P4 | Badge contrast spot-check (verify, fix if needed) | ~0–few lines | Low-Medium (a11y) |

**Bottom line:** ViDrive's UX is already strong and market-appropriate. Shipping P1+P2 (both trivial, localized edits) removes the only two flows that currently make the product look unfinished, and would move the overall score from ~4.0 to ~4.5.
