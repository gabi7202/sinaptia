// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/static';

// Para GitHub Pages en un repo de proyecto: ASTRO_BASE=/nombre-del-repo/ npm run build
// En local y en dominio propio: deja ASTRO_BASE sin definir (base '/').
//
// site: si defines ASTRO_SITE se usa esa; si no, Vercel inyecta SITE_URL con la
// URL real del proyecto en cada build (https://<proyecto>.vercel.app o tu
// dominio cuando lo conectes). Así canonical, og:url y el QR salen apuntando a
// la URL donde el sitio vive de verdad, sin editar nada al cambiar de URL.
const site = process.env.ASTRO_SITE || process.env.SITE_URL || undefined;
export default defineConfig({
  base: process.env.ASTRO_BASE || '/',
  site,
  build: { inlineStylesheets: 'always' },
  vite: { build: { assetsInlineLimit: 4096 } },
  adapter: vercel({
    webAnalytics: { enabled: true },
  }),
});
