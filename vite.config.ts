import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: 'favicon-ico-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0] ?? ''
          if (url === '/favicon.ico') {
            res.statusCode = 302
            res.setHeader('Location', '/favicon.svg')
            res.end()
            return
          }
          next()
        })
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0] ?? ''
          if (url === '/favicon.ico') {
            res.statusCode = 302
            res.setHeader('Location', '/favicon.svg')
            res.end()
            return
          }
          next()
        })
      },
    },
  ],
  base: command === 'serve' ? '/' : './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5176,
    strictPort: true,
  }
}))
