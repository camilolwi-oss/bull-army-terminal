// Publica cada día en Discord la captura de la sección Contexto con un resumen de BTC y de las alts que
// más suben y bajan. Lo corre GitHub Actions (.github/workflows/discord-diario.yml) a las 8:30 de Argentina.
//
// Uso:  npm run build && node scripts/discord-diario.mjs          → publica (necesita DISCORD_WEBHOOK_URL)
//       node scripts/discord-diario.mjs --prueba                  → no publica: guarda la imagen y el texto
// Variables: DISCORD_WEBHOOK_URL (secreto), DISCORD_ROLE_ID (rol a mencionar), CHROME (ruta del navegador).
//
// El login de la terminal se resuelve con un acceso temporal que se crea solo dentro de esta máquina, sobre
// una copia de dist/: no se guarda ninguna contraseña real y la copia nunca se publica.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--prueba');
const OUT = path.join(ROOT, 'dist', 'discord');
const WEB = 'https://camilolwi-oss.github.io/bull-army-terminal/';
const HL = 'https://api.hyperliquid.xyz/info';
const MIN_VOL = 2e6;   // solo mercados con más de US$ 2 M operados en 24 h
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nf = (v, d = 2) => v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => (v > 0 ? '+' : '') + nf(v * 100, 1) + '%';
const usd = (v) => '$' + (v >= 1000 ? nf(v, 0) : v >= 1 ? nf(v, 2) : v.toLocaleString('es-AR', { maximumSignificantDigits: 4 }));

// ── 1. Datos de Hyperliquid: BTC y las que más suben y bajan (perps de crypto y HIP-3) ──
async function post(body) {
  for (let a = 0; a < 4; a++) {
    const r = await fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    await sleep(3000 * (a + 1));
  }
  throw new Error('Hyperliquid no respondió');
}
async function markets() {
  const list = [];
  const add = (meta, ctx, dex) => meta.universe.forEach((u, i) => {
    const c = ctx[i] || {}, px = +c.markPx, prev = +c.prevDayPx, vol = +c.dayNtlVlm;
    if (u.isDelisted || !(px > 0) || !(prev > 0)) return;
    const name = dex ? `${u.name.split(':')[1] || u.name} (${dex})` : u.name;
    list.push({ name, coin: u.name, px, chg: px / prev - 1, vol, hip3: !!dex });
  });
  const [meta, ctx] = await post({ type: 'metaAndAssetCtxs' });
  add(meta, ctx, '');
  const dexs = ((await post({ type: 'perpDexs' })) || []).filter(Boolean).map((d) => d.name);
  for (const d of dexs) { try { const [m, c] = await post({ type: 'metaAndAssetCtxs', dex: d }); add(m, c, d); } catch {} }
  return list;
}

// ── 2. Captura de Contexto con un navegador sin pantalla ──
function tempCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-discord-'));
  fs.cpSync(path.join(ROOT, 'dist'), dir, { recursive: true });
  return dir;
}
async function addTempUser(dir) {
  const sandbox = { window: {}, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/js/acceso/cripto.js'), 'utf8'), sandbox);
  const C = sandbox.BACripto, file = path.join(dir, 'app.dat');
  const acc = C.decode(fs.readFileSync(file, 'utf8')), user = 'bot-' + crypto.randomBytes(4).toString('hex'), pass = crypto.randomBytes(18).toString('base64url');
  const s = C.salt();
  acc.users.push({ id: await C.idOf(user), salt: s, check: await C.check(await C.proof(pass, s, acc.kdf.iter)), exp: new Date(Date.now() + 36e5).toISOString(), revoked: false });
  fs.writeFileSync(file, C.encode(acc));
  return { user, pass };
}
function serve(dir) {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.dat': 'text/plain', '.svg': 'image/svg+xml' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/bull-army-extremos.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
  return c.find((p) => fs.existsSync(p));
}
async function capture(url, cred) {
  const port = 9300 + Math.floor(Math.random() * 500), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ba-chrome-'));
  const br = spawn(chromePath(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let list; for (let i = 0; i < 60 && !list; i++) { await sleep(500); try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch {} }
    const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0; const pend = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const js = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1600, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url }); await sleep(3000);
    await js(`document.getElementById('gateUser').value = ${JSON.stringify(cred.user)}; document.getElementById('gatePass').value = ${JSON.stringify(cred.pass)}; document.getElementById('gateForm').requestSubmit(); 1`);
    // Contexto arranca solo; se espera a que tenga el veredicto y la amplitud cargados.
    let ok = false;
    for (let i = 0; i < 90 && !ok; i++) { await sleep(2000); ok = await js(`(() => { const a = document.getElementById('cxRegBig'), b = document.getElementById('cxBrPct'); return !!(a && a.textContent.trim() && b && /\\d/.test(b.textContent)); })()`); }
    if (!ok) throw new Error('Contexto no terminó de cargar');
    await sleep(6000);
    const text = (id) => `(document.getElementById('${id}') || {}).innerText || ''`;
    const ctx = await js(`({ reg: ${text('cxRegBig')}, regLead: ${text('cxRegLead')}, trade: ${text('cxTradeBig')}, now: ${text('cxNowV')}, alts: ${text('cxAltsBig')}, altsLead: ${text('cxAltsLead')}, br: ${text('cxBrPct')}, px: ${text('cxPx')}, live: (document.getElementById('modeTxt') || {}).innerText || '' })`);
    // Recorte: el encabezado y las tarjetas principales de Contexto (sin el menú lateral).
    const r = await js(`(() => { window.scrollTo(0, 0); const p = document.getElementById('panel-ctx').getBoundingClientRect(); return { x: p.left, y: p.top + scrollY, w: p.width, h: Math.min(p.height, 1500) }; })()`);
    await sleep(800);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 12), width: r.w + 32, height: r.h + 24, scale: 1 } });
    ws.close();
    return { png: Buffer.from(shot.result.data, 'base64'), ctx };
  } finally { br.kill(); }
}

// ── 3. Mensaje ──
function message(all, ctx) {
  const btc = all.find((m) => m.coin === 'BTC'), liquid = all.filter((m) => m.vol >= MIN_VOL && m.coin !== 'BTC');
  const up = liquid.slice().sort((a, b) => b.chg - a.chg).slice(0, 5), dn = liquid.slice().sort((a, b) => a.chg - b.chg).slice(0, 5);
  const crypto_ = all.filter((m) => !m.hip3 && m.vol >= MIN_VOL), green = crypto_.filter((m) => m.chg > 0).length;
  const day = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  const line = (m) => `**${m.name}** ${pct(m.chg)}`;
  const desc = [
    `**BTC** ${usd(btc.px)} · **${pct(btc.chg)}** en 24 h`,
    ctx.reg ? `**¿Long o short?** ${clean(ctx.reg)}${ctx.regLead ? ' — ' + clean(ctx.regLead) : ''}` : '',
    ctx.trade ? `**¿Operar o esperar?** ${clean(ctx.trade)}${ctx.now ? ' — ahora: ' + clean(ctx.now).toLowerCase() : ''}` : '',
    ctx.alts ? `**Alts contra BTC (14 d):** ${clean(ctx.alts)} le ganan a BTC${ctx.altsLead ? ' — ' + clean(ctx.altsLead) : ''}` : '',
    `**Amplitud:** ${green} de ${crypto_.length} perps líquidos en verde (${Math.round((green / Math.max(1, crypto_.length)) * 100)}%)`,
    '',
    `🟢 **Más suben (24 h)**\n${up.map(line).join(' · ')}`,
    `🔴 **Más bajan (24 h)**\n${dn.map(line).join(' · ')}`,
    '',
    `Mercados de Hyperliquid (crypto y HIP-3) con más de US$ 2 M de volumen. [Abrir la terminal](${WEB}#contexto) · Material educativo, no es consejo financiero.`
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0)).join('\n');
  const role = process.env.DISCORD_ROLE_ID;
  return {
    content: role ? `<@&${role}> Contexto del día 🐂` : 'Contexto del día 🐂',
    allowed_mentions: { parse: [], roles: role ? [role] : [] },
    embeds: [{ title: `📊 Bull Army · Contexto — ${day}`, url: `${WEB}#contexto`, color: 0xC9A227, description: desc, image: { url: 'attachment://contexto.png' }, footer: { text: 'Bull Army Terminal · datos en vivo de Hyperliquid' }, timestamp: new Date().toISOString() }]
  };
}
async function publish(payload, png) {
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (!hook) throw new Error('Falta DISCORD_WEBHOOK_URL');
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify(payload));
  fd.append('files[0]', new Blob([png], { type: 'image/png' }), 'contexto.png');
  for (let a = 0; a < 3; a++) {
    const r = await fetch(hook + (hook.includes('?') ? '&' : '?') + 'wait=true', { method: 'POST', body: fd });
    if (r.ok) return;
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await sleep(((j.retry_after || 5) + 1) * 1000); continue; }
    throw new Error(`Discord respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error('Discord no aceptó el mensaje');
}

const dir = tempCopy();
let srv;
try {
  const [all, cred] = await Promise.all([markets(), addTempUser(dir)]);
  srv = await serve(dir);
  const { png, ctx } = await capture(`http://127.0.0.1:${srv.address().port}/`, cred);
  const payload = message(all, ctx);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'contexto.png'), png);
  fs.writeFileSync(path.join(OUT, 'mensaje.json'), JSON.stringify(payload, null, 2));
  if (DRY) console.log('Prueba: no se publicó. Imagen y mensaje en', OUT);
  else { await publish(payload, png); console.log('Publicado en Discord.'); }
} finally {
  if (srv) srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
