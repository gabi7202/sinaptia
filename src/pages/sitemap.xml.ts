/**
 * sitemap.xml.ts — Sitemap generado con la URL REAL del sitio en cada build.
 *
 * Antes era un archivo estático en public/ con una URL de ejemplo hardcodeada,
 * así que al cambiar de proyecto o de dominio en Vercel el sitemap seguía
 * apuntando a la URL vieja (Google indexaba direcciones que ya no existen).
 *
 * Origen: ASTRO_SITE > SITE_URL (Vercel lo inyecta) > urlPublica de config.js.
 * Si no hay ninguno, usa la URL de la petición (funciona en `astro dev`).
 */
import type { APIRoute } from 'astro';


const RUTAS: Array<{ loc: string; changefreq?: string; priority?: string }> = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/voz/', priority: '0.9' },
  { loc: '/sobre-mi/', changefreq: 'monthly', priority: '0.8' },
  { loc: '/auditoria.html', priority: '0.7' },
  { loc: '/privacidad/', priority: '0.3' },
  { loc: '/terminos/', priority: '0.3' },
  { loc: '/politica-ia/', priority: '0.4' },
];

export const GET: APIRoute = ({ site, url }) => {
  // `site` es URL (viene de astro.config: ASTRO_SITE / SITE_URL); si no hay,
  // se usa la URL de la petición. Se normaliza a string por seguridad.
  const base = site ? String(site) : (url && url.origin ? url.origin : '');
  const origen = base.replace(/\/$/, '');
  const hoy = new Date().toISOString().slice(0, 10);
  const urls = RUTAS.map((r) => {
    const extras = `${r.changefreq ? `<changefreq>${r.changefreq}</changefreq>` : ''}${r.priority ? `<priority>${r.priority}</priority>` : ''}`;
    return `  <url><loc>${origen}${r.loc}</loc><lastmod>${hoy}</lastmod>${extras}</url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
