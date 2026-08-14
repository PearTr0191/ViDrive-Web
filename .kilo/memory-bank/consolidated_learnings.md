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

## Frontend: Build & Type Checking (critical)

- **Always run BOTH `tsc --noEmit` AND `vite build`.** Vite (rolldown/OXC) catches JSX syntax errors (e.g. missing closing `}` of `{t('...')}`) and duplicate declarations that `tsc --noEmit` passes because esbuild strips types without parsing JSX.
- **Vite CLI**: `node node_modules/vite/bin/vite.js` (NOT `npx tsc`, NOT `node_modules/vite/dist/node/cli.js`). Must run from `frontend/` (no vite binary at repo root).
- The `[plugin builtin:vite-reporter] (?!) Some chunks larger than 500 kB` is a **pseudo-error** (bundle-size warning); the real success line is `✓ built in Ns`. Don't treat the stderr warning as a failure.

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

---

*Source: `archive/raw_reflection_log_full.md`, `raw_ref`, `raw_reflection_log (1–3).md`. Latest revision aligns with AGENTS.md.*
