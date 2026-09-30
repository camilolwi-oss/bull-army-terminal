// Liquidaciones · cálculo puro del mapa (sin DOM).
// Posición: { side: 1 long | -1 short, liq: precio de liquidación, usd: nocional USD, cross: bool, lev: número }
(function (root) {
  'use strict';

  // Fórmula oficial de Hyperliquid (docs · Trading › Liquidations):
  //   liq = price − side · margin_available / |size| / (1 − l · side),   l = 1 / MAINTENANCE_LEVERAGE
  //   margin_available = account_value − maint_margin (cross)  ó  isolated_margin − maint_margin (isolated)
  function liqPrice({ price, side, size, marginAvailable, maintLeverage }) {
    const l = 1 / maintLeverage;
    return price - side * marginAvailable / Math.abs(size) / (1 - l * side);
  }

  function gaussian(sigma) {
    if (!(sigma > 0)) return [1];
    const r = Math.ceil(sigma * 3), k = [];
    let s = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); s += v; }
    return k.map((v) => v / s);
  }
  // Reparte cada nivel entre sus vecinos. En los bordes renormaliza para no perder USD.
  function convolve(a, k) {
    if (k.length === 1) return a.slice();
    const r = (k.length - 1) / 2, n = a.length, out = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const v = a[i]; if (!v) continue;
      let wsum = 0;
      for (let j = -r; j <= r; j++) if (i + j >= 0 && i + j < n) wsum += k[j + r];
      for (let j = -r; j <= r; j++) { const x = i + j; if (x >= 0 && x < n) out[x] += (v * k[j + r]) / wsum; }
    }
    return out;
  }

  /**
   * o = { mark, rangePct, bins, smooth (sigma en bins), minUsd, side: 'both'|'long'|'short',
   *       margin: 'all'|'cross'|'isolated', minLev, maxDist? }
   * Devuelve bins de precio con USD a liquidar por lado, acumulados desde el precio actual y clusters.
   */
  function buildMap(positions, o) {
    const n = Math.max(10, o.bins | 0), lo = o.mark * (1 - o.rangePct / 100), hi = o.mark * (1 + o.rangePct / 100);
    const w = (hi - lo) / n;
    const long = new Array(n).fill(0), short = new Array(n).fill(0), cnt = new Array(n).fill(0);
    let used = 0, usedUsd = 0, outside = 0;
    for (const p of positions) {
      if (!(p.liq > 0) || p.usd < (o.minUsd || 0)) continue;
      if (o.side === 'long' && p.side !== 1) continue;
      if (o.side === 'short' && p.side !== -1) continue;
      if (o.margin === 'cross' && !p.cross) continue;
      if (o.margin === 'isolated' && p.cross) continue;
      if (o.minLev && p.lev < o.minLev) continue;
      // Un long ya liquidable tendría liq ≥ precio: se descarta (dato viejo o en proceso).
      if ((p.side === 1 && p.liq >= o.mark) || (p.side === -1 && p.liq <= o.mark)) continue;
      const i = Math.floor((p.liq - lo) / w);
      if (i < 0 || i >= n) { outside++; continue; }
      (p.side === 1 ? long : short)[i] += p.usd;
      cnt[i]++; used++; usedUsd += p.usd;
    }
    const k = gaussian(o.smooth);
    const L = convolve(long, k), S = convolve(short, k);
    const center = (i) => lo + (i + 0.5) * w;
    const mi = Math.min(n - 1, Math.max(0, Math.floor((o.mark - lo) / w)));
    // Acumulado: cuánto se liquidaría si el precio llega hasta ese nivel desde el precio actual.
    const cumLong = new Array(n).fill(0), cumShort = new Array(n).fill(0);
    for (let i = mi, s = 0; i >= 0; i--) { s += long[i]; cumLong[i] = s; }
    for (let i = mi, s = 0; i < n; i++) { s += short[i]; cumShort[i] = s; }
    // Clusters: máximos locales del mapa suavizado, ordenados por tamaño.
    const peaks = (arr, side) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const v = arr[i]; if (v <= 0) continue;
        if ((i > 0 && arr[i - 1] > v) || (i < n - 1 && arr[i + 1] >= v)) continue;
        const px = center(i);
        out.push({ side, price: px, usd: v, dist: (px / o.mark - 1) * 100 });
      }
      return out.sort((a, b) => b.usd - a.usd).slice(0, 5);
    };
    return {
      lo, hi, w, n, mark: o.mark, centers: Array.from({ length: n }, (_, i) => center(i)),
      long: L, short: S, rawLong: long, rawShort: short, count: cnt, cumLong, cumShort,
      clusters: { long: peaks(L, 1), short: peaks(S, -1) },
      totals: { long: long.reduce((a, b) => a + b, 0), short: short.reduce((a, b) => a + b, 0), used, usedUsd, outside }
    };
  }

  root.LiqMath = { liqPrice, gaussian, convolve, buildMap };
})(typeof window !== 'undefined' ? window : globalThis);
