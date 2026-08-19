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
        '/404',
        '/wizard',
        '/guides/*',
      ],
      dynamicRoutes: [
        ...STATIC_ROUTES,
        ...carIds.map(id => `/car/${id}`),
        ...GUIDE_SLUGS.map(slug => `/guides/${slug}`),
      ],
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
