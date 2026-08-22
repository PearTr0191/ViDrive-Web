# AGENTS.md — ViDrive Web

## Frontend (React + Vite)

Located in `frontend/`. All commands run from that directory.

### Type check
```powershell
node node_modules/typescript/bin/tsc --noEmit
```

### Build (SSG + SEO hardening)
```powershell
node scripts/build-ssg.mjs
```
This runs Vite build → React SSG prerender → `build-ssg.mjs` post-processing (rewriteHtmlLang, sitemap priority/changefreq, robots.txt, headers). Do NOT use raw `vite build` — it hangs on open handles and skips SEO hardening.

### Validate build output
- `dist/index.html` should contain 5 `application/ld+json` blocks, a `rel="canonical"`, hreflink `alternate` links, and `gtag` scripts inside `<head>`.
- `dist/llms.txt` should exist.
- `dist/sitemap.xml` should include `https://vidrive-web.pages.dev/</loc>` with priority 1.0.

## Backend (FastAPI)

Located in `backend/`.

### Run dev server
```powershell
python server.py
```

## Data automation (GitHub Actions + backend/scripts)

External-world values live in `backend/data/assumptions.json` and `backend/data/resale_anchors.json` — `config.py` loads them at import and re-exports the original constant names. `LAST_UPDATED` is derived as min(verified_at); bump freshness by editing `_meta.*.verified_at`, never by hand-editing config.py. Scheduled workflows: fuel-refresh (weekly), catalogue-watch (weekly), maintenance-watch (quarterly), resale-monthly, validate-data (CI on data paths).

### Commands
```powershell
# Validate all data files (exit 1 on errors; warnings non-blocking)
python backend/scripts/validate_data.py

# Fetch current fuel prices into assumptions.json (0=NO_CHANGE 2=UPDATED 3=INVALID)
python backend/scripts/fetch_fuel_prices.py

# Catalogue price ops — MSRP-only provenance enforced
python backend/scripts/car_ops.py update-price vios_2026 --price 545000000 --source-url "https://www.toyota.com.vn/..."
python backend/scripts/car_ops.py add-car <id> --brand ... --model ... --price N --type ICE --seats 5 --consumption 7.2 --maintenance 5000000 --segment B-Sedan --source-url ...

# Drift signal (never edits data): listing retention vs calibrated anchors
python backend/scripts/catalogue_watch.py [--limit N] [--out report.md]

# Maintenance menu watcher (signal-only provenance; 0/2/3/4 exit codes)
python backend/scripts/fetch_maintenance.py [--cars vf8_2026,...] [--dry-run]

# Monthly resale refresh driver (bonbanh -> bonbanh_real.json; never touches training_data.json)
python backend/scripts/resale_monthly.py

# Stress gate: Modes A+C fast path (--skip-b for LOCO). Baseline 2026-08-22:
# PASS — MAPE 0.78%, maxAPE 8.20% (448 real records, 188 cars) after
# cross-model contamination purge + jaecoo7/q3 anchor pins.
python backend/stress_resale_exhaustive.py --skip-b

# Model delivery (Render build step; no-op while MODELS_VERSION.json source=="repo")
python backend/scripts/fetch_models.py
```

### Model artifacts
Retrained pickles ship via GitHub Release assets; `MODELS_VERSION.json` (`source: repo|release`) decides whether Render uses git blobs or downloads the tagged release (`fetch_models.py`). The monthly workflow only publishes after a gate PASS.

## Notes
- On Windows, use `;` not `&&` to chain commands.
- Paths with spaces (e.g. `ViDrive Web`) must be quoted or passed as `-LiteralPath`.
- Python scripts printing Vietnamese need `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` under cp1252 consoles.
- Ford Ranger line attribution: Wildtrak listings → `ranger_2026`, Raptor listings → `raptor_2026`. The matcher splits by sub-model token and validate_data.py fails CI on cross-contamination.
