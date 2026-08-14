# Anchored Context Summary — ViDrive Web

## Project
Vietnamese car TCO (Total Cost of Ownership) calculator. Frontend: React 19 + TypeScript + Vite + Tailwind. Backend: FastAPI + Python 3.11. CLI tool exists at `backend/src/cli.py`.

## Contact Info Overrides (applied per user)
- **Email**: `tranhoanglethanh@gmail.com` (personal Gmail, NOT hello@vidrive.app)
- **GitHub**: `github.com/PearTr0191` (personal account, NOT vidrive-app org)
- **Zalo**: `zalo.me/0866828946` (added)
- **Facebook**: `facebook.com/pear.tran.2025` (added)
- **Phone**: `+84 866 828 946` (added)

## File States (verified Aug 14 2026)

### Frontend
- **Footer.tsx**: ✅ All overrides in place — PearTr0191 GitHub, Zalo, Facebook, email, phone. SOCIAL_LINKS array + Contact section with mailto/tel links.
- **i18n.tsx**: ✅ EN contact strings (terms.contact, privacy.contact) use `tranhoanglethanh@gmail.com`. VI contact strings still use `hello@vidrive.app` — **PENDING FIX** (lines 1278, 1286).
- **i18n.tsx**: ✅ EN + VI both have `resale.vinfastGuarantee` (78%/36-month) and `resale.vinfastLiquidityFloor` (70%/3-year).
- **i18n.tsx**: ✅ `unit.*` aliases added to VI bundle for backward compat with EN `unit.*` keys.
- **index.css**: ✅ `--text-muted` already set to AA-passing values (dark: #8A8AA8 at 5.8:1, light: #6B7280 at 4.5:1).
- **api.ts**: ✅ `historyApi` uses sessionStorage; `TcoResult` interface has `resale_note_key`.

### Backend
- **config.py**: ✅ `ALLOWED_ORIGINS` (line 295), `PDF_EXPORT_MAX_CONCURRENT=2` (line 304), `PDF_EXPORT_TIMEOUT_SEC=30` (line 305). HISTORY_DIR/HISTORY_FILE exist but only used by persistence.py (CLI), NOT exposed in API ASSUMPTIONS.
- **server.py**: ✅ `host="127.0.0.1"` — local-only dev binding, no change needed.
- **api.py**: ✅ Rate limiting (lines 108-129), security headers, CORS allowlist from config. ASSUMPTIONS response excludes HISTORY_DIR/HISTORY_FILE.
- **pdf_export.py**: ✅ Async with Semaphore(PDF_EXPORT_MAX_CONCURRENT), `asyncio.wait_for(create_subprocess_exec(...), timeout=PDF_EXPORT_TIMEOUT_SEC)`.

### Calculations (backend/src/calculations.py)
- On-road = 6 components: `price + reg_tax + plate_fee + inspection_fee + year-1 road_maintenance_fee + year-1 civil_insurance`. Operating tail uses `(years-1)`.
- Invariant: `TCO = on_road + operating - resale`.
- Edge cases: years=0 → _zero_tco_dict; years=1 → operating legal=0; km=0 → fuel=0.
- City resolution: `_normalize_city_token()` handles kebab/snake/dot slugs, Vietnamese prefixes, English `city` suffix. `compact = key.replace(" ", "")` handles "HoChiMinh".
- VinFast floor: `floor = price × 0.70 × (1 − 0.095)^(years − 3)` for years > 3.

## Outstanding Tasks
1. Fix VI contact strings in i18n.tsx: `hello@vidrive.app` → `tranhoanglethanh@gmail.com` (2 occurrences)
2. Frontend verify: `tsc --noEmit` + `vite build`
