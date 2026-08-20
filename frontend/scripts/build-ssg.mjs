import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const frontendDir = process.cwd()
const distDir = resolve(frontendDir, 'dist')
const SITE_URL = (process.env.VITE_SITE_URL || 'https://vidrive-web.pages.dev').replace(/\/$/, '')

// Recursively walk dist for .html files
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name)
    const s = statSync(full)
    if (s.isDirectory()) walk(full, acc)
    else if (name.endsWith('.html')) acc.push(full)
  }
  return acc
}

// B5: the SSG plugin emits <html lang="en"> regardless of the default (vi)
// locale. Force the prerendered language to Vietnamese (the default locale).
function rewriteHtmlLang() {
  if (!existsSync(distDir)) return
  for (const file of walk(distDir)) {
    const html = readFileSync(file, 'utf-8')
    const relPath = file.slice(distDir.length)
    // Files under /en/ → lang="en"; root index.html (shell) and /vi/ → lang="vi"
    const isEn = relPath.startsWith('/en/') || relPath === '/en/index.html'
    const expectedLang = isEn ? 'en' : 'vi'
    const fixed = html.replace(/<html([^>]*)lang="([^"]*)"/, (match, p1, lang) => {
      if (lang === expectedLang) return match
      return `<html${p1}lang="${expectedLang}"`
    })
    if (fixed !== html) writeFileSync(file, fixed)
  }
}

// B1: generate robots.txt with the resolved canonical domain (env-overridable).
function writeRobots() {
  const robots = `User-agent: *
Allow: /

# User-specific and duplicate/thin surfaces — keep parameterized and private
# routes out of the index. \`/*\` is a wildcard, \`?\` is a literal so we use \`*?*\`.
# Patterns cover both locale prefixes (/vi, /en) and the root.
Disallow: /vi/history
Disallow: /en/history
Disallow: /history
Disallow: /vi/wizard
Disallow: /en/wizard
Disallow: /wizard
Disallow: /*?*
Disallow: /vi/*?*
Disallow: /en/*?*

Sitemap: ${SITE_URL}/sitemap.xml
`
  writeFileSync(resolve(distDir, 'robots.txt'), robots, 'utf-8')
}

// B8 + hygiene: assign a priority/changefreq hierarchy to the generated sitemap.
function postProcessSitemap() {
  const sitemapPath = resolve(distDir, 'sitemap.xml')
  if (!existsSync(sitemapPath)) return
  let xml = readFileSync(sitemapPath, 'utf-8')
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(m => m[1])
  const seen = new Set()
  const rebuilt = entries
    .map(block => {
      const locMatch = block.match(/<loc>([\s\S]*?)<\/loc>/)
      const loc = locMatch ? locMatch[1] : ''
      if (seen.has(loc)) return null
      seen.add(loc)
      const fullPath = loc.replace(SITE_URL, '') || '/'
      // Strip locale prefix for matching, but keep the original for output
      const strippedPath = fullPath.replace(/^\/(en|vi)(\/|$)/, '/')
      let priority = '0.5'
      let changefreq = 'weekly'
      if (strippedPath === '/') { priority = '1.0'; changefreq = 'daily' }
      else if (strippedPath === '/tco' || strippedPath === '/compare') { priority = '0.9'; changefreq = 'daily' }
      else if (strippedPath.startsWith('/car/')) { priority = '0.8'; changefreq = 'weekly' }
      else if (strippedPath === '/car' || strippedPath === '/browse' || strippedPath === '/guides') { priority = '0.7'; changefreq = 'weekly' }
      else if (strippedPath === '/methodology') { priority = '0.6'; changefreq = 'monthly' }
      else { priority = '0.5'; changefreq = 'monthly' }
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${new Date().toISOString().split('.')[0]}Z</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
    })
    .filter(Boolean)
    .join('\n')
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">'
  writeFileSync(sitemapPath, `${header}\n${rebuilt}\n</urlset>\n`)
}

// E6 / plan Phase 6: long-cache immutable hashed assets; no-cache HTML; HSTS.
function writeHeaders() {
  const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
`
  writeFileSync(resolve(distDir, '_headers'), headers)
}

const backendDir = resolve(__dirname, '../backend')

function startBackend() {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn('python', ['server.py'], {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let ready = false
    const timeout = setTimeout(() => {
      if (!ready) {
        resolvePromise(null)
      }
    }, 15000)

    proc.stdout.on('data', (data) => {
      const text = data.toString()
      process.stdout.write(`[backend] ${text}`)
      if (text.includes('Uvicorn') || text.includes('running') || text.includes('Started')) {
        if (!ready) {
          ready = true
          clearTimeout(timeout)
          resolvePromise(proc)
        }
      }
    })

    proc.stderr.on('data', (data) => {
      process.stderr.write(`[backend] ${data}`)
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      // `python` not on PATH (e.g. Cloudflare Pages build env) — fall back to
      // static data instead of treating the absence as a fatal build error.
      if (err.code === 'ENOENT') {
        console.warn('[build-ssg] python not found — skipping local backend, using static fallback data')
        resolvePromise(null)
      } else {
        reject(err)
      }
    })

    proc.on('exit', (code) => {
      if (!ready && code !== 0) {
        clearTimeout(timeout)
        resolvePromise(null)
      }
    })
  })
}

async function waitForBackend(maxWait = 20000) {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch('http://localhost:8000/api/config')
      if (res.ok) return true
    } catch {
      // wait
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

async function main() {
  let backend = null

  try {
    backend = await startBackend()
    if (backend) {
      const ready = await waitForBackend()
      if (ready) {
        console.log('[build-ssg] Backend is ready')
      } else {
        console.warn('[build-ssg] Backend started but health check failed — using static fallback data')
      }
    } else {
      console.warn('[build-ssg] Could not start backend — using static fallback data')
    }
  } catch (e) {
    console.warn('[build-ssg] Backend not available:', e.message)
  }

  // vite-plugin-react-ssg leaves open handles after SSG completes, so vite
  // never exits on its own — we detect completion via vite's own stdout marker
  // ("Static HTML generation completed: N total") and terminate the process.
  // stdout is piped (and re-emitted) so we see vite's progress AND catch the
  // marker; stderr stays inherited for live error visibility.
  //
  // DO NOT use a transient artifact-count plateau as a kill trigger: during
  // "rendering chunks" vite writes a shell index.html + the vite-plugin-sitemap
  // sitemap.xml, which falsely looks "stable" and kills the build mid-SSG
  // (leaving dist/ with zero prerendered route HTML). The marker is the only
  // reliable signal that every route's HTML has been flushed to disk.
  const vite = spawn('node', ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  let ssgComplete = false
  const exitCode = await new Promise((resolve) => {
    let resolved = false
    const finish = (code) => {
      if (!resolved) { resolved = true; resolve(code || 0) }
    }

    vite.on('close', finish)
    vite.on('error', (err) => {
      console.error('[build-ssg] Vite process error:', err.message)
      finish(1)
    })

    // Primary completion signal: vite-plugin-react-ssg prints this ONLY after
    // every route's HTML has been written to disk.
    vite.stdout.on('data', (data) => {
      const text = data.toString()
      process.stdout.write(text)
      if (!ssgComplete && /Static HTML generation completed/.test(text)) {
        ssgComplete = true
        console.log('[build-ssg] SSG flush complete — terminating vite and proceeding')
        setImmediate(() => { vite.kill('SIGTERM'); finish(0) })
      }
    })

    // Safety net: a 101-route SSG + client bundle finishes well under 240s.
    setTimeout(() => {
      if (!resolved) {
        console.warn('[build-ssg] Vite did not report SSG completion within 240s; proceeding (dist may be incomplete)')
        finish(0)
      }
    }, 240000)
  })

  if (backend) {
    backend.kill()
  }

  // Post-build SEO/CWV hardening. Gating rules:
  //   - hasShell is required (the shell index.html proves vite emitted *something*).
  //   - ssgComplete is required before touching the sitemap: the safety net (240s)
  //     can fire mid-SSG, after the shell index.html + a *stale/partial* sitemap.xml
  //     exist but before any route HTML is flushed. Post-processing that partial
  //     sitemap would publish a broken sitemap listing fewer than the real routes.
  //   - A minimum route count is a belt-and-suspenders check for the same hazard.
  const routeHtmlCount = walk(distDir).length
  const hasShell = existsSync(resolve(distDir, 'index.html'))
  const hasSitemap = existsSync(resolve(distDir, 'sitemap.xml'))
  const MIN_ROUTES = 100
  if (!hasShell) {
    console.error(`[build-ssg] FATAL: dist/index.html missing — SSG did not complete (found ${routeHtmlCount} HTML files). Skipping SEO hardening.`)
  } else if (!ssgComplete) {
    console.error(`[build-ssg] WARNING: SSG completion marker not seen (safety net may have fired) — dist may be incomplete (${routeHtmlCount} HTML files). Skipping sitemap post-processing to avoid publishing a broken sitemap.`)
    rewriteHtmlLang()
    writeRobots()
    writeHeaders()
  } else if (routeHtmlCount < MIN_ROUTES) {
    console.error(`[build-ssg] WARNING: only ${routeHtmlCount} HTML files found (expected >= ${MIN_ROUTES}); possible incomplete prerender. Skipping sitemap post-processing.`)
    rewriteHtmlLang()
    writeRobots()
    writeHeaders()
  } else if (hasSitemap) {
    rewriteHtmlLang()
    writeRobots()
    postProcessSitemap()
    writeHeaders()
    console.log(`[build-ssg] post-build SEO hardening complete (SSG dist OK: ${routeHtmlCount} HTML files)`)
  } else {
    console.error('[build-ssg] WARNING: sitemap.xml missing — running non-sitemap hardening only')
    rewriteHtmlLang()
    writeRobots()
    writeHeaders()
  }

  process.exit(exitCode || 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
