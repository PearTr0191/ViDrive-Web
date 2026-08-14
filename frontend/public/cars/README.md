# Car Images Convention

Static assets served by Vite from `frontend/public/cars/`.

## File naming
`{car_id}.webp` — match the car id from `backend/data/cars.json` *exactly*
(case-sensitive, e.g. `vf_e34_2026.webp`, `altis_2026.webp`).

## Image specs
- **Profile:** Right-side (RHS) three-quarters or full side profile
- **Background:** Transparent (preferred) or near-white background
- **Resolution:** ~1200×675 (16:9), optimize to ≤ 80KB
- **Format:** WebP only
- **License:** Must be royalty-free / CC0 / Unsplash / own photography

## Fallback behavior
If an image is missing (404 → `onError`), the `CarMedia` component silently falls
back to a segment-aware SVG silhouette. No broken-image icon shown, no layout shift.

## Conventions
- Keep filenames URL-safe: lowercase, no spaces, no special characters besides `_` and `.`
- Commit images individually (avoid large .git blobs for unnecessary variants)

## Source suggestions
- Google Images with "cc0"/"public domain" filter for Vietnamese car models
- Manufacturer press kit pages (VinFast, Hyundai Vietnam, etc.)
- Unsplash / Pexels / Wikimedia Commons (search brand+model)

---

*This README is developer documentation. It is not deployed to production.*