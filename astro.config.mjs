// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/static';

// Para GitHub Pages en un repo de proyecto: ASTRO_BASE=/nombre-del-repo/ npm run build
// En local y en dominio propio: deja ASTRO_BASE sin definir (base '/').
export default defineConfig({
  base: process.env.ASTRO_BASE || '/',
  site: process.env.ASTRO_SITE || undefined,
  build: { inlineStylesheets: 'always' },
  vite: { build: { assetsInlineLimit: 4096 } },
  adapter: vercel({
    webAnalytics: { enabled: true },
  }),
});
