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

## Notes
- On Windows, use `;` not `&&` to chain commands.
- Paths with spaces (e.g. `ViDrive Web`) must be quoted or passed as `-LiteralPath`.
