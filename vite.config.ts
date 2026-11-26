import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// The only place the deployed path is set. Override with SITE_BASE=/other/ at build time.
const base = process.env.SITE_BASE ?? '/thornvael/';

export default defineConfig({
  base,
  build: {
    target: 'safari16',
    rolldownOptions: {
      input: { main: 'index.html', editor: 'editor.html', wiki: 'wiki.html' },
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'vendor-pixi',
              test: /node_modules[\\/](pixi\.js|@pixi)[\\/]/,
              maxSize: 900_000,
              priority: 20,
            },
            {
              name: 'vendor-preact',
              test: /node_modules[\\/]preact[\\/]/,
              priority: 20,
            },
            {
              name: 'ui-panels',
              test: /[\\/]src[\\/](townui|pausemenu|spellbookui|debugpanel|automap|gamepad|townicons|settings-panel|mobile-controls-help)\.ts$|[\\/]src[\\/]ui-extra[\\/]/,
              maxSize: 350_000,
              priority: 15,
            },
            {
              name: 'missions-act2',
              test: /[\\/]src[\\/]missions[\\/].*(m(1[2-9]|2[0-3])-|gullet-of-dunes|map2-redmarsh-wastes)/,
              priority: 10,
            },
            {
              name: 'missions-act3',
              test: /[\\/]src[\\/]missions[\\/].*(m(2[4-9]|3[0-5])-|drowned-choir|map3-iron-coast)/,
              priority: 10,
            },
            {
              name: 'missions-act4',
              test: /[\\/]src[\\/]missions[\\/].*(m(3[6-9]|4[0-6])-|cinder-throne|map4-obsidian-caldera)/,
              priority: 10,
            },
            {
              name: 'missions-act1',
              test: /[\\/]src[\\/]missions[\\/].*(m0[5-9]-|m1[01]-|blood-at-the-ford|thornwick-market|whispers-in-the-fen|nightfall-at-ravenwatch|the-sunken-sanctum|kids-paradise-opening|weeping-ossuary|map1-border-fords)/,
              priority: 10,
            },
            {
              name: 'missions-skirmish',
              test: /[\\/]src[\\/]missions[\\/]/,
              priority: 5,
            },
          ],
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
          '**/*.{js,css,html,svg}',
          'chapter1-manifest.json',
          'data/*.json',
          'terrain/*.{png,json}',
          'icons/*.png',
          'uiskin/*',
          'townart/portraits/npc-warden-hale.jpg',
          'townart/portraits/merc-*.jpg',
        ],
        globIgnores: [
          'editor.html',
          'wiki.html',
          'assets/editor*',
          'assets/wiki*',
          'assets/missions-act2*',
          'assets/missions-act3*',
          'assets/missions-act4*',
          'assets/missions-skirmish*',
          'sprites/**',
          'itemicons/**',
          'townart/*',
          'townart/portrait-*.png',
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
