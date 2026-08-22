import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import sitemap from 'vite-plugin-sitemap'
import reactSsg from 'vite-plugin-react-ssg'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GUIDE_SLUGS } from './src/lib/guides.js'

const SITE_URL = (process.env.VITE_SITE_URL || 'https://vidrive-web.pages.dev').replace(/\/$/, '')

const __dirname = dirname(fileURLToPath(import.meta.url))
const carIds: string[] = Object.keys(
  JSON.parse(readFileSync(resolve(__dirname, '../backend/data/cars.json'), 'utf-8')) as Record<string, unknown>,
)

const STATIC_ROUTES = [
  '/',
  '/tco',
  '/compare',
  '/wizard',
  '/car',
  '/methodology',
  '/terms',
  '/privacy',
  '/guides',
]

// Generate locale-prefixed variants of a base path: /vi/* and /en/*
// The root '/' is prerendered with the default-locale (vi) landing:
// ['/', '/vi', '/en'] so the sitemap covers the canonical root URL.
function withLocales(path: string): string[] {
  if (path === '/') return ['/', '/vi', '/en']
  return [`/vi${path}`, `/en${path}`]
}

const ssgDynamicRoutes = [
  ...STATIC_ROUTES.flatMap(withLocales),
  ...carIds.flatMap(id => withLocales(`/car/${id}`)),
  ...GUIDE_SLUGS.flatMap(slug => withLocales(`/guides/${slug}`)),
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    sitemap({
      hostname: SITE_URL,
      generateRobotsTxt: false,
       exclude: [
        '/google33bc7b02ae9f2fda',
        '/google33bc7b02ae9f2fda.html',
        '/history',
        '/en/history',
        '/vi/history',
        '/404',
        '/en/404',
        '/vi/404',
        '/wizard',
        '/en/wizard',
        '/vi/wizard',
        '/guides',
        '/en/guides',
        '/vi/guides',
        '/guides/*',
        '/en/guides/*',
        '/vi/guides/*',
      ],
      dynamicRoutes: ssgDynamicRoutes,
    }),
    reactSsg(),
  ],
  // Vite pre-bundles @unhead/react and @unhead/react/client as separate chunks,
  // each inlining its own createContext(null) from a shared internal module.
  // That splits the React context, so UnheadProvider never satisfies useHead/Head.
  // Exclude from pre-bundling so both entry points resolve the same raw ESM.
  optimizeDeps: {
    exclude: ['@unhead/react', '@unhead/react/client'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts'
            if (id.includes('framer-motion')) return 'motion'
            if (id.includes('@tanstack')) return 'query'
            if (id.includes('react-router') || id.includes('react-dom') || id.includes('react-') || id.includes('scheduler')) return 'react-vendor'
            return 'vendor'
          }
        },
      },
    },
  },
})
