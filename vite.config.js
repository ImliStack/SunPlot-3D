import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1400,
  },
  server: {
    // Same route as the production Worker (worker/index.js): PVGIS has no CORS.
    proxy: {
      '/api/pvgis': {
        target: 'https://re.jrc.ec.europa.eu',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/pvgis/, '/api/v5_3'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
})
