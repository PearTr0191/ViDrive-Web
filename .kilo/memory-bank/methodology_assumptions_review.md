# Methodology Assumptions Table — Review

**Scope:** Align the displayed Assumptions table on `/methodology` (`backend/src/api.py` → `ASSUMPTIONS`) with the calculation engine (`backend/src/calculations.py`) and `config.py`.

**Date:** 2026-08-14
**Status:** Complete — all findings fixed and verified live in EN + VI.

---

## Findings & Fixes

### 1. Maintenance spike tier mismatch (display ≠ engine)
The Assumptions table rendered ICE/ICE-D/HEV spikes at 40k/80k/**150k** (old 120k+30k value) and EV at 10k/30k/60k, while `config.MAINTENANCE_SPIKES` uses **40k/80k/120k** (ICE/ICE-D/HEV) and **15k/45k/90k** (EV).

**Fix:** Rewrote the 12 spike entries in `ASSUMPTIONS` to match `config.MAINTENANCE_SPIKES`. Added 12 EN + 12 VI `config.maint.spike*` label keys. Updated `methodology.maintenanceFormula` copy (EN + VI) to the corrected tiers.

**Verified:** Live, both locales — ICE/ICE-D/HEV = 40k/80k/120k, EV = 15k/45k/90k.

### 2. Major-cost label locale parity
VI `config.maint.majorCostIce` showed `(ICE)` and `majorCostIceD` showed `(ICE-D)`, while the spike rows (fixed in #1) read `(Xăng)`/`(Dầu)`. EN `majorCostIceD` read `(ICE-D)` — inconsistent with the `(Diesel)` convention used elsewhere.

**Fix:** VI `majorCostIce` → `(Xăng)`, VI `majorCostIceD` → `(Dầu)`; EN `majorCostIceD` → `(Diesel)`.

**Verified:** Live, both locales — Xăng = 5M, Dầu = 6.5M, EV = 1.5M.

### 3. Deprecated EV maintenance discount shown as editable
`ASSUMPTIONS` listed `EV_MAINTENANCE_DISCOUNT` as `editable: True`, but `config.EV_MAINTENANCE_DISCOUNT` is deprecated/unused by the engine (the EV spike floor in `calculations.py` already accounts for lower EV maintenance). Displaying it implied an active control.

**Fix:** Removed the entry, its `api.py` import, and the EN + VI `config.maint.evDiscount` i18n keys.

**Verified:** Absent in live API response and in both UIs (EN "EV Maintenance Discount" / VI "Chiết khấu bảo dưỡng EV").

### 4. Area-1 plate fee misrepresents non-metro cities
`PLATE_FEES` had a single Area-1 row = **14.000.000 ₫**. Per Thông tư 155/2025, only Hanoi/HCMC (metro Area 1) pay 14M; non-metro Area-1 cities (Đà Nẵng, Huế, Cần Thơ, Hải Phòng) pay **140.000 ₫**.

**Fix:** Split into `PLATE_FEE_METRO` (14M) and `PLATE_FEE_NON_METRO_AREA1` (140K) with `area` tags `1_metro` / `1_other` and new EN + VI labels:
- EN: "License Plate Fee (Area 1 Metro: Hanoi/HCMC)" / "License Plate Fee (Area 1 Other: Da Nang/Hue/Can Tho/Hai Phong)"
- VI: "Phí biển số (Khu vực 1 nội thành: Hà Nội/TP.HCM)" / "Phí biển số (Khu vực 1 khác: Đà Nẵng/Huế/Cần Thơ/Hải Phòng)"

The calculation engine already used the metro-aware split (`calculations.py` ~175-178, ~895-898) — only the display was wrong; no calc change needed.

**Verified:** Live API — `PLATE_FEE_METRO` = 14000000, `PLATE_FEE_NON_METRO_AREA1` = 140000. Live UI — `1_metro` row = 14.000.000 ₫, `1_other` row = 140.000 ₫ (EN + VI).

---

## Verification Summary
- `python -m py_compile backend/src/api.py` → OK
- `node node_modules/typescript/bin/tsc --noEmit` → 0 errors
- Backend restarted (PID 20172 on :8000) — required because `ASSUMPTIONS` is built at import time.
- Browser console: 0 errors, 0 warnings on `/methodology` in both EN and VI.
- Other groups spot-checked against `config.py` (fuel prices, registration, on-road, depreciation, battery, efficiency, resale, insurance, parking) — no further mismatches.

## Files Touched
- `backend/src/api.py` — `ASSUMPTIONS` registry (spike entries, EV discount removed, plate-fee split); imports updated.
- `backend/src/config.py` — reference only (no change); `MAINTENANCE_SPIKES`, `PLATE_FEE_METRO`, `PLATE_FEE_NON_METRO_AREA1`, deprecated `EV_MAINTENANCE_DISCOUNT`.
- `backend/src/calculations.py` — reference only (correct; metro-aware plate split confirmed).
- `frontend/src/lib/i18n.tsx` — EN + VI spike labels, major-cost labels, plate-fee labels; removed EV-discount keys.
- `frontend/src/pages/Methodology.tsx` — reference only (renders `{t(item.label_i18n)}`; `area` field is display-only metadata, safe to use as sub-key).
