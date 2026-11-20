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
        // PVGIS's firewall rejects browser-looking requests: send a plain server-side request.
        configure: (proxy) => proxy.on('proxyReq', (req) => {
          for (const h of req.getHeaderNames()) if (!['host', 'accept', 'accept-encoding'].includes(h)) req.removeHeader(h)
          req.setHeader('user-agent', 'SunPlot-3D (https://github.com/ImliStack/SunPlot-3D)')
          req.setHeader('accept', 'application/json')
        }),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
})
