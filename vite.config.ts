import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// The only place the deployed path is set. Override with SITE_BASE=/other/ at build time.
const base = process.env.SITE_BASE ?? '/thornvael/';

export default defineConfig({
  base,
  build: { target: 'safari16', rollupOptions: { input: { main: 'index.html', editor: 'editor.html' } } },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,json}'], globIgnores: ['chapter1-manifest.json'] },
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
    }),
  ],
  test: { include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] },
});
