# ViDrive Web — Beta Product Review

*Review date: 2026-08-15. Reviewed live at `localhost:5173` (frontend) + `localhost:8000` (API), 34 cities / 83 cars, EN + VI. Method: market research + live browser walkthrough + API edge-case probing + code-level UX audit. No code quality/architecture critique unless it affects the user experience.*

---

## Executive Summary

ViDrive is a Vietnamese total-cost-of-ownership calculator for cars — it answers "what does this car *actually* cost me to own for 5 years in Hanoi vs HCMC vs Đà Nẵng, including registration tax, plate fee, fuel, maintenance, parking, and resale?" That is a genuinely painful, frequent, and badly-served question for Vietnamese buyers (the local "giá lăn bánh" math alone trips up first-time buyers, and EV resale anxiety is acute). ViDrive is the only tool I found that does this *Vietnam-specifically* across many models and provinces.

The product is unusually complete for a beta: 12 routes, full bilingual EN/VI (verified — VI renders real Vietnamese with **no raw-key leaks**), a robust API that survives every edge case I threw at it (years=0, km=0, unknown city → 400 with the full city list, years=30, over/under car-count compare → 422), CSV/PDF export, shareable deep links, a custom-car wizard, history, and an audit-able methodology page. No console errors on any page. For a beta it is genuinely shippable.

The gaps are about **depth of the core workflow and a few advanced-concept clarity issues**, not breadth. However, **one issue directly undermines the headline Net TCO number itself** (see Critical #0 below): the resale-value model is systematically wrong for every catalogue car, so the "- resale" term — and therefore Net TCO — is materially off. Beyond that, three things will trip real users: (1) the slider-vs-number-field mismatch shows a red "error" ring for perfectly valid extended inputs; (2) saved scenarios can't be re-opened or edited — History is view/delete only; (3) the "Net TCO" vs "On-Road Price" relationship and the wide 95% confidence band aren't explained in the non-beta (phase-1-gated) build, which can read as vague or alarming to a skeptic.

---

## Top Issues

### 0. CRITICAL — The resale model is systematically wrong, so Net TCO is wrong
- **Severity:** Critical
- **Persona:** Every user (the headline number depends on it)
- **Description:** Net TCO = on-road + operating − resale. The resale sub-model (`calculate_resale` in `backend/src/calculations.py`, `ResalePredictor` in `backend/src/ml_model.py`) was audited against bonbanh.vn median listing prices for all 18 liquid models + VinFast, years 1–8. **Result: 0 of 18 models meet a 4% MAPE gate; overall MAPE = 26.91%.** The defects are structural, not noisy:
  - **Non-monotonic parametric curves** (44 upward value-jumps across 83 cars — a car is predicted worth *more* at y+1 than y, e.g. Jazz y6→y7: 0.41→0.57; Morning y7→y9: 0.46→0.52; Vios y7→y8: 0.62→0.66). Caused by raw sparse per-year means fed into `_interp_group_curve` without monotonisation.
  - **ML→parametric boundary discontinuity** (12 upward jumps) — `calculate_resale` hard-switches at `years > ml_max_year` instead of the `TRANSITION_WIDTH=3` blend AGENTS.md specifies; the parametric anchor it hands off to is inflated.
  - **ICE group curves over-predict by 12–24pp** at y3–y6 (e.g. CX-5 y3: pred 0.745 vs real 0.520; Corolla Cross y5: 0.677 vs 0.451; Vios y6: 0.633 vs 0.459). Diesel Ranger tracks within ~3pp, validating the real data and isolating the bug to the ICE sedan/SUV group anchors (sparse cells + possible base/leakage per the Phase5C gate note). **Directional impact: resale value over-stated → Net TCO UNDER-STATED → every ICE/Volt/PHEV buyer is told the car is cheaper than it really is.**
  - **VinFast floor contradicts its own guarantee.** A flat `VINFAST_LIQUIDITY_FLOOR=0.70` is applied for years ≤3, but the published buyback guarantee declines (VF8: 0.88/0.82/0.76/0.70/0.64). The model floors VF8 at 0.70 in year 2 when VinFast promises 0.82. Impact: VF resale under-stated → Net TCO over-stated → VF cars look ~8–12pp more expensive than the brand guarantees.
- **Evidence:** full per-model predicted-vs-real table and root-cause analysis in `backend/resale_audit.md`; discontinuity scan in `resale_parametric.json`/`resale_liquid.json`.
- **Expected:** Resale predictions within 4% MAPE of bonbanh medians; monotonic non-increasing curves; ML→parametric handoff blended over 3 years; VinFast floor tracking the declining guarantee schedule.
- **Suggested improvement (engineer-facing, see audit §4):** (1) monotonise group anchors via PAVA before interpolation and drop `n<PARAMETRIC_MIN_SAMPLES` cells to segment means; (2) blend ML→parametric over `TRANSITION_WIDTH`; (3) replace the flat 0.70 VF floor with the year-by-year guarantee schedule; (4) recalibrate ICE group anchors against bonbanh + restore `training_data.json` to pure ORIG before retraining. **No frontend change needed except consolidating the VinFast note key (already i18n'd).** The "Data is current" staleness badge and the 95% CI band are honest, but they cannot paper over a structurally biased point estimate — users will treat the headline number as authoritative.
- **Why it matters now:** the review called the headline number "trustworthy." That is no longer defensible until resale is fixed. This must be treated as a release-blocker for any claim of accuracy, because it moves Net TCO by 5–25% for non-VinFast cars and in the wrong direction.

### 1. Slider max vs number-field max shows a false "error" state
- **Severity:** Medium
- **Persona:** First-Time User, Beta Tester
- **Description:** The km slider caps at 50,000 but the `PressToEditNumber` field accepts up to 100,000; the years slider caps at 10 but the field accepts 20. Typing a value above the slider max paints a red `ring-danger` + red slider fill ("slider-overflow"), implying the input is *invalid*. It is not — the backend accepts up to 1,000,000 km/yr and 60 years, and the calculation proceeds correctly.
- **Expected:** A value within the documented field range should never look like an error.
- **Actual:** User types 60,000 km or 15 years, sees red warning chrome, may assume the calc is broken or back off.
- **Suggested improvement:** Drop the danger-ring for in-range-but-above-slider values. Use neutral "extended" styling (e.g., a muted fill) or just let the slider clamp silently while the number reflects the true value. Reserve red strictly for out-of-bounds.

### 2. History cannot be re-opened or edited
- **Severity:** Medium
- **Persona:** Existing Customer
- **Description:** Saved entries expose View / Delete / Export-all only. There is no "open in calculator" or "duplicate & tweak" action. To re-run or adjust a saved scenario you must re-enter car, city, km, years, ratio by hand.
- **Expected:** A saved scenario is a starting point I can return to and modify.
- **Actual:** Saving is a dead-end (view/delete). Repeated re-entry for "what-if" iterations.
- **Suggested improvement:** Add "Reopen" on each history card → navigates to `/tco?car=…&city=…&km=…&years=…&ratio=…` (the deep-link format the app already supports). Low effort, high payoff for the iteration-heavy comparison workflow.

### 3. "Net TCO" and the confidence band are unexplained outside the competitive phase
- **Severity:** Medium
- **Persona:** First-Time User, Skeptical User
- **Description:** The result leads with **On-Road Price** and **Net TCO** (which equals on-road + operating − resale), plus an optional **True Financial Impact** (capital opportunity cost). The plain-language explainers for these (`tco.explainTco`, `tco.explainResale`, `tco.explainMl`) and PDF export are gated behind `VITE_COMPETITIVE_PHASE === '1'`. In the general build a first-timer sees "Net TCO" with no definition, and the 95% CI can be very wide (e.g. a 412M TCO shown as 294M–530M) with no in-context reason why.
- **Expected:** The single most important number should be self-explanatory, and a wide range should be framed, not just displayed.
- **Actual:** Non-phase-1 users get the number without the "what does this mean / why so uncertain" context that exists in code but is hidden.
- **Suggested improvement:** Ungate the inline explainer `<details>` (or a tiny "ⓘ" tooltip on Net TCO) for all users; keep PDF as a phase feature if needed. Add one sentence under the CI band: "Range reflects used-market resale uncertainty, not calculation error."

### 4. Custom cars live only in sessionStorage
- **Severity:** Medium
- **Persona:** Existing Customer, Beta Tester
- **Description:** The Wizard stores the custom car in `sessionStorage`. It appears in dropdowns for the session, but: (a) it disappears on a new tab or after the tab is closed; (b) if you save that car's TCO to History and later clear the session, the saved result points to a `custom-…` id that no longer resolves, so the history row falls back to the raw slug.
- **Expected:** A car I built and saved should stay usable.
- **Actual:** Custom cars are ephemeral and can silently orphan history entries.
- **Suggested improvement:** Persist custom cars to the backend (or at least localStorage) and resolve them when rendering history; or block saving a custom-car result until the car is persisted.

### 5. No cross-city comparison in Compare
- **Severity:** Enhancement
- **Persona:** Existing Customer
- **Description:** Compare applies one city to all selected cars. A user deciding "same car, Hanoi vs HCMC" (very common given 12% vs 10% registration tax and 20M vs 140K plate fees) cannot see it side by side.
- **Expected:** At least a way to compare the same car across two cities.
- **Actual:** Single shared city only.
- **Suggested improvement:** Allow per-row city, or a "compare across cities" mode. (Registration-tax difference alone justifies it.)

### 6. Keyboard shortcuts are powerful but invisible
- **Severity:** Low
- **Persona:** Accessibility Reviewer, Existing Customer
- **Description:** Enter = calculate/recalculate, `Ctrl+K` / `/` = focus search. All functional, but there is no on-screen hint anywhere.
- **Expected:** Discoverable shortcuts.
- **Actual:** Hidden; only power users who read the code will find them.
- **Suggested improvement:** A small "Shortcuts" hint or `?` overlay.

### 7. Instant Reset with no undo
- **Severity:** Low
- **Persona:** Beta Tester
- **Description:** Reset clears all inputs and the result immediately. Accidental click loses the scenario (mitigated by #2 being absent — there's no reload, so this stings more).
- **Expected:** At least a confirm or an undo for a destructive clear.
- **Actual:** One click wipes state.
- **Suggested improvement:** Confirm dialog or a brief "Reset undone" toast.

---

## Positive Findings

- **Vietnam-specific correctness is the real differentiator.** Plate fees split metro (Hanoi/HCMC 14M) vs other Area-1 (140K) per Thông tư 155/2025, EV registration exemption, 34-city area tiers, VinFast resale buy-back floor — none of the global TCO tools (Edmunds, ICCT, IEA) cover this. This is defensible, hard-to-copy value.
- **Honest uncertainty communication.** Data-staleness badge ("Data is current" / "Data is N days old"), a legal-stamp citing the regulatory basis, an audit-able assumptions page, an ML "confidence spread" on resale, and a parametric-fallback warning when years exceed the ML training range. Rare discipline for a beta.
- **Robust, well-messaged errors.** Unknown city → 400 with the full supported-city list; compare with 1 or 5 cars → clear 422; years=0 → on-road = TCO (no crash); km=0 → fuel 0. Beta testers will struggle to break it.
- **Bilingual done right.** Verified VI renders full Vietnamese (e.g. "Tổng chi phí vận hành", "TCO thực vs Giá lăn bánh", "Đỗ xe & Phí cầu đường"). No leaked raw keys.
- **Accessibility is genuinely good:** skip-to-content link, `aria-live` result regions, `sr-only` data tables mirroring both charts, `aria-expanded`/`aria-controls` on every collapsible, focus-visible styles, `prefers-reduced-motion` honored, and an integrated axe-core audit hook.
- **Delight details:** best-value badge on the cheaper car, shareable deep links that auto-calculate, the EV charge-vs-petrol comparison nested in the fuel breakdown, themed Vietnamese cost line-items (Thuế / Biển số / Đăng kiểm / Phí đường bộ / Bảo hiểm) as a visual signature, CSV + PDF + copy-summary export.
- **No console errors** across Landing, TCO, Compare, Browse, Wizard, History, CarDetail, Methodology.

---

## Missing Features

- **Reload/edit saved scenario** (see #2) — the single biggest workflow gap.
- **Cross-city compare** (see #5).
- **Persisted custom cars** (see #4).
- **What-if presets** — e.g. one-click "HCMC / 20k km / 3yr" so first-timers don't have to reason about every slider.
- **Per-line item editable assumptions** in the UI (today only via the separate Config/Methodology proposal surface, which is review-only feedback, not live override).
- **Account/sync** — history is local; cross-device not possible (acceptable for beta, but worth stating).

---

## Product Score

| Category | Score (/10) |
|----------|-------------|
| First Impression | 9 |
| Learnability | 8 |
| Navigation | 9 |
| Efficiency | 7 |
| Reliability | 9 |
| Accessibility | 8 |
| Polish | 8 |
| Delight | 8 |
| Overall | 8.2 |

---

## Final Verdict

ViDrive is one of the more complete, credible betas I've reviewed. It solves a real, frequent, and poorly-served problem for Vietnamese car buyers with a depth of local correctness (provincial plate fees, EV exemptions, VinFast resale floors, 34 cities) that no global TCO tool replicates, and it communicates uncertainty honestly rather than hedging. The engineering is solid: every edge case I probed was handled with a clear message, there were zero console errors, and the bilingual experience is clean.

It is **not yet ready to call "public beta" without three fixes**: (1) stop painting valid extended inputs (km > 50k, years > 10) as red errors — it scares users off a legitimate calc; (2) make saved scenarios re-openable, because a compare/what-if tool that can't reload its own saved work forces tedious re-entry; and (3) ungate the plain-language "what is Net TCO / why is the range wide" explainers for all users, since the headline number is otherwise unexplained for first-timers and alarming for skeptics. The custom-car-in-sessionStorage fragility and the missing cross-city compare are the next wave.

None of these are architecture problems — they're the last mile of a workflow that's 85% there. Fix the slider-error illusion, add "reopen from history," and surface the explainers, and this is a confident public beta with a real moat. As an investor lens: the problem is large (Vietnam adds ~300k+ new passenger cars/year, concentrated in two mega-cities with divergent fee regimes), the substitute set is weak (spreadsheets, dealer quotes, VinFast's self-serving EV-only calculator), and the differentiation is defensible. It reads as a fundable seed-stage product, not a class project — provided the team keeps the assumptions transparent and resists paywalling the honesty that makes it trustworthy.
