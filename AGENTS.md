# ViDrive Web — Project Guide for Kilo

## Quick Start
- **Frontend dev**: `node node_modules/vite/bin/vite.js` (port 5173), uses native Node `http` server for dev. Vite proxies `/api/*` to `http://localhost:8000` via `VITE_API_URL` env var.
- **Backend dev**: `python server.py` (port 8000) from `backend/` dir. Imports `src.api:app`.
- **Build**: `node node_modules/vite/bin/vite.js build` — use npx `node_modules/.bin/tsc` (NOT `npx tsc`).
- **Typecheck**: `node node_modules/typescript/bin/tsc --noEmit`
- **Type check**: `node_modules/.bin/tsc --noEmit` = 0 errors expected. Vite dev server strips types without checking.

## Key Gotchas
- **PowerShell**: `;` instead of `&&` for chaining. Use batch files for `cd` + `node` in paths with spaces.
- **framer-motion v12 + React 19**: Use `HTMLMotionProps<'element'>` not `React.HTMLAttributes` for motion component props.
- **useReducedMotion() returns `boolean | null`** — use ternary `prefersReduced ? false : { ...motionProps }}`.
- **tsc --noEmit does NOT catch all errors** — Vite build (rolldown/OXC) catches JSX syntax errors and duplicate declarations that tsc misses. Always run BOTH.
- **GlassCard extends `HTMLMotionProps<'div'>`** so motion props work directly.
- **ConfigProposals accepts only `hideBreadcrumbs?: boolean`** — do NOT pass `onBack`.
- **i18n source URLs**: stored as VALUES under `methodology.source.*`, not separate label/url pairs.
- **Pydantic response_model STRIPS undeclared fields** — when adding a new field to a calculation result (e.g. `resale_note_key`), declare it on BOTH the backend Pydantic model in `api.py` AND the frontend `TcoResult` interface in `lib/api.ts`. Otherwise the field is silently dropped from the HTTP response and the frontend reads `undefined`/null.
- **Python source read for ast.parse** — Windows default encoding is cp1252; use `io.open(p, encoding="utf-8")` or `python -m py_compile` to handle files with Vietnamese characters.
- **i18n bundle naming inconsistency**: EN bundle uses `unit.*` (singular), VI bundle originally used `units.*` (plural). Resolved by adding `unit.*` aliases to VI so a single `t('unit.years')` call works in either locale. When adding new unit keys, add to BOTH `unit.*` and `units.*` in the VI bundle for backward compat.
- **Multi-word autocomplete search**: When searching across multiple fields (brand, model, id, segment), tokenize the query on whitespace and require ALL tokens present in the joined searchable text. Per-field `stripDiacritics(field).includes(term)` fails for queries like "VinFast VF 8" because no single field contains the full phrase as substring.
- **VinFast resale floor + decay model**: For brands with buyback guarantees, model the floor as active for N years then decay: `floor = base_rate × (1 - decay)^(years - N)`. Decay rate should match the organic depreciation curve so there's no discontinuity at the window boundary.

## File Map
- **i18n**: `frontend/src/lib/i18n.tsx` (NOT `src/i18n/en.ts` — single file with `en` and `vi` exports)
- **API client**: `frontend/src/lib/api.ts` — `configApi`, `carApi`, `tcoApi`, `historyApi`
- **Types**: `frontend/src/lib/api.ts` exports `AssumptionsResponse`, `AssumptionItem`, `AssumptionGroup`, `CarInfo`, `CarDetail`, `CarSummary`, `ComparisonResult`
- **Components**: `frontend/src/components/ui/` — GlassCard, AccentButton, GoldButton, NeonWireframeCar, TachometerScroll, etc.
- **Pages**: `frontend/src/pages/` — Landing, TcoCalculator, Compare, BrowseCars, Wizard, History, Methodology, NotFound
- **Backend**: `backend/server.py` (entry), `backend/src/api.py`, `backend/src/models.py`, `backend/src/calculations.py`

## Design System
- **Pattern**: Hero-Centric + Feature-Rich (Hero > Features > CTA, CTA above fold)
- **Style**: Kinetic Brutalism — dark mode primary, emissive green accent `#00FFBD` (dark) / `#00C853` (light)
- **Fonts**: Be Vietnam Pro (heading) + Noto Sans (body), Space Grotesk partially used. Import from Google Fonts.
- **Colors (CSS vars)**: `--color-primary:#1E293B`, `--color-accent:#00C853`, `--color-bg:#F8FAFC` (light), `--color-fg:#0F172A`
- **Motion**: Stagger animations via GSAP/scroll-trigger, 100ms color transitions, 150-300ms hover states

## Current Issues Checklist
- [x] **i18n gaps (fixed Aug 7)**: `tco.confidenceRange`, `browse.type` were missing from i18n bundles — raw keys leaked to UI. Both added to EN/VI in `i18n.tsx`.
- [x] **TcoCalculator reset (fixed Aug 7)**: `handleReset` now resets all slider state (city, km, years, cityRatio, showOppCost, loan fields)
- [x] **Float precision (fixed Aug 7)**: Backend returns rounded integers for all monetary values (no more `142798950.00000003`)
- [x] **NeonWireframeCar bgColor (fixed Aug 5)**: brake indicators corrected for both light/dark modes
- [x] **Compare emptyState (fixed Aug 7)**: EN wording aligned with VI: "Select at least 2 cars to compare."
- [x] **Landing hero stats (fixed Aug 7)**: Now wired to live API: cars count from `/api/cars` (70), cities from `/api/config` (33 supported_cities), ML stat "25+", forecast range "5-30"
- [x] **Wizard "Mẫu xe" default (fixed Aug 7)**: Changed from literal "Custom" to empty string `''` — shows placeholder text instead
- [x] **TCO chart YAxis "0.1B" overflow (fixed Aug 7)**: tickFormatter now uses "100M" for sub-billion values, "1.5B" for billion+
- [x] **Plate fee Da Nang/Hue/Can Tho/Hai Phong overcharge (fixed Aug 7)**: Split AREA1 into metro (Hanoi+HCMC: 14M VND) and non-metro (Da Nang/Hue/Can Tho/Hai Phong: 140K) per Thông tư 155/2025
- [x] **EV depreciation understated (fixed Aug 7)**: y1_drop=27%, annual_decay=9.5%, VinFast liquidity=0.78 (matching Vietnamese used EV market)
- [x] **Maintenance spike intervals (fixed Aug 7)**: Realigned to 40k/80k/120k for ICE/ICE-D/HEV, 15k/45k/90k for EV, with calibrated costs
- [x] **Fuel prices stale (fixed Aug 7)**: RON95=22,000, Diesel=23,500 (5-year defensible forecast based on EIA Brent consensus)
- [x] **HCMC city resolution bug (fixed Aug 7)**: "HoChiMinh" (no spaces) now correctly resolves to area=1/metro=True via space-insensitive matching in `resolve_city`/`is_area1_metro`/`get_area_tier`

### Product Review Items 1–9 (fixed Aug 8)
- [x] **Item 1 — City slug normalization**: `_normalize_city_token()` in `calculations.py` handles kebab/snake/dot slugs, Vietnamese prefixes (`thành phố`, `tỉnh`, `thừa thiên`), English `city` suffix, compact `thuathienhue`→`hue`. Applied to `get_area_tier`/`is_area1_metro`/`resolve_city`. 16-case inline self-test passes 0 failures.
- [x] **Item 2 — Fuel price split**: `config.py` now exposes `PETROL_PRICE_CURRENT_VND=22320`/`PETROL_PRICE_FORECAST_VND=22000` and `DIESEL_PRICE_CURRENT_VND=27540`/`DIESEL_PRICE_FORECAST_VND=23500`. Calculation uses CURRENT; legacy `PETROL_PRICE_VND`/`DIESEL_PRICE_VND` aliases kept for persisted ConfigProposals. `api.py` Assumptions table now shows 4 rows (current editable, forecast read-only).
- [x] **Item 3 — Parking recalibration (research-backed)**: `PARKING_TOLL_ESTIMATES` parking_monthly values updated per 3-subagent tiebreaker (area1_metro 1.5M, area1_other 1.0M, area2 0.8M, area3 0.5M); tolls unchanged. Source: `backend/src/parking_calibration.json`.
- [x] **Item 4 — Years=0 guard**: `get_tco` returns `_zero_tco_dict` early (on_road acquisition only, resale=price, TCO=on_road); `get_tco_yearly` returns `[]`. Live verified: years=0 Vios Hanoi → on_road=tco=624,740,000, resale=545,000,000.
- [x] **Item 5 — Unknown city → HTTP 400**: `_resolve_area()` in `api.py` validates canonical display name against `_VALID_CITY_DISPLAYS`; raises 400 with `supported_cities` listing. Live verified: `"singapore"` → 400 with full city list.
- [x] **Item 6 — Maintenance spike intervals**: ICE 120k→12M, ICE-D 120k→15M realigned to Vietnamese OEM dealer quotes.
- [x] **Item 7 — VinFast resale disclosure (no hardcoded floor)**: `calculate_resale()` adds `resale_note_key="resale.vinfastGuarantee"` for `brand=="VinFast"` across all 4 return paths; frontend `TcoCalculator.tsx` and `Compare.tsx` render the note caption. `i18n.tsx` adds the `resale.vinfastGuarantee` EN+VI key. Live verified: VF8 HCMC → `resale_note_key=resale.vinfastGuarantee`.
- [x] **Item 8 — TCO confidence interval disclaimer**: `tco.ciDisclaimer` i18n key added EN+VI; rendered in TCO result card above confidence range.
- [x] **Item 9 — Parking assumption disclosure + slider labels**: `tco.parkingFootnote` and `tco.cityOnly`/`tco.highwayOnly` i18n keys added EN+VI; slider label updates show parking estimate footnote.

### Beta Product Review Items (fixed Aug 9)
- [x] **S1 i18n key gaps (fixed Aug 9)**: Added missing EN keys (`tco.msrp`, `carDetail.calculateTco`, `history.confirmDelete/Title`, `history.deleteConfirm`, `history.noResults`, `history.justNow/minutesAgo/hoursAgo/daysAgo`, `history.typeCompare/typeSingle`, `compare.bestValueBadge`, `a11y.themeToggle/theme.light/theme.dark/locale.en/locale.vi/scrollPosition/language/menu`) and VI keys (`history.car`, `history.noResults`, `loan.effectiveCost/loanAmount/totalRepayment`, `tco.emptyStateWithCarPrompt`, 17 wizard.* keys). Naming inconsistency (`unit.*` vs `units.*`) resolved by adding `unit.*` aliases to VI bundle.
- [x] **S2 City (Area N) suffix dropped (fixed Aug 9)**: Removed `(Area {c.area})` suffix from city dropdowns in TcoCalculator.tsx and Compare.tsx. Area tier is implied by city name; no extra i18n needed.
- [x] **S3 Wizard VI step labels (fixed Aug 9)**: Added VI translations for all 17 wizard.* keys (annualMaint, brandModel, priceType, specs, segment, calculateAnother, calculateStep, carSummary, depreciation, seats, tcoResults, saveCar, carAdded, type, vehicleSegment, typeEV, typeHEV, typeICE, typeICED).
- [x] **S4 CarSearchSelect multi-word search (fixed Aug 9)**: Rewrote `filteredCars` filter in CarSearchSelect.tsx to tokenize search term on whitespace and require ALL tokens present across joined searchable text (brand+model+id+segment+type). Previously a single-field substring test failed for queries like "VinFast VF 8" because no single field contained the full phrase.
- [x] **S5 Hardcoded strings replaced with t() (fixed Aug 9)**: History.tsx `formatRelativeTime` now locale-aware (EN/VI); Layout.tsx aria-labels wired to `a11y.*` i18n keys (skipToContent, language, locale.en/vi, menu, themeToggle, theme.light/dark, scrollPosition); Compare.tsx "BEST VALUE" badge uses `compare.bestValueBadge` key; loan section labels (effectiveCost, loanAmount, totalRepayment) wired to t().
- [x] **S6 EV maintenance recalibration (fixed Aug 9)**: `MAINTENANCE_SPIKES["EV"]` lowered to (15k/500K), (45k/700K), (90k/1.0M) per VinFast owner data audit (was 1.2M/2.0M/3.0M — 6-10× overstatement). 5-year VF 8 maintenance now ~10.7M vs prior ~31M.
- [x] **S7 ICE-D maintenance recalibration (fixed Aug 9)**: `MAINTENANCE_SPIKES["ICE-D"]` recalibrated to (40k/6M), (80k/12M), (120k/18M) reflecting diesel DPF/EGR service premium (was 5M/10M/15M — understated at higher km tiers).
- [x] **S8 Traffic efficiency city multipliers raised (fixed Aug 9)**: `TRAFFIC_EFFICIENCY_MAP` ICE city 1.50→1.65, ICE-D city 1.30→1.45 per Otofun/Voz Vietnamese driver reports. ICE-D penalty kept lower than ICE because diesel engines are less sensitive to stop-and-go. HEV and EV unchanged (regen braking improves city economy).
- [x] **U5 Chart Y-axis 0M tick at origin (fixed Aug 9)**: TcoCalculator cumulative cost chart `YAxis tickFormatter` returns empty string when `v === 0` (was rendering "0M" outside layout container near axis origin).
- [x] **S10 VinFast resale floor extended + decay (fixed Aug 9)**: `VINFAST_FLOOR_YEARS` extended from 2 to 3 years. New `VINFAST_FLOOR_DECAY=0.095` constant. `_apply_vinfast_floor` rewritten to compute dynamic floor: `floor = price × 0.70 × (1 - 0.095)^(years - 3)` for years > 3. Year 3 = 70% (floor fires), Year 4 ≈ 63.3%, Year 5 ≈ 57.3% (vs prior parametric ~38% at year 5). Matches bonbanh market data (VF 8 3yr retention mean 0.60-0.70). `resale_note_key="resale.vinfastLiquidityFloor"` still emitted across all 4 return paths.
- [x] **S11 Edge cases + live UX verification (fixed Aug 10)**: Live-verified across 3 pages (TCO, Compare, History) — 0 console errors, 0 warnings. Edge cases via API: years=0 (on_road=tco=626.74M, resale=price ✓), years=1 (legal=0, year-1 absorbed into on_road ✓), years=30 (no error, tco=1.62B ✓), km=0 (fuel=0 ✓), city=singapore (HTTP 400 ✓), car=fakecar (HTTP 404 ✓). Multi-word search "Vios" returns "Toyota Vios 1.5G vios_2026 • B-Sedan • ICE 545.000.000 ₫" as first option (S4 end-to-end confirmed). Progress bar "Net TCO" = 59% (was "665%" in Aug 8 review — denominator now correct 626.74M on-road, no separate code change needed; formula fix propagated). Stale-data badge: "✓ Dữ liệu mới nhất" / "✓ Data is current".
- [x] **B1 On-road (giá lăn bánh) formula per user spec (fixed Aug 10)**: `on_road = price + reg_tax + plate_fee + inspection_fee + year-1 ROAD_MAINTENANCE_FEE_YEARLY + year-1 civil_insurance` (6 components, was 4). Year-1 road maintenance fee (1.56M) and year-1 civil insurance (437K for ≤5-seat, 794K for 6-11-seat) moved from `operating` (multiplied by years) into `on_road` (added once at acquisition). Operating tail adjusted to `(years - 1)` years of road/insurance so total TCO is invariant — only the acquisition/operating display split changes. Implemented in 3 places in `calculations.py`: `_zero_tco_dict`, `get_tco`, `get_tco_yearly`. years=1 → operating legal=0. years=0 → on_road=tco, resale=price. Live verified: Vios Hanoi 5yr on_road=626,737,000 (545M + 65.4M + 14M + 340K + 1.56M + 437K); TCO total unchanged at 3.09B.
- [x] **B2 Breakdown registration schema extended (fixed Aug 10)**: `get_registration_breakdown()` in `calculations.py` now returns 8 keys (was 4) for the collapsible Acquisition section: existing `tax`/`plate`/`inspection`/`total` plus new `road_fee` (year-1 ROAD_MAINTENANCE_FEE_YEARLY), `insurance` (year-1 civil insurance based on car seats), `on_road` (full giá lăn bánh = price + total). Frontend `TcoCalculator.tsx` renders all 8 rows (MSRP, Registration Tax, Plate Fee, Inspection Fee, Total Registration subtotal, Road Fee Year 1, Civil Insurance Year 1, On-Road Price). Three new i18n keys added to both bundles: `tco.regRoadFee`, `tco.regInsurance`, `tco.onRoadTotal` (EN: "Road Fee (Year 1)", "Civil Insurance (Year 1)", "On-Road Price (giá lăn bánh)"; VI: "Phí đường bộ (năm 1)", "Bảo hiểm TNDS (năm 1)", "Giá lăn bánh"). Browser-verified in both locales.
- [x] **Verbose checkbox removed + checkbox flex-shrink fix (fixed Aug 10)**: "Hiện chi tiết tính toán" / "Show Detailed Breakdown" checkbox removed entirely from TcoCalculator.tsx — breakdown now always visible when a car is selected. Removed: `verbose` from DEFAULTS, useState line, setVerbose in handleReset, the checkbox UI block, `{verbose && ...}` guards, `enabled: !!verbose && !!selectedCar` on breakdown query, `tco.verboseToggle` from both EN/VI bundles. Breakdown query now fetches unconditionally. Separately: added `flex-shrink-0` to all 3 checkbox inputs (opp-cost, rush-hour, ins-opt) — rush-hour label (345px on 366px parent) was squeezing the checkbox to 13px width via default `flex-shrink: 1`; all 3 now render at 16×16px.

### P3 Features Added (Aug 7)
- [x] **Staleness badge on TCO result**: Green ✓ badge if `day_prediction < DT_DEAD`, amber ⚠ badge if data is stale (>60 days). In `print:hidden`, rendered inside TCO result GlassCard.
- [x] **CSV export of assumptions table**: Export dropdown in Methodology page — renders assumptions data as `vidrive_assumptions.csv` via configApi
- [x] **Print stylesheet**: `index.css` extensions — hides nav/footer, shows only content, serif font, forces white bg/w text, expands collapsed sections, adds page breaks.
