import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// The only place the deployed path is set. Override with SITE_BASE=/other/ at build time.
const base = process.env.SITE_BASE ?? '/thornvael/';

export default defineConfig({
  base,
  build: {
    target: 'safari16',
    rollupOptions: {
      input: { main: 'index.html', editor: 'editor.html', wiki: 'wiki.html' },
      output: {
        manualChunks(id) {
          if (!id.includes('/src/missions/') && !id.includes('\\src\\missions\\')) return undefined;
          if (/m(1[2-9]|2[0-3])-|gullet-of-dunes|map2-redmarsh-wastes/.test(id)) return 'missions-act2';
          if (/m(2[4-9]|3[0-5])-|drowned-choir|map3-iron-coast/.test(id)) return 'missions-act3';
          if (/m(3[6-9]|4[0-6])-|cinder-throne|map4-obsidian-caldera/.test(id)) return 'missions-act4';
          if (
            /m0[5-9]-|m1[01]-|blood-at-the-ford|thornwick-market|whispers-in-the-fen|nightfall-at-ravenwatch|the-sunken-sanctum|kids-paradise-opening|weeping-ossuary|map1-border-fords/.test(
              id,
            )
          )
            return 'missions-act1';
          return 'missions-skirmish';
        },
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: [
          '**/*.{js,css,html,png,svg,json}',
          'townart/portraits/npc-warden-hale.jpg',
          'townart/portraits/merc-*.jpg',
        ],
        globIgnores: [
          'chapter1-manifest.json',
          'sprites/**',
          'townart/*',
          'townart/portrait-necromancer.png',
          'townart/doll/**',
          'townart/mon/**',
          'townart/portraits/npc-!(warden-hale).jpg',
          'wiki/**',
        ],
      },
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
