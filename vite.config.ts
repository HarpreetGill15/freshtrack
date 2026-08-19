import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg'],
    workbox: {
      // pdfjs-dist is lazy-loaded only when someone imports a PDF (see product-import-page.tsx),
      // so it's excluded from the precache list entirely rather than forcing every visitor to
      // download it upfront. maximumFileSizeToCacheInBytes is raised as a safety margin on top of
      // that for the remaining (still sizeable — firebase + xlsx + zxing) main chunk.
      globIgnores: ['**/pdf-import-*.js', '**/pdf.worker-*.js'],
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    },
    manifest: { name: 'FreshTrack', short_name: 'FreshTrack', description: 'Grocery expiry management', theme_color: '#0d6b4f', background_color: '#f7faf8', display: 'standalone', start_url: '/', icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] },
  })],
  server: { host: true }
})
