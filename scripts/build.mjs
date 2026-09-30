// Genera dist/bull-army-extremos.html: un único archivo con CSS, JS, datos y Pine Script incrustados.
// Sirve para abrirlo con doble clic, compartirlo o publicarlo como artifact. Uso: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const outFile = path.join(root, 'dist', 'bull-army-extremos.html');

const read = (rel) => {
  const text = fs.readFileSync(path.join(src, rel), 'utf8');
  if (/<\/script/i.test(text)) throw new Error(`${rel} contiene "</script" y rompería el HTML incrustado`);
  return text;
};

let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const count = (re) => (html.match(re) || []).length;

// Hoja de estilos local → <style>
html = html.replace(/<link rel="stylesheet" href="(css\/[^"]+)">/g, (_, rel) => `<style>\n${read(rel)}</style>`);

// Datos y Pine Script → contenido del mismo <script>, sin data-src
html = html.replace(/<script ([^>]*?) data-src="([^"]+)"><\/script>/g, (_, attrs, rel) => `<script ${attrs}>${read(rel)}</script>`);

// Scripts de la app → <script> inline, en el mismo orden
html = html.replace(/<script type="text\/plain" data-app="([^"]+)"><\/script>/g, (_, rel) => `<script>\n${read(rel)}</script>`);

// El cargador ya no hace falta
html = html.replace(/<script src="js\/loader\.js"><\/script>\n?/, '');
html = html.replace(/<!-- Datos de respaldo[^]*?-->\n/, '').replace(/<!-- Scripts de la app[^]*?-->\n/, '');

const left = count(/data-src=|data-app=|css\/styles\.css|js\/loader\.js/g);
if (left) throw new Error(`Quedaron ${left} referencias sin incrustar`);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`Listo: ${path.relative(root, outFile)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
