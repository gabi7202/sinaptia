import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Astro 5: las páginas son estáticas y solo las rutas con `prerender = false` corren en servidor.
// Astro 4: agrega output: 'hybrid'.
export default defineConfig({ adapter: vercel() });
