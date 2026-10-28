/**
 * revisar-env.mjs — Lista variables presentes, obsoletas y recomendadas.
 *
 * Uso local:
 *   vercel env pull .env.local
 *   npm run env:check
 *
 * No imprime valores: solo nombres. Sirve para saber qué borrar en Vercel.
 * El mismo diagnóstico está en GET /api/ia cuando el sitio está desplegado.
 */
import fs from 'node:fs';
import path from 'node:path';

const OBSOLETAS = [
  'XAI_API_KEY', 'GROK_API_KEY', 'GROK_MODEL', 'XAI_MODEL', 'XAI_BASE_URL',
  'GROK_EFFORT', 'CHAT_MODEL', 'EXTRACT_MODEL', 'OPENAI_KEY', 'OPENAI_MODEL',
  'OPENAI_EXTRACT_MODEL', 'GROK_EXTRACT_MODEL', 'XAI_EXTRACT_MODEL',
];
const RECOMENDADAS = [
  'GROQ_API_KEY', 'GROQ_MODEL', 'LEAD_EMAIL', 'GOOGLE_SCRIPT_URL',
  'GOOGLE_SCRIPT_TOKEN', 'CRON_SECRET', 'PANEL_SECRET',
];

function leerEnvLocal() {
  const out = {};
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return out;
  for (const linea of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || linea.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...leerEnvLocal(), ...process.env };
const presentes = Object.keys(env).filter((k) => env[k] !== undefined && env[k] !== '');
const obsoletas = OBSOLETAS.filter((k) => presentes.includes(k));
const recomendadas = RECOMENDADAS.filter((k) => presentes.includes(k));
const faltan = RECOMENDADAS.filter((k) => !presentes.includes(k) && ['GROQ_API_KEY', 'LEAD_EMAIL'].includes(k));

console.log('\nSINAPTIA · revisión de variables de entorno\n');
console.log('Presentes relevantes:', recomendadas.length ? recomendadas.join(', ') : '(ninguna)');
console.log('Obsoletas detectadas:', obsoletas.length ? obsoletas.join(', ') : '(ninguna)');
console.log('Faltan recomendadas:', faltan.length ? faltan.join(', ') : '(ninguna)');

if (obsoletas.length) {
  console.log('\nPara borrarlas en Vercel (producción y preview):');
  for (const k of obsoletas) console.log(`  vercel env rm ${k} production`);
  console.log('\nSi quieres conservar xAI/OpenAI como respaldo, ignora este aviso.');
}
console.log('\nDiagnóstico desplegado: curl https://tu-dominio.com/api/ia\n');
