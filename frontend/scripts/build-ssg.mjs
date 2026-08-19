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
    const fixed = html.replace(/<html([^>]*)lang="en"/, '<html$1lang="vi"')
    if (fixed !== html) writeFileSync(file, fixed)
  }
}

// B1: generate robots.txt with the resolved canonical domain (env-overridable).
function writeRobots() {
  const robots = `User-agent: *
Allow: /

# User-specific and duplicate/thin surfaces — keep parameterized and private
# routes out of the index. \`/*\` is a wildcard, \`?\` is a literal so we use \`*?*\`.
Disallow: /history
Disallow: /wizard
Disallow: /*?*

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
      let priority = '0.5'
      let changefreq = 'weekly'
      const path = loc.replace(SITE_URL, '') || '/'
      if (path === '/' ) { priority = '1.0'; changefreq = 'daily' }
      else if (path === '/tco' || path === '/compare') { priority = '0.9'; changefreq = 'daily' }
      else if (path.startsWith('/car/')) { priority = '0.8'; changefreq = 'weekly' }
      else if (path === '/car' || path === '/browse' || path === '/guides') { priority = '0.7'; changefreq = 'weekly' }
      else if (path === '/methodology') { priority = '0.6'; changefreq = 'monthly' }
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
      reject(err)
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

  const vite = spawn('node', ['node_modules/vite/bin/vite.js', 'build'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  const exitCode = await new Promise((resolve) => {
    let resolved = false
    vite.on('close', (code) => {
      if (!resolved) { resolved = true; resolve(code) }
    })
    vite.on('error', (err) => {
      console.error('[build-ssg] Vite process error:', err.message)
      if (!resolved) { resolved = true; resolve(1) }
    })
    // Fallback: the vite-plugin-react-ssg SSG step can leave open handles
    // (watcher/server) that prevent the `close` event from firing. After 30s
    // with no close event, assume the build finished successfully and proceed
    // to post-processing — the dist/ artifacts are already on disk.
    setTimeout(() => {
      if (!resolved) {
        console.warn('[build-ssg] Vite process did not exit within 30s; proceeding with post-build steps')
        resolved = true
        resolve(0)
      }
    }, 30000)
  })

  if (backend) {
    backend.kill()
  }

  // Post-build SEO/CWV hardening (only if the build produced a dist/).
  if (existsSync(distDir)) {
    rewriteHtmlLang()
    writeRobots()
    postProcessSitemap()
    writeHeaders()
    console.log('[build-ssg] post-build SEO hardening complete')
  }

  process.exit(exitCode || 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
