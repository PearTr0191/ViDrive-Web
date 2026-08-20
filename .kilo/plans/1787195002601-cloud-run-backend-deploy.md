# Plan: Deploy ViDrive Backend to Google Cloud Run

## Goal
Move the FastAPI backend off Render's free tier (which spins down → slow) to Google Cloud Run,
keeping the app on the **perpetual free tier** while reducing latency for Vietnam users.

## Current-State Findings (from exploration)
- **Runtime deps are a tiny subset of `requirements.txt`.** `src/` imports only `fastapi`, `uvicorn`,
  `pydantic`, `numpy`, `pandas`, `scikit-learn`, `joblib`, `fpdf2`. The heavy packages in
  `requirements.txt` (`torch`, `transformers`, `openvino`, `optimum`, `datasets`, `nncf`,
  `huggingface_hub`, …) are **training-only** and never imported by the API. A slim image avoids a
  multi-GB build and slow cold starts.
- **No database.** State is in-memory (cars cache, ownership-stats cache) + local JSON for proposals.
  Frontend keeps history in `sessionStorage`, so the backend `/api/history/*` endpoints are dead.
  Only `/api/config/proposals` writes to disk (`backend/proposals`), and that must become durable.
- **PDF export is used by the frontend** (`/api/export/pdf`). No `pdflatex` on Cloud Run → falls back
  to `fpdf2`, whose current font setup uses Helvetica (no Vietnamese glyphs) → garbled VI PDFs.
- **`server.py` binds `127.0.0.1:8000`** — must instead bind `0.0.0.0:$PORT` for Cloud Run.
- **Data files are git-tracked**: `backend/data/cars.json`, `backend/data/models/resale_*.pkl`,
  `backend/fonts/*`. A source build will include them.
- Repo: `github.com/PearTr0191/ViDrive-Web`. Frontend (Cloudflare Pages) prod API URL =
  `https://vidrive-web.onrender.com` (`.env.production`) → must be repointed.

## Decisions (confirmed with user)
1. **Free tier + low latency** → `min-instances=0` plus a **Cloud Scheduler warm-ping** every ~10 min
   to prevent scale-to-zero (no always-on cost). Region `asia-southeast1` (Singapore) for lowest VN latency.
2. **Bundle a Vietnamese-capable TTF** (DejaVu Sans) so both EN and VI PDFs render correctly.
3. **Persist proposals to Cloud Storage** via a GCS FUSE mount (env-driven `PROPOSALS_DIR`).

---

## Implementation Steps

### 1. Backend source changes (small, in `backend/`)
- **New `backend/requirements-runtime.txt`** — pinned to the same versions already in `requirements.txt`,
  keeping only runtime packages:
  `fastapi==0.141.1`, `uvicorn==0.52.1`, `pydantic==2.13.4`, `starlette==1.4.1`, `numpy==2.1.2`,
  `pandas==2.2.3`, `scikit-learn==1.8.0`, `joblib==1.4.2`, `fpdf2==2.8.8`, `python-multipart` (if uploads).
  (Drop `pyarrow`/`pyyaml` unless required at runtime — verify `import` chains; they are not needed by `src`.)
- **Bundle VI font**: add `backend/fonts/DejaVuSans.ttf` + `DejaVuSans-Bold.ttf` (covers Vietnamese
  Latin Extended). Update `src/pdf_export.py:_fpdf_font_setup` (pdf_export.py:415) to prefer these bundled
  TTFs (VI-capable) over KaTeX/Windows fonts. This keeps the fpdf2 path correct on Linux.
- **Env-driven proposals dir**: in `src/config.py:551`, change
  `PROPOSALS_DIR = Path(__file__).resolve().parent.parent / "proposals"` to default to that path but allow
  override via `os.environ.get("VIDRIVE_PROPOSALS_DIR", …)` so Cloud Run can point it at the GCS mount.
- **Health/warm endpoint**: add a `/healthz` (and reuse `/`) in `src/api.py` that returns `ok` and calls
  `src.ml_model.get_predictor()` once so the model is loaded during startup probe (faster first real
  request). Keep `server.py` for local dev unchanged.

### 2. Containerize — `backend/Dockerfile` (python:3.11-slim)
- `FROM python:3.11-slim`
- `WORKDIR /app`
- `COPY backend/requirements-runtime.txt requirements.txt` (copy from repo `backend/`)
- `RUN pip install --no-cache-dir -r requirements.txt`
- `COPY backend/ .`  (includes `src/`, `data/`, `fonts/`, `proposals/`)
- `EXPOSE 8080`
- `CMD exec sh -c "uvicorn src.api:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"`
  (Cloud Run injects `PORT`; rely on autoscaling for concurrency rather than many workers to stay in free tier.)

### 3. GCP setup (one-time, gcloud)
- Ensure project + billing, enable: `run.googleapis.com`, `cloudbuild.googleapis.com`,
  `cloudscheduler.googleapis.com`, `storage.googleapis.com`, `file.googleapis.com` (GCS FUSE).
- Create bucket for proposals: `gsutil mb -l asia-southeast1 gs://vidrive-proposals-<proj>`; grant the
  Cloud Run service account `roles/storage.objectAdmin` on it.

### 4. Deploy
- `gcloud run deploy vidrive-api --source backend --region asia-southeast1 --allow-unauthenticated
  --memory 512Mi --cpu 1 --min-instances 0 --max-instances 4 --concurrency 20 --cpu-boost
  --set-env-vars "ALLOWED_ORIGINS=https://vidrive-web.pages.dev,https://localhost:5173,VIDRIVE_PROPOSALS_DIR=/mnt/proposals"
  --add-volume name=proposals-vol bucket=vidrive-proposals-<proj>
  --add-mount volume=proposals-vol mount-path=/mnt/proposals`
  (Builds the Dockerfile via Cloud Build, pushes to Artifact Registry, deploys.)
- If OOM at 512Mi, bump to `1Gi`. Note the service URL printed (e.g. `https://vidrive-api-xxx.run.app`).

### 5. Keep it warm (free tier)
- `gcloud scheduler jobs create http vidrive-warm --location asia-southeast1 --schedule "*/10 * * * *"
  --uri "https://vidrive-api-xxx.run.app/healthz" --http-method GET --attempt-deadline 30s`
  (≈4,320 req/month, well within the 2M free request grant; keeps the instance from scaling to zero.)

### 6. Frontend repoint
- Set `VITE_API_URL=https://vidrive-api-xxx.run.app` in `frontend/.env.production` (build-time for Vite),
  then rebuild and redeploy the Cloudflare Pages site.
- Confirm `ALLOWED_ORIGINS` includes `https://vidrive-web.pages.dev` (already the default).

---

## Validation
1. `curl https://<url>/` → `{"status":"ok",...}`; `curl https://<url>/healthz` → ok and model warm.
2. `curl https://<url>/api/cars | head` returns the car list (proves `cars.json` + import chain work).
3. `POST /api/tco/calculate` with a sample body returns a valid `TcoResult` (proves ML resale path loads).
4. `POST /api/export/pdf` with `lang:"vi"` returns a real PDF whose Vietnamese text is NOT garbled
   (proves bundled DejaVu font works).
5. `POST /api/config/proposals` writes a file; verify it appears in `gs://vidrive-proposals-<proj>`
   (proves GCS FUSE mount + env override).
6. Open the live Cloudflare site, run a TCO calc + PDF export (VI) end-to-end.
7. Observe cold-start: after >10 min idle, a real request should be warm (sub-second) thanks to the
   scheduler ping. Compare latency to the old Render URL.

## Risks / Notes
- **Free-tier limits**: 2M requests, 360k vCPU-s, 180k GiB-s/month. Warm-ping + normal traffic stays well
  inside; `min-instances=0` keeps it free. If you later want guaranteed zero cold-starts, set
  `--min-instances=1` (small monthly cost).
- **GCS FUSE** requires the service account + bucket region alignment and adds a little cold-mount latency
  on first proposal write; acceptable for a review-only loop.
- **PDF math/formatting** on Cloud Run uses fpdf2 (not the nicer LaTeX output) — acceptable; EN is unchanged.
- **`requirements-runtime.txt` must stay in sync** with the API's real imports; if a new runtime import is
  added later, add it there (this is the one bit of maintenance the slim image introduces).
- **Secrets**: none required by the API (no external keys) → no Secret Manager needed.
