import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// The only place the deployed path is set. Override with SITE_BASE=/other/ at build time.
const base = process.env.SITE_BASE ?? '/thornvael/';

export default defineConfig({
  base,
  build: { target: 'safari16' },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Thornvael',
        short_name: 'Thornvael',
        description: 'A dark-fantasy real-time squad RPG for the browser.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#14100c',
        theme_color: '#14100c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg,json}'] },
    }),
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
