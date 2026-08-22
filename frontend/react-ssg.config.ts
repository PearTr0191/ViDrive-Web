import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineReactSsgConfig } from 'vite-plugin-react-ssg'
import { routes } from './src/routes'
import { GUIDE_SLUGS } from './src/lib/guides'

const SITE_URL = (process.env.VITE_SITE_URL || 'https://vidrive-web.pages.dev').replace(/\/$/, '')

const __dirname = dirname(fileURLToPath(import.meta.url))
const carsDataPath = resolve(__dirname, '../backend/data/cars.json')
const carsData = JSON.parse(readFileSync(carsDataPath, 'utf-8'))
const carIds = Object.keys(carsData)

const basePaths = [
  '/',
  '/tco',
  '/compare',
  '/wizard',
  '/car',
  '/history',
  '/methodology',
  '/terms',
  '/privacy',
  '/guides',
  ...carIds.map(id => `/car/${id}`),
  ...GUIDE_SLUGS.map(slug => `/guides/${slug}`),
]

// Dual-locale SSG: generate /vi/* and /en/* for every route.
// The root '/' is prerendered with the default-locale (vi) landing so crawlers
// and AI engines see the full head + JSON-LD without a JS redirect.
const paths: string[] = basePaths.flatMap(p => {
  if (p === '/') return ['/', '/vi', '/en']
  return [`/vi${p}`, `/en${p}`]
})

export default defineReactSsgConfig({
  history: 'browser',
  routes,
  origin: SITE_URL,
  paths,
})
