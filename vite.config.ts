import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// La app vive en https://app.espaciosm.art, por eso la base es "/".
// Si algún día se publica en https://usuario.github.io/repositorio/, define
// VITE_BASE=/repositorio/ al compilar (ver docs/INSTALACION.md).
const base = process.env.VITE_BASE ?? '/'

/**
 * GitHub Pages no permite cabeceras HTTP, así que la CSP se inyecta como meta
 * solo en la compilación de producción. En desarrollo se omite para no bloquear
 * el script en línea que inyecta React Refresh.
 */
function politicaDeSeguridad(): Plugin {
  return {
    name: 'csp-produccion',
    apply: 'build',
    transformIndexHtml(html) {
      const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
        "font-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self' blob:",
        "form-action 'self'",
      ].join('; ')

      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      )
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    react(),
    politicaDeSeguridad(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png', 'logo-espaciosm.png', 'marca-espaciosm.png'],
      manifest: {
        name: 'espacioSM Obra',
        short_name: 'Obra',
        description: 'Control de avance de obra de espacioSM: personal, asistencia, materiales y estimaciones.',
        lang: 'es-MX',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0b0b0a',
        theme_color: '#070707',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // Solo se precargan los archivos de la interfaz. Las consultas a
        // Supabase viajan siempre a la red: nunca se cachean datos de obra.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
})
