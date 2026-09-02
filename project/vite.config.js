import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 3001,
    allowedHosts: true,
    watch: {
      usePolling: true,
    },
    hmr: {
      path: 'ws',
      clientPort: 3001,
    },
  },
})
