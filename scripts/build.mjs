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

// Scripts de la app → guardados sin ejecutar; el arranque los corre en orden recién después del login
html = html.replace(/<script type="text\/plain" data-app="([^"]+)"><\/script>/g, (_, rel) => `<script type="text/x-app">\n${read(rel)}</script>`);

// Acceso (login y Admin) + arranque, encerrados en UNA función anónima:
// - las expresiones regulares cambian los globales window.BACripto/BAGate/BAAdmin por variables locales,
//   así no quedan accesibles desde la consola del navegador;
// - se quitan los comentarios de línea completa, que explicaban cómo funciona el control.
// Es ocultamiento: sube la dificultad para saltear el login, no lo hace imposible.
const ACCESO = [...html.matchAll(/<script src="(js\/acceso\/[^"]+)"><\/script>\n?/g)].map((m) => m[1]);
const hide = (code) => code
  .replace(/window\.(BACripto|BAGate|BAAdmin)\b/g, '$1')
  .replace(/^\s*\/\/.*$\n?/gm, '');
const BOOT = `(() => {
'use strict';
let BACripto, BAGate, BAAdmin;
${ACCESO.map((rel) => hide(read(rel))).join('\n')}
(async () => {
  await BAGate.ready();
  for (const s of document.querySelectorAll('script[type="text/x-app"]')) {
    const n = document.createElement('script'); n.textContent = s.textContent; s.replaceWith(n);
  }
})();
})();`;
if (/window\.BA(Cripto|Gate|Admin)/.test(BOOT)) throw new Error('Quedó un global de acceso sin ocultar');
html = html.replace(/<script src="js\/acceso\/[^"]+"><\/script>\n?/g, '');
html = html.replace(/<!-- Acceso: login[^]*?-->\n/, '');
// Con una función (no un texto) para que los "$&" del código no se interpreten como patrones de reemplazo.
html = html.replace(/<script src="js\/loader\.js"><\/script>\n?/, () => `<script>\n${BOOT}\n</script>\n`);
html = html.replace(/<!-- Datos de respaldo[^]*?-->\n/, '').replace(/<!-- Scripts de la app[^]*?-->\n/, '');

const PENDING = /data-src=|data-app=|css\/styles\.css|js\/loader\.js|<script src="js\//g;
const left = count(PENDING);
if (left) throw new Error(`Quedaron ${left} referencias sin incrustar: ${html.match(new RegExp('.{0,50}(' + PENDING.source + ').{0,30}', 'g')).join(' | ')}`);

fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(outFile, html);

// Archivos que se sirven junto a la página
const extra = ['app.dat', 'manifest.webmanifest', 'sw.js', ...fs.readdirSync(path.join(src, 'icons')).map((f) => 'icons/' + f)];
// El calendario macro es opcional en el build: lo genera scripts/calendario.mjs (en el deploy, cada hora).
if (fs.existsSync(path.join(src, 'calendario.json'))) extra.push('calendario.json');
for (const rel of extra) {
  fs.mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
  fs.copyFileSync(path.join(src, rel), path.join(dist, rel));
}
console.log(`Listo: ${path.relative(root, outFile)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB) + ${extra.length} archivos`);
