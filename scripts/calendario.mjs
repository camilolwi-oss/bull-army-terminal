// Descarga el calendario económico de la semana (ForexFactory, gratis y sin key) y lo guarda como JSON
// para servirlo junto a la terminal. El navegador no puede pedirlo directo (ForexFactory no permite CORS),
// así que lo baja GitHub Actions cada hora al publicar. Uso: node scripts/calendario.mjs [destino]
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'src/calendario.json';
const FEEDS = ['https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'https://nfs.faireconomy.media/ff_calendar_nextweek.json'];

const events = [];
for (const url of FEEDS) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'bull-army-terminal (calendario semanal)' } });
    if (!r.ok) { console.log(`${path.basename(url)}: HTTP ${r.status} (se omite)`); continue; }
    const list = await r.json();
    for (const e of list) if (e && e.title && e.date) events.push({ title: e.title, country: e.country, date: e.date, impact: e.impact, forecast: e.forecast || '', previous: e.previous || '' });
    console.log(`${path.basename(url)}: ${list.length} eventos`);
  } catch (e) { console.log(`${path.basename(url)}: ${e.message} (se omite)`); }
}
if (!events.length) { console.error('No se pudo descargar el calendario; no se escribe el archivo.'); process.exit(1); }

const seen = new Set(), unique = events.filter((e) => { const k = e.date + e.title + e.country; return !seen.has(k) && seen.add(k); });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: 'ForexFactory', updated: new Date().toISOString(), events: unique }));
console.log(`Listo: ${out} · ${unique.length} eventos`);
