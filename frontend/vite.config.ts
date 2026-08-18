import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import sitemap from 'vite-plugin-sitemap'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    sitemap({
      hostname: 'https://vidrive-web.pages.dev',
      // Generate sitemap.xml, but NOT robots.txt — we ship a hand-written
      // public/robots.txt with route-specific disallows (/history, /*?*).
      // Leaving the plugin's default (generateRobotsTxt: true) overwrites that
      // file with a minimal "User-agent: *\nAllow: /" at build time.
      generateRobotsTxt: false,
      exclude: ['/google33bc7b02ae9f2fda', '/google33bc7b02ae9f2fda.html'],
      dynamicRoutes: [
        '/tco',
        '/compare',
        '/car',
        '/history',
        '/methodology',
        '/terms',
        '/privacy',
        '/wizard',
        // Individual car detail pages — one sitemap entry per catalogue entry
        ...[
          'accent_2026','almera_2026','avanza_2026','camry_2026','carnival_2026',
          'city_2026','civic_2026','corolla_cross_2026','creta_2026','crv_2026',
          'cx30_2026','cx5_2026','cx8_2026','elantra_2026','ertiga_2026','everest_2026',
          'forester_2026','fortuner_2026','hilux_2026','i10_2026','innova_2026',
          'jazz_2026','k3_2026','kona_2026','mpv7_2026','mazda2_2026','mazda3_2026',
          'morning_2026','navara_2026','outlander_2026','pajero_sport_2026',
          'ranger_2026','santafe_2026','seltos_2026','sportage_2026','triton_2026',
          'tucson_2026','veloz_2026','vf3_2026','vf5_2026','vfe34_2026','vf7_2026',
          'vf8_2026','vf9_2026','vios_2026','xtrail_2026','xl7_2026','xpander_2026',
          'yaris_cross_2026','xforce_2026','territory_2026','carens_2026','brv_2026',
          'vf6_2026','atto3_2026','seal_2026','mg5_2026','mgzs_2026','mghs_2026',
          'omodac5_2026','jaecoo7_2026','havalh6_2026','ex2_2026','ex5_2026',
          'altis_2026','raize_2026','sonet_2026','custin_2026','stargazer_2026',
          'raptor_2026','glc_2026','cclass_2026','eclass_2026','bmw3_2026','bmw5_2026',
          'x3_2026','x5_2026','a4_2026','a6_2026','q3_2026','q5_2026','palisade_2026',
          'wuling_mini_2026',
        ].map(id => `/car/${id}`),
      ],
    })
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
