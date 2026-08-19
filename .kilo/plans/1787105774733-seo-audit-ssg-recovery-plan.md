# SEO Audit, 2nd run

ViDrive Web — Comprehensive SEO / AEO / CRO / Performance Audit
**Deploy target:** `vidrive-web.pages.dev` · **Status:** pre-deploy verification snapshot (`frontend/dist/` built 2026-08-19, 92 sitemap URLs).
Evidence below is from inspecting the actual SSG output (every `<title>`, `<meta>`, `<link>`, `<script type="application/ld+json">` in `dist/*/index.html`), not from assumptions.

## A. What the SSG migration already bought you (verified in dist/)

1. **Real static HTML per route** — `dist/car/vios_2026/index.html` ships `<title>ViDrive - Toyota Vios 1.5G</title>`, a 155-char VI `<meta name="description">`, `<link rel="canonical">`, `og:image` (absolute), `hreflang="vi" + x-default`, and a `Car` + `BreadcrumbList` JSON-LD graph. Crawlers/LLM parsers get content without executing JS. ✅
2. **Per-route SEO is wired** — every page calls `useSeoMetaSafe(...)` (sets title/description/OG/Twitter/canonical) + `JsonLd(...)`. `@unhead/react` SSR injects these into the prerendered `<head>`. ✅ Verified live in `dist/`.
3. **Canonical is clean** — canonical is the bare path (`/tco`), query strings stripped (`/tco?car=x` → `<title>…</title>` + canonical `/tco`) → no parameterized duplicate-content. ✅
4. **Structured data already ships** — `Organization`, `WebSite`+SearchAction, `FAQPage` (12 Q&As), `SoftwareApplication`, `HowTo`, `BreadcrumbList`, `Car` (82×) all inline as JSON-LD in static HTML. ✅
5. **92 URLs in sitemap.xml**, dynamically driven from `cars.json` via `vite.config.ts` `dynamicRoutes` — no hardcoded car list to desync. ✅
6. **`<html lang="vi">`** on prerendered pages (correct — content is Vietnamese). ✅
7. **`noindex,nofollow`** on `/history` (History.tsx:42) and `/404` (NotFound.tsx:12) ✅; both excluded from sitemap ✅.

**Net: the core crawlability/indexation gap is closed.** The remaining work is (1) a few broken/inconsistent head tags, (2) richer/more AEO-oriented structured data, (3) CRO on the high-intent calculator funnel, (4) Core Web Vitals polish, (5) the one build bug that drops `_headers`. The SPA "bare HTML for all 91 routes" problem this plan was written to fix is **already fixed** by `vite-plugin-react-ssg`.

## B. TECHNICAL SEO — current, build-verified findings

### P0 — Blocking / broken

**B1. `_headers` is NOT generated** (build bug). `writeHeaders()` runs in `scripts/build-ssg.mjs` but **no `_headers` file exists in `frontend/dist/`** (`Test-Path dist\_headers` = False; `Get-ChildItem dist` listing has no `_headers`). Result: **no `Strict-Transport-Security`, no `Cache-Control`, no `X-Content-Type-Options`, no `Referrer-Policy`**. Cloudflare Pages silently ignores `_headers` only if absent.
- *Fix:* make `writeHeaders()` run on every build (it's currently gated and not executing reliably); verify the file ships to `dist/_headers`. **Verify after next build.**

**B2. `og:image` is a relative path + the default OG asset is a broken 70-byte stub.**
- Home/TCO/Compare/Wizard/guides Methodology/Terms/Privacy all render `<meta property="og:image" content="/og-tco.png">`.
- `public/og-tco.png` is **70 bytes** — not a 1200×630 image (OpenGraph requires absolute URL + valid image; relative URLs work on Twitter but Facebook/Slack may not resolve on `pages.dev` and Google can't index a 70-byte file).
- Car pages already use the absolute `${SITE_URL}/cars/{id}.webp` (correct) ✅.
- Also: `og:image:alt` = the page title (not a real image description) — weak for accessibility/AT.
- *Fix:* generate a real `og-tco.png` (1200×630, with the ViDrive logo + Vietnamese tagline) or replace the default with the absolute `${SITE_URL}/hero/lucid-light.jpg` hero image. Set `og:image:alt` to a descriptive sentence, not the title.

**B3. SearchAction targets a search param the browse page never reads.** `App.tsx` emits `WebSite.potentialAction.target = ${SITE_URL}/car?q={search_term_string}`, but `BrowseCars` reads search from component state (`useState`) not `useSearchParams().get('q')`. Google's sitelinks searchbox will land users on an unfiltered `/car?q=...` → empty result. (Verified live.)
- *Fix:* `BrowseCars` must seed `searchTerm` from `useSearchParams().get('q') ?? get('search_term_string')` on mount, then clear the param.

**B4. `/wizard` is indexed-dangerous on a technicality.** It's excluded from `sitemap.xml` ✅ and disallowed in `robots.txt` ✅, but the prerendered `dist/wizard/index.html` contains **no `<meta name="robots" content="noindex">`** (grep count = 0). If the robots.txt disallow is ever removed or a deep link is discovered, it becomes indexable. Inconsistent with `/history` and `/404` which both carry explicit noindex.
- *Fix:* `Wizard.tsx` → `useSeoMetaSafe({ ..., noindex: true })` (consistent with History/NotFound).

**B5. `_redirects` `/*  /index.html 200` creates real soft-404s.** `frontend/public/_redirects` = `/*    /index.html   200`. So `GET /car/nonexistent-slug-99999` returns **HTTP 200** + the full SPA shell that then client-renders NotFound. Verified: `dist/car/` only contains real car dirs — a typo'd car slug 404s at the SPA layer with status 200.
- *Fix:* Cloudflare Pages Function (`functions/[[carmatch]].js`) returning a true `404` for unknown `/car/:id`, *or* accept it (Google treats `noindex` 200 NotFound as a non-indexable page — but it wastes crawl budget and is the "4XX ×1" Ahrefs finding).

**B6. `og:type` missing everywhere.** Audit B11 confirmed. Car pages could carry `og:type=product`; others should be `website` (defaulted client-side but confirm it renders in static HTML).

**B7. `changefreq=daily` on car pages.** Post-processed in `build-ssg.mjs` sets car pages `changefreq=weekly` ✅ (the live sitemap already reflects this); verify against any future build.

### P1 — High

**B8. `dist/_headers` absent** — same as B1, escalated to P0 because HSTS preload is a security signal.

**B9. Homepage `<title>` lacks CRO hook.** `ViDrive - Tính chi phí sở hữu ô tô` (keyword-strong ✅, but generic). Keep for SEO; CRO lift via meta is marginal — better to improve above-the-fold copy (see D4).

**B10. No `theme-color` for the light scheme.** `index.html:15-16` only sets dark `#0A0A0B` via `prefers-color-scheme: dark`; the light scheme has no `theme-color` → mobile Chrome address bar won't pick the light theme color. Cosmetic.

### P2 — Medium/Low

**B11. `og:locale` not set in static HTML.** `useSeoMetaSafe` sets `ogLocale` to `vi_VN`/`en_US` but grep of `dist/index.html` for `og:locale` = 0 → not rendering. Minor relevance signal for regionalized content.
- *Fix:* confirm `@unhead/react` `ogLocale` maps to `property="og:locale"`; if not, add raw meta via `useHead`.

**B12. `index.html` ships a dead `<noscript>` font block + inline `gtag`** (harmless since JS is required for the app).

**B13. `ConfigProposals.tsx` is not routed** — no SEO risk today, just flag. (Unchanged from audit plan.)

## C. CONTENT & AEO — current state + gaps

### Verified positives (keep these)
- **Organization** block ships on every page (App.tsx:84) — `sameAs` = GitHub + Zalo, `contactPoint` with email/phone ✅
- **WebSite + SearchAction** ships ✅ (but target broken — see B3)
- **FAQPage** on Landing wraps all 12 FAQ pairs (i18n `landing.faqQ*`/`faqA*`) ✅ — high AEO value
- **Car `Car` schema** on all 82 car pages ✅ — name, brand, model, category, sku, fuelType, vehicleEngine, numberOfSeats, offers.price/priceCurrency/availability, image, url ✅
- **BreadcrumbList** on Landing, TCO, Compare, BrowseCars, CarDetail ✅
- **HowTo** (3 steps) on Landing ✅
- **SoftwareApplication** (the calculator) on Landing ✅

### P0 — AEO gaps

**C1. `Car` schema is thin vs `Car`/`Vehicle` best practice.** Audit C3 asked for `additionalProperty` specs. Current has `description`, `sku`, `fuelType`, `numberOfSeats` ✅ but **no `additionalProperty` for specs** (segment, consumption, power, transmission). Per-page uniqueness is good (price, brand, model vary). **No `aggregateRating`** (no ratings source exists — omit rather than fake).
- *Fix (optional, low):* add `additionalProperty` array from `cars.json` (segment, consumption, seats) — genuine added AEO value. Skip `aggregateRating`.

**C2. FAQ is Landing-only.** `JsonLd(FAQPage)` exists only on Landing (12 Q&As). **TCO (`/tco`) and Compare (`/compare`) have ZERO FAQPage schema and ZERO visible FAQ** — the highest-commercial-intent pages. Verified: grep `FAQPage` in `dist/tco/index.html` and `dist/compare/index.html` = 0.
- *Fix:* port the 12 FAQ pairs + 6 VN long-tail Q&As into both pages. "Tính TCO là gì", "chi phí nuôi xe Vios", "phí trước bạ 2026", "xe điện có rẻ hơn xăng" — exactly answer-engine questions.

**C3. Guides hub is scaffold-only.** `dist/guides/index.html` renders 12 `<article>` placeholders from `ARTICLES` slugs (Guides.tsx:6-15), each 3 short `guides.{slug}.body{i}` lines. **No unique destination URLs per guide** (nav links are `href="#slug"` in-page anchors) → nothing for Google to index per-topic, and content is thin. Audit C5, still open.
- *Fix:* give each guide its own route (`/guides/:slug`) + unique title/description + Article JSON-LD, OR expand in-page content to 300+ words each with unique headings. Currently a thin-content CRO/SEO liability despite being a topical-authority opportunity.

**C4. Methodology has no author/E-E-A-T attribution.** Audit C15/C4 wanted `Article` schema + author + `dateModified` + source citations. Currently **no `JsonLd(Article)`** (grep `Article` in `dist/methodology/index.html` = 0), no byline, no `dateModified`. It cites 5 real sources inline (Methodology.tsx:647-675) but not machine-readable.
- *Fix:* add `Article` JSON-LD with `author: {name: 'ViDrive Data Team'}` + `dateModified` (from `assumptionsMeta.last_updated`) + `citation` array of the 5 source URLs.

**C5. `og:image:alt` = page title (weak).** Confirmed on home (`og:image:alt` = "ViDrive - Tính chi phí sở hữu ô tô"). Alt should describe the image.

**C6. Bilingual URL-i18n (`/vi/`, `/en/`).** Locale is client-only; self-referential `hreflang="vi"` + `x-default` is implemented ✅ but there are **no `en` alternates** and English content is never in static HTML. The audit plan's B6/C9/C14.
- *Assessment:* **medium-term architecture work**, not a P0. The self-referential hreflang is the correct MVP. Document the `/vi/`, `/en/` refactor as a tracked follow-up.

### P1 — authority / structure
- **Footer links sparse** — only Terms/Privacy (audit D8). Add Browse / Calculate / Compare / Guides / Methodology columns for topical-internal-linking.
- **Car pages ~30-40 words of unique editorial** (audit C6). H1 = "{brand} {model}" ✅, schema has `description` ✅, but body prose is spec-table-only. Add a templated 1-line intro + 5-yr ownership summary.

### P2 — enhancement
- **Speakable markup** (audit C11) — not implemented; for Vietnamese voice search this is future-looking.
- **Per-car 1200×630 OG** (audit C16) — car pages share the 850×484 webp; dedicated OG images improve rich-result CTR.

## D. CRO & UX — build-verified

### P0 — conversion blockers
**D1. TCO/Compare deep-link CTAs are broken.** `Landing` "So sánh" → `/compare` with **no prefilled car** (Landing.tsx:445-447 `to="/compare"`). Compare seeds only `car0` (one car) → "Calculate" disabled (needs 2). **Verified in dist:** `/compare` ships the disabled-calculate shell. And TCO CTA → `/tco` with no `?car=`.
- *Fix:* Land → `/tco?car=vios_2026` and `/compare?car0=vios_2026&car1=ex5_2026`, OR change CTA to "Thêm xe để so sánh".

**D2. "Share"/"Copy link" buried in kebab.** Audit D3. After a result, share is in a 3-dot menu. **Promote a visible "Chia sẻ kết quả" button** — highest-viral CRO lever (VN users share results heavily on Zalo).

**D3. Reset is the primary action after a calculation.** Audit D6. After computing, the big button flips to "Đặt lại" (destructive, primary slot) — users click it by reflex and lose their result.
- *Fix:* primary = "Tính lại" (same position), Reset = ghost/outline secondary button.

### P1 — friction/trust
**D4. No trust row above the fold.** Audit D5/D7. Hero jumps H1 → stats → 3-step → carousel → CTA. No evidence of neutrality ("không hước lợi", "không bán dẫn") or "built by" attribution above the CTA.
- *Fix:* 1-line trust sentence under hero CTAs ("Không hợp tác với đại lý, không thu thập dẫn khách — kết quả 100% độc lập") + GitHub attribution.

**D5. `og:image` stub breaks social sharing.** D1 above (70-byte file). Shares of `/` / `/tco` / `/compare` render with no/broken image → lower click-through + AEO entity signal.

**D6. Empty/error states lack recovery CTAs.** Audit D12. When TCO API errors or Compare has 0 cars, the UX is text-only. Add a primary CTA ("Về trang chủ" / "Xem danh sách xe").

**D7. City selector desync.** Audit D9 (TcoCalculator.tsx:766-778 vs 119/66). `<select>` option values must equal the URL slug the API expects. Verify default = `hanoi` and `?city=` hydrates the select.

### P2
- **Wizard not in nav** (audit D11) — intentional? If a funnel step, promote. If not, fine — keep noindex + exclude.
- **No email/return capture.** ViDrive is anonymous-by-design (selling point). Don't break that.
- **Loan calculator collapsed.** Audit D17 — financing is a major purchase decision. Keep, but surface monthly figure higher.

## E. PERFORMANCE & CORE WEB VITALS

### P0
**E1. Hero LCP text visible in SSG HTML?** Verified **opposite** to the old audit flag: `dist/index.html` hero renders `opacity:1` (framer-motion `initial` is applied client-side only via `useReducedMotion` guards; the SSG shell has no inline `opacity:0` on hero text). H1 + subtitle + CTA are paintable in static HTML ✅. **LCP is not blocked** — the audit's E1 is resolved by SSG + the reduced-motion guards. (Confirm with Lighthouse.)

**E2. `_headers` missing → no long-cache headers.** Audit E6 — **confirmed broken** (B1/B8). **P0 fix.**

### P1
**E3. No route-level code-splitting.** Audit E2. **Verified FIXED** — `TcoCharts` is `lazy(() => import('../components/TcoCharts'))` (TcoCalculator.tsx:22) ✅, so recharts is NOT in the Landing/Car entry chunk. Confirm via bundle analysis.

**E4. SSG inlines full car dataset into every page.** Audit E5. `dist/car/vios_2026/index.html` = 128 KB (heavy — full cars cache embedded for hydration). Acceptable for 82 product pages (rich HTML > slow). Landing (~55 KB) + Browse carry the cache too.
- *Assessment:* **low priority** — real content is what SEO wants. Defer only if parse-time CWV complains.

**E5. Fonts** — `index.html:20-30` preloads Google Fonts with `media="print" onload` ✅; no `@import` in `index.css` ✅; theme pre-paint script ✅. **Fonts/perf basics done.**

**E6. `framer-motion` full runtime.** Audit E7. `motion` imported per-component (acceptable). `LazyMotion` not used — optional. Skip unless INP needs it.

### P2
- Car images lack `srcset` (CarMedia.tsx:81-89) — variants exist but not wired to `srcSet`. Medium polish.
- `AnimatedCounter` starts at 0 → minor CLS. Reserve width.
- Tachometer/VT-scrollbar `useScroll` — keep but throttle.

## F. MASTER PRIORITIZED BACKLOG (actionable, build-verified)

### Sprint 1 — deploy-gate / P0 (1–2 days, agent-runnable)
1. **`_headers` build bug (B1/B8/E2)** — fix `scripts/build-ssg.mjs` `writeHeaders()` to reliably emit `dist/_headers`; verify file exists post-build; add `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security` (preload), `/assets/*` immutable, `/*.html` no-cache. *(Owner: you — build script.)*
2. **Build assertion: reject `*.pages.dev` in prod** — in `build-ssg.mjs`: if `VITE_SITE_URL` contains `.pages.dev` AND prod, throw. (~5 lines.)
3. **Generate real `og-tco.png`** (1200×630) OR swap default `og:image` to `${SITE_URL}/hero/lucid-light.jpg` + fix `og:image:alt` to a description. *(Designer: 1200×630 asset.)*
4. **Fix SearchAction target (B3/C1)** — `BrowseCars` seeds `searchTerm` from `useSearchParams().get('q')`. (~10 lines.)
5. **`og:type` + `og:locale` render check (B6/B11)** — confirm `@unhead/react` emits them in static HTML; if not, add raw meta. (Verify + 1-line fix.)
6. **Add `noindex` meta to Wizard (B4)** — `Wizard.tsx` → `useSeoMetaSafe({ noindex: true })`. (1 line.)
7. **Landing CTA pre-fill (D1)** — `Landing.tsx` → `/tco?car=vios_2026` and `/compare?car0=vios_2026&car1=ex5_2026`. (2 lines.)
8. **Promote "Share" button (D2)** — `TcoCalculator`/`Compare` result header: visible "Chia sẻ" button (un-kebab the Share action).
9. **Reset → ghost (D3)** — make "Đặt lại" outline/secondary, primary stays "Tính lại". (1 line.)
10. **Soft-404 edge 404** — optional Pages Function for unknown `/car/:id` → true 404. (If Ahrefs flags it; low priority — 200+noindex NotFound is acceptable.)

### Sprint 2 — content/schematic authority (CRO + AEO, 3–5 days)
11. **FAQPage on TCO + Compare (C2)** — lift the 12 FAQ pairs + 6 VN long-tail Q&As into both pages. (Content + JsonLd.)
12. **Methodology Article schema (C4)** — author + dateModified + citation array of 5 sources. (~10 lines of JsonLd.)
13. **`Car` schema `additionalProperty`** (C1) — segment/consumption/seats as spec name/value. (Mapping in CarDetail.tsx.)
14. **Footer internal linking (D4 / audit D8)** — add Browse / Calculate / Compare / Guides / Methodology columns. (Layout edit.)
15. **Trust row under hero (D4)** — 1-line neutrality + GitHub attribution. (Landing edit.)
16. **Error/recovery CTAs (D6)** — Add "Về trang chủ" button on empty/error states. (3 small edits.)

### Sprint 3 — medium polish / future-proofing (backlog)
17. **Guides per-slug routes OR expanded content (C3)** — decide: unique `/guides/:slug` pages (Article JSON-LD) vs. 300-word-expanded accordion content.
18. **`og:image:alt` → descriptive sentence** (C5/C6). (seo.tsx tweak.)
19. **`srcset` on car images** (E4 P2). (CarMedia edit.)
20. **Bilingual URL-i18n refactor (`/vi/`, `/en/`)** (C6) — the real hreflang fix. **Tracked as medium-term architecture work, not P0.**
21. **Speakable + HowTo enrichment** (audit C10/C11) — optional voice AEO.
22. **Per-car 1200×630 OG** (audit C16) — dedicated car OG images improve rich-result CTR.

## G. RECOMMENDED SEQUENCING (owner vs. agent)

| Task | Owner | Skill | Est. |
|---|---|---|---|
| `_headers` build bug fix | you (build script) | shell/script | 30 min |
| Build assertion reject `*.pages.dev` | you | script | 15 min |
| Real `og-tco.png` asset | designer (you) | design | 1–2 hrs |
| Fix SearchAction / `noindex` Wizard / pre-fill CTAs / Share button / Reset-as-secondary | agent | React edits | 1 day |
| FAQPage on TCO/Compare + Methodology Article + Car `additionalProperty` + footer links + trust row | agent (content sign-off: you) | content + code | 2 days |
| Expand/structure Guides | you (content) + agent (routes) | content-heavy | 1–2 days |
| `_headers` + `og:image` verification on next deploy | you | deploy gate | 15 min |
| Bilingual URL-i18n refactor | you (architectural call) | refactor | tracked |

## H. VERIFICATION PLAN (post-deploy, agent-runnable with curl)

```bash
# B1: _headers ships
curl -sI https://vidrive-web.pages.dev/assets/index-*.js | grep -i "cache-control:.*immutable"
curl -sI https://vidrive-web.pages.dev/            | grep -i "strict-transport-security"

# B2/B11: absolute og:image + og:type
curl -s https://vidrive-web.pages.dev/ | tr '>' '>\n' | grep -E 'og:image|og:type'
# Expect: content="https://vidrive-web.pages.dev/og-tco.png" (absolute, real image)

# B3: SearchAction target resolves
curl -s "https://vidrive-web.pages.dev/car?q=vios" | tr '>' '>\n' | grep -i 'vios'  # filtered

# B4: wizard noindex
curl -s https://vidrive-web.pages.dev/wizard | grep -i 'robots.*noindex'

# B2 soft-404
curl -sI https://vidrive-web.pages.dev/car/typo-99999 | grep -E "HTTP/|noindex"

# C2: FAQPage on tco + compare
curl -s https://vidrive-web.pages.dev/tco     | grep -o '"@type":"FAQPage"'
curl -s https://vidrive-web.pages.dev/compare  | grep -o '"@type":"FAQPage"'

# C4: Methodology Article
curl -s https://vidrive-web.pages.dev/methodology | grep -o '"@type":"Article"'

# C1: Car additionalProperty (vios)
curl -s https://vidrive-web.pages.dev/car/vios_2026 | grep -o '"additionalProperty"'

# B6: hreflang + og:locale on home
curl -s https://vidrive-web.pages.dev/ | tr '>' '>\n' | grep -E 'hreflang="x-default"|og:locale'

# D1: pre-filled compare ships with 2 cars
curl -s https://vidrive-web.pages.dev/compare | grep -o 'car0=vios_2026.*car1='

# sitemap sanity (92 URLs, no wizard/history/404)
curl -s https://vidrive-web.pages.dev/sitemap.xml | grep -c '<loc>'
curl -s https://vidrive-web.pages.dev/sitemap.xml | grep -E 'wizard|history|/404'  # expect 0
```

**`tsc --noEmit` + `vite build`** must both pass (the project requires both; Vite/rolldown catches JSX errors tsc skips). **Hydration check:** open each route, zero hydration mismatches.

## I. SUMMARY OF CURRENT STATE (honest, build-verified)

| Claim (from old audit) | Current reality |
|---|---|
| "SPA serves bare HTML for all 91 routes" | **Fixed** — SSG ships real per-route HTML ✅ |
| "No `<h1>` on 6 pages" | **Fixed** — all pages have `<h1>` ✅ |
| "Meta title/description shared by all pages" | **Fixed** — per-route via `useSeoMetaSafe` ✅ |
| "<html lang=en> on Vietnamese pages" | **Fixed** — `lang="vi"` ✅ |
| "Car pages not in sitemap" | **Fixed** — 82 car URLs in sitemap ✅ |
| "`_headers` not configured" | **Still broken** — file absent from dist ❌ (B1) |
| "Default OG image / absolute og:image" | **Partially broken** — `/og-tco.png` is a 70-byte stub, relative URL ❌ (B2) |
| "SearchAction broken" | **Still broken** — BrowseCars ignores `?q` ❌ (B3) |
| "`/wizard` no noindex" | **Inconsistent** — robots-disallowed + sitemap-excluded but no `<meta robots>` ❌ (B4) |
| "Soft-404 via 200 SPA shell" | **Still present** — `/* /index.html 200` ❌ (B5, acceptable w/ noindex) |
| "FAQPage only on Landing" | **True** — TCO/Compare have none ❌ (C2, high-leverage fix) |
| "Methodology no Article/author/E-E-A-T" | **True** ❌ (C4) |
| "Guides hub thin" | **True** — 3-paragraph placeholders, no per-slug URLs ❌ (C3) |
| "Reset is primary after calc / Share buried" | **True** ❌ (D1/D2/D3, quick wins) |

**The single highest-ROI remaining change** is **Sprint 1 #1 (fix `_headers`) + #3 (real OG image) + #7 (pre-fill Landing CTAs)** — 3 tiny fixes that add (a) security + caching headers on every request, (b) social/AEO image signal on every share, and (c) the #1 conversion-leak funnel drop. Total effort: ~1 designer hour + 15 minutes scripting.

**The single highest organic-growth remaining change** is **#11 (FAQPage on TCO + Compare with VN long-tail questions)** — Google sends commercial-intent traffic to those pages, and FAQ rich results are the most reliable way to earn an AEO "presence" (snippet + FAQ expansion) for Vietnamese queries today.

The pre-SSG SPA problem this plan was originally written to solve has been **solved** (by `vite-plugin-react-ssg`). This revised plan replaces the "build an SSG" effort with a "fix the 6 remaining shipping defects" effort.