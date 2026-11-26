import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/playthrough/*.play.ts'], setupFiles: ['tests/setup.ts'], testTimeout: 3_600_000 } });
