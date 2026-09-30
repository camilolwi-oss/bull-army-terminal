// Genera dist/: la página (bull-army-extremos.html) con CSS, JS, datos y Pine Script incrustados,
// más los archivos que se sirven al lado: la lista de accesos, el manifest y el service worker de la PWA y los íconos.
// Uso: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const outFile = path.join(dist, 'bull-army-extremos.html');

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

// Scripts de acceso (login y Admin) → <script> inline: corren apenas carga la página
html = html.replace(/<script src="(js\/acceso\/[^"]+)"><\/script>/g, (_, rel) => `<script>\n${read(rel)}</script>`);

// Scripts de la app → guardados sin ejecutar; el arranque los corre en orden recién después del login
html = html.replace(/<script type="text\/plain" data-app="([^"]+)"><\/script>/g, (_, rel) => `<script type="text/x-app">\n${read(rel)}</script>`);

// En lugar del cargador de desarrollo: esperar el login (BAGate.ready) y ejecutar la app
const BOOT = `(async () => {
  await window.BAGate.ready();
  for (const s of document.querySelectorAll('script[type="text/x-app"]')) {
    const n = document.createElement('script'); n.textContent = s.textContent; s.replaceWith(n);
  }
})();`;
html = html.replace(/<script src="js\/loader\.js"><\/script>\n?/, `<script>\n${BOOT}\n</script>\n`);
html = html.replace(/<!-- Datos de respaldo[^]*?-->\n/, '').replace(/<!-- Scripts de la app[^]*?-->\n/, '');

const left = count(/data-src=|data-app=|css\/styles\.css|js\/loader\.js|<script src="js\//g);
if (left) throw new Error(`Quedaron ${left} referencias sin incrustar`);

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(outFile, html);

// Archivos que se sirven junto a la página
const extra = ['access.json', 'manifest.webmanifest', 'sw.js', ...fs.readdirSync(path.join(src, 'icons')).map((f) => 'icons/' + f)];
for (const rel of extra) {
  fs.mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
  fs.copyFileSync(path.join(src, rel), path.join(dist, rel));
}
console.log(`Listo: ${path.relative(root, outFile)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB) + ${extra.length} archivos`);
