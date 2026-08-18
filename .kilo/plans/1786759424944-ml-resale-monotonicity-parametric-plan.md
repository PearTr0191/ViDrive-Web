# Plan: Dynamic Per-Car ML + Monotonicity Fix + Sophisticated Parametric Curve

## Goal (3 core fixes + 1 UX change + 1 bonus)

1. Replace global `max_training_year=10` cap with **dynamic per-car** threshold from training-data availability.
2. **Fix ML non-monotonicity at the source** (in `ResalePredictor`) so the runtime `max_prev_resale` clamp can be removed.
3. **Sophisticate the parametric fallback** → two-phase exponential fitted per car group (MAE 1.4% vs current 15-20%).
4. **UX**: car selection only sets `selectedCar` (no auto-calc); keep deep-link (`?car=xxx`) auto-calc on mount.
5. **Bonus**: expand training data via bonbanh.com.vn scrape + retrain (validation-gated).

---

## Research Findings (validated)

- **Curve fit** (62 groups with ≥4 yrs data): two-phase exponential `ret = (1-y1)·(1-sd)^min(y-1,2)·(1-sl)^max(0,y-3)` → mean MAE **0.0137**, max 0.050. Current fixed-tier formula → MAE ~0.15-0.20.
- **Real benchmarks**: VinFast VF8 = 40.7% retention @5yr (iSeeCars); Toyota Corolla = 72.6% @5yr (US); VN market VinFast VF5 = 20% drop @2yr, Toyota Vios = 31% @2yr; US norm 15-25% Y1, 50-60% @5yr.
- **Training data**: schema `{id, brand, model, segment, car_type, price (MSRP), years, annual_km, resale_value, resale_pct}`; 2,774 rows; most groups years 1-6 only (4-9 samples/yr); years 7-16 sparse (1-4/yr).
- **7 of ~40 groups have group-average monotonicity violations** (sparse-year noise) → confirms root cause is in data, not just RF.
- **sklearn pinned 1.8.0** in requirements.txt but env has 1.9.0 → GB pickle fails (`ModuleNotFoundError: _loss`). Retrain must use 1.8.0.
- **bonbanh.com.vn scrapeable** via firecrawl (107KB markdown returned) → data expansion feasible.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Per-car max threshold | **≥3 samples/group-year** | Filters 1-sample noise (Toyota Y13/Y16, Isuzu Y12); keeps Y7-9 with 4 samples. Most cars → 6. |
| ML monotonicity | **PAVA post-processing in `predict_resale()`** | Root-cause fix; no retrain. RF predicts all years for group, Pool Adjacent Violators enforces non-increasing. |
| Parametric curve | **Two-phase exponential fitted per group** | MAE 1.4% vs 15-20%. Group-anchored, credible. |
| Extrapolation damping | **0.85** | Conservative long-horizon (cars don't depreciate linearly forever); avoids understating resale → overstating TCO. |
| Unknown-group fallback | **Tier-based `DEPRECIATION_EQ_PARAMS`** (user-approved recommendation) | Safety net when group has no training data. |
| Auto-calc on selection | **Remove**; keep deep-link mount-only | User: "car selection only set the variable." |
| Data expansion | **Bonus Phase 5, validation-gated** | Only merge if MAE improves + monotonicity holds. |

---

## Affected Files

| File | Change |
|---|---|
| `backend/src/ml_model.py` | Per-group `_group_year_counts`/`_group_max_year` dicts; `get_car_max_training_year()`; PAVA calibration in `predict_resale()`; `get_group_curve()` helper. |
| `backend/src/calculations.py` | `calculate_resale()`: drop `max_prev_resale`+clamp; add `max_training_year` param; replace parametric formula with two-phase fit. `get_tco_yearly()`: drop clamp + `prev_resale` tracking; keep `param_scale` continuity bridge. |
| `backend/src/config.py` | Add `PARAMETRIC_MIN_SAMPLES=3`, `PARAMETRIC_DAMPING_FACTOR=0.85`. Keep `DEPRECIATION_EQ_PARAMS` as fallback. |
| `frontend/src/pages/TcoCalculator.tsx` | Remove `[selectedCar]` auto-calc useEffect; add mount-only deep-link effect; fix `handleTcoPrimary`/`tcoPrimaryLabel` for "new car, no calc yet" state. |
| `frontend/src/lib/i18n.tsx` | Update `resale.fallbackToParametric` wording (dynamic threshold). |
| `backend/data/models/training_data.json` | Phase 5: merge scraped bonbanh records (optional). |
| `backend/data/models/resale_rf.pkl` | Phase 5: retrain with sklearn 1.8.0 (optional). |

---

## Phase 1 — Dynamic per-car `max_training_year`

`ml_model.py` `ResalePredictor._load()`:
- Build `self._group_year_counts`: `(brand,segment,car_type)` → `{year: count}`.
- Build `self._group_max_year`: `(brand,segment,car_type)` → max year with `count ≥ PARAMETRIC_MIN_SAMPLES`.

Add:
```python
def get_car_max_training_year(self, brand, segment, car_type) -> int:
    return self._group_max_year.get((brand, segment, car_type), 0)
```

`calculate_resale()` signature: add `max_training_year: int | None = None`. Gate becomes:
```python
mt = max_training_year if max_training_year is not None else predictor.max_training_year
if years <= mt:
    ... # ML path
```

Callers (`get_tco`, `get_tco_yearly`) compute `mt = predictor.get_car_max_training_year(...)` and pass it.

---

## Phase 2 — ML Monotonicity (PAVA)

`ml_model.py` `predict_resale()`:
- When predicting year `Y` for group G, also predict years 1..`group_max_year[G]` for same G (same km/price).
- Apply PAVA: sort by year, enforce non-increasing via `sklearn.isotonic_regression` with `increasing=False` on the predicted retention sequence.
- Return calibrated value for year `Y` as `ml_prediction`; keep raw in `ml_prediction_raw`.
- Add helper `_predict_group_curve(brand, segment, car_type, km, price) -> list[float]` (no cache; 600-tree RF × ≤9 yrs is negligible).

`calculations.py`:
- Remove `max_prev_resale` param from `calculate_resale()`.
- Delete clamp block (lines ~373-379).
- `get_tco_yearly()`: remove `prev_resale` tracking + `max_prev_resale` arg; keep `param_scale` bridge (anchors parametric extrapolation at last ML value for continuity).

---

## Phase 3 — Sophisticated Parametric Curve

`ml_model.py` add `get_group_curve(brand, segment, car_type) -> dict[int, float]` (group-average retention from `self._stats`).

`calculations.py` parametric path (replace lines ~389-410):
```python
group_curve = predictor.get_group_curve(brand, segment, car_type)
if group_curve:
    anchors = sorted(group_curve.items())              # [(y, ret), ...]
    max_y = anchors[-1][0]
    if years <= max_y:
        retention = _interp_group_curve(anchors, years)   # linear interp between anchors
    else:
        # Fit two-phase exponential to anchors, extrapolate with damping
        y1, sd, sl = _fit_two_phase(anchors)             # grid search min MAE
        base = (1 - y1) * (1 - sd)**min(max_y-1, 2) * (1 - sl)**max(0, max_y-3)
        # anchor extrapolation at last anchor, damped
        extrap = anchors[-1][1] * ((1 - sl * PARAMETRIC_DAMPING_FACTOR) ** (years - max_y))
        retention = extrap
else:
    # No group data → tier-based fallback (user-approved)
    tier = BRAND_LIQUIDITY_MAP.get(brand, "Tier 3")
    category = "EV_Market" if car_type == "EV" else tier
    p = DEPRECIATION_EQ_PARAMS.get(category, DEPRECIATION_EQ_PARAMS["Tier 3"])
    retention = (1 - p["y1_drop"]) * ((1 - p["annual_decay"]) ** (years - 1))
bonus = resolve_liquidity_bonus(brand, car_type, segment)
retention *= bonus
result = _apply_vinfast_floor(round(price * retention), ...)
result["warning"] = "resale.fallbackToParametric"     # only when parametric used
```

Helper `_fit_two_phase(anchors)`: grid-search `y1∈[0.15,0.30]`, `sd∈[0.08,0.18]`, `sl∈[0.05,0.12]` minimizing MAE vs anchors. (Validated: mean MAE 0.014.)

`config.py`: add `PARAMETRIC_MIN_SAMPLES=3`, `PARAMETRIC_DAMPING_FACTOR=0.85`.

---

## Phase 4 — Frontend Auto-Calc Change

`TcoCalculator.tsx`:
1. **Remove** the `[selectedCar]` auto-calc useEffect (lines 358-363).
2. **Add** mount-only deep-link effect:
   ```tsx
   useEffect(() => {
     if (searchParams.get('car') && !result) handleCalculateRef.current()
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [])
   ```
3. **Fix** button state for "new car, no calc yet":
   ```tsx
   const isNewCar = !result || result.car_id !== selectedCar
   const tcoPrimaryLabel = mutation.isPending ? t('tco.calculating')
     : isNewCar ? t('tco.calculate')
     : tcoParamsChanged ? t('tco.recalculate') : t('tco.resetButton')
   const handleTcoPrimary = () => {
     if (mutation.isPending || !selectedCar) return
     if (result && result.car_id === selectedCar && !tcoParamsChanged) handleReset()
     else handleCalculate()
   }
   ```
4. `CarSearchSelect onChange={setSelectedCar}` unchanged (only sets variable).

`i18n.tsx`: update `resale.fallbackToParametric`:
- EN: "Long-term resale (beyond {{years}} yrs) uses a parametric model, not ML — projected, not observed."
- VI: "Giá bán lại dài hạn (sau {{years}} năm) dùng mô hình tham số, không phải ML — được dự báo."

---

## Phase 5 (Bonus) — Training Data Expansion

**Only if validation gates pass.** Steps:
1. Scrape bonbanh.com.vn used listings (top 20 brands × popular models) via firecrawl.
2. Map listing → `(brand, segment, car_type)` using existing `cars.json` model list.
3. Compute `resale_pct = listing_price / MSRP` (MSRP from `cars.json` or listing "new price").
4. `years = current_year - model_year`; `annual_km` from listing or default 15,000.
5. Merge into `training_data.json` (dedupe by id+years).
6. Retrain `resale_rf.pkl` with **sklearn 1.8.0** (matching requirements.txt).
7. **Validation gate**: holdout MAE must improve vs current; group-average curves must remain monotonic (PAVA still applied as safety net). If gate fails, discard expansion.

**Risk**: mixing real (noisy) + existing (clean) data; model-name matching labor. Mitigate: scrape only models already in `cars.json`; keep existing records; flag expanded records with `"source":"bonbanh"`.

---

## Validation

- **Unit** (`backend/test_resale_fix.py`): per-car threshold (VinFast D-SUV EV→6, Ford Pickup ICE-D→7, unknown→0); monotonicity (Toyota C-Sedan HEV years 1-6 non-increasing); two-phase MAE <0.05 vs anchors; warning fires at `per_car_max+1`.
- **Live API**: `POST /api/tco/yearly-breakdown` years=20 → `yearly[6].resale > yearly[7].resale` (monotonic); `warnings` contains `resale.fallbackToParametric` at Y7; years=6 → no warning.
- **Frontend**: select car → no auto-calc; `?car=vios` deep-link → auto-calc on mount; warning toast shows updated copy; chart smooth at Y6→Y7.
- **Edge**: years=0 → `_zero_tco_dict` no warning; years=1 → ML no warning; unknown group → tier fallback + warning.

---

## Open Questions (resolved by user)

1. Auto-calc on selection: **REMOVED** (user: "only set the variable"). Deep-link kept.
2. Parametric damping: **0.85** (researched, delegated to me).
3. Unknown-group fallback: **tier-based** (user: "follow your recommendation").
4. Data expansion: **bonus, validation-gated** (user: "if it helps, beautiful").
