import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the site is served under jonathan-orlowski.dev/pollution/ via the rename worker.
  base: './',
  build: {
    // three.js alone is ~750 kB minified. It is already split out and loaded after first paint.
    chunkSizeWarningLimit: 900,
  },
})
