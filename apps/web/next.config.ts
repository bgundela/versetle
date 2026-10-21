import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: [
    '@versetle/shared',
    '@versetle/game-core',
    '@versetle/lyrics-provider',
  ],
};
export default config;
