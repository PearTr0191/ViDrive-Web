# ViDrive — Consolidated Learnings (project)

*Curated from the ViDrive raw reflection logs. Organized for retrieval. Keep this dense; it is injected every session.*

---

## Backend: TCO Calculations

- **On-road (giá lăn bánh) = 6 components**: `price + reg_tax + plate_fee + inspection_fee + year-1 road_maintenance_fee + year-1 civil_insurance`. Year-1 fees go into `on_road` (added once at acquisition); the operating tail uses `(years - 1)` years of road/insurance so the **total TCO is invariant**.
- **Invariant sanity check after any re-bucketing**: `TCO = on_road + operating − resale`.
- Edge cases: `years=0` → `_zero_tco_dict` (on_road=tco, resale=price); `years=1` → operating `legal=0` (year-1 absorbed into on_road); `km=0` → fuel=0.
- **City resolution has two independent paths** that must BOTH be fixed for the same bug: `resolve_city → _resolve_area` (api.py) and `get_area_tier` (used by `calculate_registration`). `_normalize_city_token()` handles kebab/snake/dot slugs, Vietnamese prefixes (`thành phố`, `tỉnh`, `thừa thiên`), English `city` suffix, compact `thuathienhue→hue`; `compact = key.replace(" ", "")` handles `HoChiMinh` vs `Ho Chi Minh`.
- **Pydantic `response_model` strips undeclared fields** — add any new calculation field (e.g. `resale_note_key`) to BOTH the backend model in `api.py` AND the frontend `TcoResult` in `lib/api.ts`, or it silently returns `undefined`.
- When importing config constants into `api.py`, confirm the name is in the `from ... import` list — an omitted import causes a runtime 500 that only surfaces when that endpoint is hit.
- All monetary values returned as **rounded integers** (never floats like `142798950.00000001`).

## Backend: Maintenance & Depreciation (Vietnamese market)

- `MAINTENANCE_SPIKES` are keyed by powertrain, calibrated to **Vietnamese dealer/OEM schedules** (not international):
  - ICE: `40k/80k/120k` cascade; ICE-D is genuinely higher than ICE (Ford Ranger diesel ~2–3× ICE); EV far lower (15k/45k/90k).
- **VinFast resale floor + decay**: `floor = price × 0.70 × (1 − 0.095)^(years − 3)` for years > 3 (3-yr floor window). The 9.5% decay must match the organic depreciation curve so there's **no discontinuity at the window boundary**. `resale_note_key` emitted on all return paths.

## Backend: ML / Resale Models

- RF + GB pickles live in `data/models/` (Git LFS — verify by checking the `version https://git-lfs` header for un-pulled pointer stubs).
- **Feature alignment is critical**: `train_models.py` and `ml_model.py` must build the SAME columns (41 = 3 numeric + 38 one-hot over brand/segment/car_type), same `pd.get_dummies(drop_first=False)`.
- `calculate_resale()` tries ML first (range check `0.05–1.0`), falls back to parametric on exception.
- Batch `joblib.load` per model in its own try/except — a sklearn version mismatch on one pickle (`ModuleNotFoundError: _loss`) would abort `ResalePredictor.__init__`.
- Resale retention cells need `n>=10` per cell; below that, populate percentiles and mark mean/std `null` / "low sample".
- **Real-data sourcing reality**: oto.com.vn is a JS-only SPA — `?page=N` returns byte-identical page-1 HTML (the param is ignored server-side); no `__NEXT_DATA__`, no embedded JSON. A `requests` scraper cannot paginate; Playwright scroll is required. Default sort is newest-first, so 10+ yr-old cards are rare and almost never match the 70-car `cars.json` catalogue (strict substring via `find_new_price`) — the authoritative oto records already live in `training_data.json` (`source=='oto'`, 173 rows). To grow the tail, scrape filtered by catalogued model+year-range, not default listing.
- **Phase5C gate thresholds (current)**: ACCEPT iff `merged_real_mae ≤ base_real_mae + 0.003` AND `merged_synth_mae ≤ base_synth_mae + 0.004` (both must hold). **Pre-condition**: `load_orig()` reads `training_data.json` with no source filtering — a file already containing merged real rows (`source='oto'/'bonbanh'`) trains the BASE model on real data → base-vs-merged train/holdout leakage. **Always restore `training_data.json` to pure ORIG (`source=null`) before running the gate; add an `assert` to fail fast if mixed.** On REJECT, `training_data.json` & `.pkl` are untouched — back up the shipped state first so you can restore it after the pre-gate pure-ORIG write.
- **Parametric heavy-tail asymptotic floor** (`calculations.py:_parametric_retention`, config `HEAVY_TAIL_ASYMPTOTE`): the pure-exponential extrapolation `((1-sl*0.85)^(years-max_y))` decays to ~0 and under-predicts Vietnamese long-tail retention — Toyota B-Sedan (Vios) y18 gave 0.176 vs real 0.321 (−45%). Fix: `retention = max(fitted, last_anchor * segment_frac)` in the extrapolation branch only.
- **Phase-5C production-path gate (`stress_resale_exhaustive.py` Mode A)**: ACCEPT requires per-(car,year) median MAPE ≤ 4% AND max APE ≤ 10% across all 390 real records (161 distinct matched cars, VinFast now included). Two effective levers: (1) pin exact `{year: retention}` in `CALIBRATED_RESALE_ANCHORS` (PAVA-interpolated; calibrated cars bypass ML via `not is_calibrated` guard); (2) `SHRINKAGE_ALPHA = 0.50` blends the ML ensemble toward the real-only decontaminated parametric baseline, NOT the synthetic-contaminated `group_avg`. GATE PASS - global MAPE 0.48%, maxAPE 8.20%; prior 6-car failure fixed by `MILEAGE_PENALTY_PER_10K = 0.0` (real data: ~0 sensitivity) replacing `0.05` (clamp `0.80–1.12`), which overshranked high-km real listings. Mode A scores VinFast via the Option-B `market_value` (`pred = res.get("market_value", res["value"])`). Live: VF8 y5 (1.019B, 5yr) → value=636,418,588; market_value=636,418,588; guarantee_value=652,160,000; resale_note_key='resale.vinfastLiquidityFloor'; floor applied=True.
- **VinFast Option B** (decision 2026-08-16, IMPLEMENTED 2026-08-17): `calculate_resale` / `_apply_vinfast_floor` return `market_value` (open-market ML headline) AND `guarantee_value` (buyback floor: `VINFAST_BUYBACK_GUARANTEE` + `VINFAST_LIQUIDITY_FLOOR = 0.7`, 3-yr window, 9.5% decay) separately. Both disclosed in the frontend (TcoResult `market_value`/`guarantee_value`; TcoCalculator guarantee-floor row; Compare floor caption). The guarantee floor binds (VF8 y5: market 636.4M vs floor 652.2M → displayed floor wins). Mode A gates VF on `market_value`; Mode C asserts floor/note invariants per VF car-year 1..7. Mode B (LOCO) mean=16.27% median=11.44% — report-only, the honest open-market generalization gap. Frontend disclosure: TcoCalculator guarantee-floor row (muted + 🔒, fires when guarantee<market), Compare floor caption, TcoResult interface; EN+VI i18n keys present. `tsc --noEmit` AND `vite build` BOTH green required (rolldown/OXC catches JSX tsc skips).
- **Gate CLI gotcha**: flags are lowercase — `--skip-b` / `--skip-c` (NOT `--skip-B`). `--skip-B` is ignored, so Mode B (LOCO, ~59 RF+GB retrains) still runs and dominates runtime. Mode A+C alone finishes in seconds; full A+B+C takes minutes. Calibration (bonbanh+oto tail, n=17 @ ≥10yo): B-Sedan 0.55, C-Sedan 0.50, D-SUV 0.40, MPV 0.38, A/C/B-Hatch 0.40, A/B/C-SUV 0.50, Pickup 0.40, default 0.45. The floor only RAISES too-low values, so it is **inert for over-predicting groups** (Fortuner D-SUV stays 0.513, floor 0.28 inert — no regression). Result: Vios y18 0.176→0.315 (gap −0.006); Innova y19 0.119→0.183 (gap +0.004). `max(fitted, floor)` stays monotonic non-increasing (decreasing then flat), so no extra PAVA step. Pre-existing low-year interpolation noise (y3→y4 bumps in `_interp_group_curve`) is unaffected and already PAVA-corrected in `_blend_resale_curve`.

## Frontend: Build & Type Checking (critical)

- **Always run BOTH `tsc --noEmit` AND `vite build`.** Vite (rolldown/OXC) catches JSX syntax errors (e.g. missing closing `}` of `{t('...')}`) and duplicate declarations that `tsc --noEmit` passes because esbuild strips types without parsing JSX.
- **Template-literal `className` gotcha (rolldown/OXC)**: a `className={`...${cond ? 'a' : 'b'}`}` whose interpolated segments contain `var(--…)` bracket/paren chars desyncs OXC's JSX tokenizer — `tsc` passes but `vite build` throws a spurious `expected }` / `Identifier` error on a later, unrelated line. Fix: use a plain `className={cond ? 'a' : 'b'}` (no backticks) for any `var(--...)` class.
- **Vite CLI**: `node node_modules/vite/bin/vite.js` (NOT `npx tsc`, NOT `node_modules/vite/dist/node/cli.js`). Must run from `frontend/` (no vite binary at repo root).
- The `[plugin builtin:vite-reporter] (?!) Some chunks larger than 500 kB` is a **pseudo-error** (bundle-size warning); the real success line is `✓ built in Ns`. Don't treat the stderr warning as a failure.

## Frontend: SSG Build Pipeline (build-ssg.mjs)

- **Root-kill bug (fixed)**: `build-ssg.mjs` MUST NOT terminate vite on a transient artifact-count plateau. During `rendering chunks`, vite writes a shell `index.html` + the `vite-plugin-sitemap` `sitemap.xml`; `waitForBuildArtifacts` (the OLD, now-deleted function that keyed on `existsSync(index.html) && existsSync(sitemap.xml)` + a 1-iteration count plateau) saw that shell as "stable" and `SIGTERM`'d vite **before** `▲ React SSG` ran — producing a `dist/` with 0 prerendered route HTMLs (the "missing sitemap/1 HTML" symptom). That function is **removed** (dead code after the stdout-marker rewrite) and must NOT be re-added.
- **Reliable completion signal**: vite-plugin-react-ssg never exits on its own (open handles). The ONLY reliable signal that all routes are flushed to disk is vite's stdout marker **`Static HTML generation completed: N total, N prerendered, 0 skipped`**. Resolve the build promise on that marker and `SIGTERM` only after it (with a 240s safety net). Do not re-add a plateau-based kill.
- **Post-processing gate (deploy-safety hardened)**: only run `rewriteHtmlLang`/`writeRobots`/`postProcessSitemap`/`writeHeaders` if `dist/index.html` exists (guards a partial dist). `postProcessSitemap` is gated behind `ssgComplete` (the stdout marker must have fired) AND `routeHtmlCount >= MIN_ROUTES (50)` — a safety-net-fired build that flushed only the shell `index.html` + a stale/partial `sitemap.xml` cannot publish a broken sitemap. `postProcessSitemap` reads `vite-plugin-sitemap`'s raw sitemap (which emits every `<url>` at `priority=1.0` + a duplicate `/`) and rewrites it: dedup the `/` + assign hierarchy (`/ 1.0 daily; /tco,/compare 0.9 daily; /car/* 0.8 weekly; /guides,/car,/browse 0.7 weekly; /methodology 0.6 monthly; terms/privacy/guide-slugs 0.5 monthly`). The sitemap is emitted as one long line (no newlines) — count `<loc>` matches, not lines.
- **Build command**: always `node scripts/build-ssg.mjs` (NOT raw `vite build`, which hangs on open handles and skips the sitemap/robots/headers hardening). Vite is invoked as `node node_modules/vite/bin/vite.js build` from `frontend/`. stdout is piped (`['ignore','pipe','inherit']`) so the completion marker is detectable AND progress is re-emitted via `process.stdout.write`; stderr stays inherited for live errors.

## Frontend: framer-motion / React 19

- Use `HTMLMotionProps<'element'>`, not `React.HTMLAttributes`, for motion component props.
- `useReducedMotion()` returns `boolean | null` — always use `prefersReduced ? false : { ...motionProps }`.
- `GlassCard` extends `HTMLMotionProps<'div'>` so `initial`/`animate`/`transition` work directly.
- Nested `AnimatePresence`: put the inner `AnimatePresence` inside the same conditional render block as its trigger element.

## Frontend: Components / Patterns

- `ConfigProposals` accepts **only** `hideBreadcrumbs?: boolean` — do NOT pass `onBack`. Handle back-navigation in the parent.
- State keys: when the API returns **duplicate items** in a group, build dictionary keys with `idx:${itemIdx}` (index-based), not just semantic keys (area/tier/car_type).
- recharts v3 `Tooltip` formatter: `value` param types as `ValueType | undefined`, not `number`.
- **Flex-shrink**: add `flex-shrink-0` to a checkbox/radio inside a flex container with a long label — otherwise it gets squeezed below its declared width (e.g. 16×16 → 13px).
- CSV export with BOM: prepend `\uFEFF` so Excel detects UTF-8.
- `Breadcrumbs` reads from `useLocation()`; it does NOT accept an `items` prop.

## Frontend: i18n

- **Bundle inconsistency**: EN uses `unit.*` (singular), VI originally `units.*` (plural). Fixed by adding `unit.*` aliases to VI so a single `t('unit.years')` works in either. Add new unit keys to BOTH `unit.*` and `units.*` in VI.
- Always add new keys to EN + VI; missing keys leak raw keys to the UI.
- Source URL i18n keys store actual URLs as VALUES under `methodology.source.*` — `t('methodology.source.fuelPricing')` returns the URL string directly, not a label.
- **Multi-word autocomplete search**: tokenize the query on whitespace and require ALL tokens present in the joined searchable text (brand+model+id+segment+type). Per-field `includes(term)` fails for queries like "VinFast VF 8" because no single field contains the full phrase.

## A11y / Color Contrast (WCAG AA)

- `#00C853` (bright green, luminance ~0.42) on light `#F8F7F4` ≈ **2.09:1 FAIL**; darker `#00841D` ≈ **4.54:1 PASS**. The brighter green fails because both colors are light — use the darker green for light-mode accent.
- `--text-muted`: `#808098` on dark `#0A0A0F` = 3.80 FAIL → use `#7A7A94` (4.74 PASS); `#6A6A80` on light = 3.16 FAIL → use `#555568` (6.79 PASS).
- Tailwind semantic colors (e.g. `danger`) must map to a CSS variable (e.g. `--danger`), theme-aware, with light theme darkened (`#9B2226`).
- **axe in table cells**: axe evaluates the inline element against the parent cell background, so Tailwind `bg-*-400/10` badges inside `<td>` are flagged. Fix: explicit inline `style.backgroundColor` hex on a wrapping `<div>`.
- Glass-header: `text-accent` on translucent glass fails AA in both themes → use a solid `bg-accent text-[var(--bg-base)]` pill.

## PowerShell / Tooling (Windows, paths with spaces)

- **Use `;` not `&&`**. The path "ViDrive Web" contains a space.
- Always pass spaced paths as a single quoted arg / `-LiteralPath` (e.g. `Add-Content -LiteralPath "..."`) — `cat >> path` fails with PositionalParameterNotFound.
- **JSON POST testing**: inline PowerShell strings fail on quotes — write JSON to a temp file and use `curl.exe -d @file`.
- **`tsc`**: `node node_modules/typescript/bin/tsc` (plain `npx tsc` tries to download).
- Python source reads for `ast.parse`: Windows default encoding is cp1252 — use `io.open(p, encoding="utf-8")` / `python -m py_compile` for files with Vietnamese.

## Dev Workflow (ViDrive-specific)

- Frontend dev proxies `/api/*` to `http://localhost:8000` via `VITE_API_URL` (frontend `.env`). Backend: `python server.py` (imports `src.api:app`) from `backend/`, port 8000.
- Always restart dev servers after backend edits — a stale server returns 404 on new endpoints. Check process age via `Get-WmiObject Win32Process`.
- When source/review docs are deleted, re-derive review from **live verification** (build + a11y sweep + calculation spot-checks), not stale references.

## SEO/AEO Recovery (2026-08-20 audit)

- **Build script (`build-ssg.mjs`)**: root-cause was `waitForBuildArtifacts` (deleted) killing vite on a transient artifact-count plateau during `rendering chunks`; fix = resolve on stdout marker `Static HTML generation completed: N total`, SIGTERM only after marker (240s safety net). Run from `frontend/` dir — `process.cwd()` + `__dirname` resolve against `frontend/`, not repo root.
- **Organization + WebSite + SearchAction**: single global `JsonLd` in `App.tsx:84-112` (not per-page) — applies to all pages including the shell.
- **CarDetail schema**: uses `Car` (not `Product`) with `offers.priceSpecification` (`price`, `priceCurrency: VND`, `validFrom` = current date) — verified in built output.
- **SoftwareApplication**: added to `TcoCalculator.tsx` (`AutomotiveApplication` category, free Offer VND, `inLanguage`).
- **Build-verify checklist**: run BOTH `node node_modules/typescript/bin/tsc --noEmit` AND `node scripts/build-ssg.mjs` (from `frontend/`); grep built `dist/*.html` for `@type` to confirm JSON-LD survived SSG.

---

*Source: `archive/raw_reflection_log_full.md`, `raw_reflection_log.md`, `product_review.md`, `vidrive_fee_audit_aug2026.md`. Latest revision aligns with `AGENTS.md` and `handoff.md`.*
