import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: {
      '@versetle/shared': fileURLToPath(
        new URL('./packages/shared/src/index.ts', import.meta.url),
      ),
      '@versetle/game-core': fileURLToPath(
        new URL('./packages/game-core/src/index.ts', import.meta.url),
      ),
      '@versetle/lyrics-provider': fileURLToPath(
        new URL('./packages/lyrics-provider/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['packages/**/*.test.ts'] },
});
