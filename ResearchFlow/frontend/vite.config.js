import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', 
    watch: {
      usePolling: true, // Forces Vite to actively scan for file changes in Docker
    },
    proxy: {
      '/api': 'http://127.0.0.1:5000',
    },
  },
})