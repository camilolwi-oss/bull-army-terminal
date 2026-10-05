// Liquidaciones · mapa de calor en el tiempo (cálculo puro, sin DOM), al estilo de Coinglass.
// Dos capas:
//  · Wallets: posiciones reales de las cuentas escaneadas. Cada una es una banda en su precio de
//    liquidación, desde la apertura estimada (la última vela que pasó por su precio de entrada) hasta hoy.
//  · Modelo: en cada vela con volumen sobre el promedio de 20 se asume que entró gente en su máximo y su
//    mínimo con cada apalancamiento (x3 … x125). Cada banda nace en esa vela y se apaga cuando el precio
//    la toca (esas posiciones se liquidaron).
(function (root) {
  'use strict';
  const LEVS = [3, 5, 10, 25, 50, 100, 125];
  const MMR = 0.004;   // margen de mantenimiento típico (0,4 %): con x125 la liquidación queda a 0,4 % de la entrada

  // Liquidación aproximada de una posición aislada: entrada · (1 ∓ 1/apalancamiento ± mantenimiento).
  const liqLong = (e, L) => e * (1 - 1 / L + MMR);
  const liqShort = (e, L) => e * (1 + 1 / L - MMR);

  /**
   * k: velas { t, o, h, l, c, v } (historia previa + ventana). o = { show, bins, wallets, model, levs, volMult }
   * Devuelve la grilla de la ventana (últimas `show` velas) × `bins` niveles de precio, una por capa y lado.
   */
  function build(k, o) {
    const show = Math.min(o.show || 300, k.length), off = k.length - show, cols = show, bins = o.bins || 160;
    let wl = Infinity, wh = -Infinity;
    for (let i = off; i < k.length; i++) { wl = Math.min(wl, k[i].l); wh = Math.max(wh, k[i].h); }
    // Rango: la ventana ±35 % de su recorrido, y como mínimo ±5 % del último precio (como Coinglass en 24 h).
    const span = (wh - wl) || wh * 0.02, last = k[k.length - 1].c;
    const lo = Math.max(0, Math.min(wl - span * 0.35, last * 0.95)), hi = Math.max(wh + span * 0.35, last * 1.05), step = (hi - lo) / bins;
    const row = (p) => Math.floor((p - lo) / step);
    const mk = () => new Float64Array(bins * (cols + 1));
    const D = { wl: mk(), ws: mk(), ml: mk(), ms: mk() };
    const add = (g, p, c0, c1, w) => {
      const r = row(p); if (r < 0 || r >= bins || c1 < 0 || c0 >= cols) return;
      c0 = Math.max(0, c0); c1 = Math.min(cols - 1, c1);
      g[r * (cols + 1) + c0] += w; g[r * (cols + 1) + c1 + 1] -= w;
    };
    let nModel = 0, nWallet = 0;

    // ── Modelo x3…x125 ──
    if (o.model) {
      const levs = (o.levs && o.levs.length ? o.levs : LEVS), mult = o.volMult || 1;
      let s20 = 0;
      for (let j = 0; j < k.length - 1; j++) {
        if (j >= 20) {
          const avg = s20 / 20, c = k[j];
          if (c.v > avg * mult && avg > 0) {
            const w = ((c.v - avg) * c.c) / (levs.length * 2);   // volumen en USD por encima del promedio, repartido entre apalancamientos y entradas
            for (const e of [c.h, c.l]) for (const L of levs) {
              for (const side of [1, -1]) {
                const p = side > 0 ? liqLong(e, L) : liqShort(e, L);
                if (!(p > 0)) continue;
                let end = k.length - 1;
                for (let m = j + 1; m < k.length; m++) if (side > 0 ? k[m].l <= p : k[m].h >= p) { end = m; break; }
                if (end < off) continue;   // se liquidó antes de la ventana
                add(side > 0 ? D.ml : D.ms, p, j + 1 - off, end - off, w);
                nModel++;
              }
            }
          }
        }
        s20 += k[j].v; if (j >= 20) s20 -= k[j - 20].v;
      }
    }
    // ── Wallets: desde la apertura estimada hasta hoy (siguen abiertas) ──
    if (o.wallets) {
      for (const p of o.wallets) {
        if (!(p.liq > 0)) continue;
        let start = 0;
        if (p.entry > 0) for (let m = k.length - 1; m >= off; m--) if (k[m].l <= p.entry && k[m].h >= p.entry) { start = m - off; break; }
        add(p.side > 0 ? D.wl : D.ws, p.liq, start, cols - 1, p.usd);
        nWallet++;
      }
    }
    // Sumas acumuladas por fila → valor por celda.
    const grid = {};
    for (const key in D) {
      const g = D[key], out = new Float32Array(bins * cols);
      for (let r = 0; r < bins; r++) { let s = 0; for (let c = 0; c < cols; c++) { s += g[r * (cols + 1) + c]; out[r * cols + c] = s > 1e-9 ? s : 0; } }
      grid[key] = out;
    }
    // Escala de color: percentil 99,5 de cada capa (un solo nivel enorme no apaga el resto del mapa).
    const q = (a, b) => { const v = []; for (let i = 0; i < a.length; i++) { const x = a[i] + b[i]; if (x > 0) v.push(x); } if (!v.length) return 0; v.sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(v.length * 0.995))]; };
    return {
      cols, bins, lo, hi, step, off, candles: k.slice(off), grid,
      maxW: q(grid.wl, grid.ws), maxM: q(grid.ml, grid.ms), nModel, nWallet
    };
  }

  // Intensidad 0–1 de una celda. Cada capa en su propia escala: las wallets en raíz (son pocas posiciones y
  // así se ven las chicas), el modelo lineal (solo brillan las zonas fuertes). Con las dos, manda la mayor.
  function cell(h, i, useW, useM) {
    let v = 0;
    if (useW && h.maxW) v = Math.max(v, Math.sqrt(Math.min(1, (h.grid.wl[i] + h.grid.ws[i]) / h.maxW)));
    if (useM && h.maxM) v = Math.max(v, Math.min(1, (h.grid.ml[i] + h.grid.ms[i]) / h.maxM));
    return v;
  }

  root.LiqHeat = { LEVS, MMR, liqLong, liqShort, build, cell };
})(typeof window !== 'undefined' ? window : globalThis);
