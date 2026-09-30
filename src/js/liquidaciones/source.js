// Liquidaciones · fuente de datos intercambiable.
// Fuente "scan": gratis, desde el navegador. Ranking público de cuentas → clearinghouseState de las N más grandes.
// Fuente "server" (futura): un servidor propio que consulte Hydromancer perpSnapshot (100 % de las posiciones) y
// devuelva el mismo formato. La API key de Hydromancer nunca va en el HTML.
window.createLiqSource = function createLiqSource(env) {
  'use strict';
  const LB_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
  const KEY_ADDR = 'baLiqAddr', KEY_POS = 'baLiqPos';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  // Filas compactas: [coin, side, liq, usd, cross, lev, addrIdx]
  let state = store.get(KEY_POS) || { t: 0, scanned: 0, rows: [], exposure: {} };
  let running = null;

  async function addresses(n, onStatus) {
    const c = store.get(KEY_ADDR);
    if (c && Date.now() - c.t < 864e5 && c.list.length >= n) return c.list.slice(0, n);
    onStatus('Descargando el ranking público de cuentas (≈ 38 MB, se guarda por 24 h)…');
    const j = await (await fetch(LB_URL)).json();
    const list = j.leaderboardRows.sort((a, b) => +b.accountValue - +a.accountValue).slice(0, 5000).map((r) => r.ethAddress);
    store.set(KEY_ADDR, { t: Date.now(), list });
    return list.slice(0, n);
  }


  async function scan(n, onProgress, onStatus) {
    if (running) return running;
    running = (async () => {
      const list = await addresses(n, onStatus);
      const rows = [], exposure = {};
      let i = 0, done = 0, lastEmit = 0;
      const emit = (final) => {
        state = { t: Date.now(), scanned: done, rows: rows.slice(), exposure: { ...exposure }, partial: !final };
        onProgress(state, done, list.length);
      };
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (i < list.length) {
          const idx = i++, user = list[idx];
          let r = null;
          for (let attempt = 0; attempt < 3 && !r; attempt++) {
            r = await env.hlPost({ type:'clearinghouseState', user }).catch(() => null);
            if (!r) await new Promise((z) => setTimeout(z, 1500 * (attempt + 1)));
          }
          done++;
          for (const ap of (r && r.assetPositions) || []) {
            const p = ap.position, usd = +p.positionValue;
            exposure[p.coin] = (exposure[p.coin] || 0) + usd;
            if (p.liquidationPx) rows.push([p.coin, +p.szi > 0 ? 1 : -1, +p.liquidationPx, usd, p.leverage.type === 'cross' ? 1 : 0, p.leverage.value, idx]);
          }
          if (done - lastEmit >= 100) { lastEmit = done; emit(false); }
        }
      }));
      emit(true);
      store.set(KEY_POS, state);
      running = null;
      return state;
    })();
    running.catch(() => { running = null; });
    return running;
  }

  function positions(coin) {
    return state.rows.filter((r) => r[0] === coin).map((r) => ({ side: r[1], liq: r[2], usd: r[3], cross: !!r[4], lev: r[5], acct: r[6] }));
  }

  return {
    kind: 'scan',
    get state() { return state; },
    scan, positions,
    useSnapshot(snap) {
      const rows = snap.rows.map((r) => [snap.coins[r[0]], r[1], r[2], r[3] * 1000, r[4], r[5], -1]);
      const exposure = {};
      snap.coins.forEach((c, i) => (exposure[c] = snap.exp[i] * 1000));
      state = { t: snap.t, scanned: snap.accounts, rows, exposure, snapshot: true };
    }
  };
};
