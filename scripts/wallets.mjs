// Escanea las posiciones de las 5000 cuentas más grandes de Hyperliquid y las guarda para el mapa de
// liquidaciones. Lo corre GitHub Actions cada hora (escanear 5000 cuentas desde cada navegador tardaría
// unos 10 minutos por el límite de pedidos de Hyperliquid). Uso: node scripts/wallets.mjs [destino] [cuentas]
//
// Formato: { t, accounts, coins:[...], exp:[USD miles por coin], rows:[[coin, lado, liq, USD miles, cross, apalanc., entrada]] }
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'src/liq-wallets.json';
const N = +(process.argv[3] || 5000);
const HL = 'https://api.hyperliquid.xyz/info';
const LB = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sig = (v) => +v.toPrecision(6);   // 6 cifras alcanzan para el mapa y achican el archivo

// Hyperliquid permite 1200 de peso por minuto por IP; clearinghouseState pesa 2. Se usa hasta 1000.
const spent = [];
async function take(w) {
  for (;;) {
    const now = Date.now();
    while (spent.length && now - spent[0].t > 60000) spent.shift();
    if (spent.reduce((s, x) => s + x.w, 0) + w <= 1000) { spent.push({ t: now, w }); return; }
    await sleep(250);
  }
}
async function post(body, w) {
  for (let a = 0; a < 6; a++) {
    await take(w);
    try {
      const r = await fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 429) { await sleep(5000 * (a + 1)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { if (a === 5) throw e; await sleep(2000 * (a + 1)); }
  }
  return null;
}

const t0 = Date.now();
const lb = await (await fetch(LB)).json();
const users = lb.leaderboardRows.sort((a, b) => +b.accountValue - +a.accountValue).slice(0, N).map((r) => r.ethAddress);
console.log(`Ranking: ${lb.leaderboardRows.length} cuentas · se escanean ${users.length}`);

const coins = [], ci = new Map(), exp = [], rows = [];
const idx = (c) => { if (!ci.has(c)) { ci.set(c, coins.length); coins.push(c); exp.push(0); } return ci.get(c); };
let i = 0, done = 0, failed = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < users.length) {
    const user = users[i++];
    const r = await post({ type: 'clearinghouseState', user }, 2).catch(() => null);
    if (!r) failed++;
    for (const ap of (r && r.assetPositions) || []) {
      const p = ap.position, usd = +p.positionValue, k = idx(p.coin);
      exp[k] += usd / 1000;
      if (p.liquidationPx) rows.push([k, +p.szi > 0 ? 1 : -1, sig(+p.liquidationPx), Math.round(usd / 100) / 10, p.leverage.type === 'cross' ? 1 : 0, p.leverage.value, sig(+p.entryPx)]);
    }
    if (++done % 500 === 0) console.log(`${done}/${users.length} cuentas · ${rows.length} posiciones`);
  }
}));
if (done - failed < users.length * 0.8) { console.error(`Fallaron demasiadas cuentas (${failed}); no se escribe el archivo.`); process.exit(1); }

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ t: Date.now(), accounts: done - failed, coins, exp: exp.map((v) => Math.round(v)), rows }));
console.log(`Listo: ${out} · ${done - failed} cuentas · ${rows.length} posiciones · ${Math.round((Date.now() - t0) / 1000)} s`);
