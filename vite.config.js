import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Content-Security-Policy for the built site only (the dev server needs inline scripts).
// Tone.js fetches and loads its AudioWorklet from a blob: URL; inline style attributes come from React.
const csp = [
  "default-src 'self'",
  "script-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: https://isc.sans.edu",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

const cspPlugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
}

export default defineConfig({
  base: '/mapping-playground/',
  plugins: [react(), tailwindcss(), cspPlugin],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
