import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ViteSitemapPlugin({
      hostname: 'https://vidrive-web.pages.dev',
      routes: [
        '/', 
        '/tco',
        '/compare',
        '/browse',
        '/history',
        '/methodology',
        '/terms',
        '/privacy'
        // add all your routes here
      ]
    })
  ],
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
})
