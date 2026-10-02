// Scanner · cálculo puro (sin DOM): ubica cada mercado en el plano y le da un puntaje de reversión.
// Velas: { t, o, h, l, c, v } ya cerradas. `a` = AuroraMath.compute(velas), `hull` = AuroraMath.hull(cierres).
(function (root) {
  'use strict';
  const ok = Number.isFinite;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const T = () => root.AuroraMath._ta;

  // Estiramiento (eje X del modo Reversión): promedio del oscilador Aurora y de la distancia a la
  // EMA 50 medida en ATR (×25, para que 4 ATR sea un extremo). −100 = sobreventa, +100 = sobrecompra.
  // Giro (eje Y): cambio del oscilador en 3 velas (×2,5). Positivo = girando hacia arriba.
  function axes(k, a) {
    const { ema, rma } = T();
    const C = k.map((x) => x.c);
    const tr = k.map((x, i) => (i ? Math.max(x.h - x.l, Math.abs(x.h - k[i - 1].c), Math.abs(x.l - k[i - 1].c)) : x.h - x.l));
    const atr = rma(tr, 14), e50 = ema(C, 50);
    const stretch = C.map((c, i) => {
      const o = a.osc[i], z = atr[i] > 0 ? (c - e50[i]) / atr[i] : NaN;
      if (!ok(o) || !ok(z)) return NaN;
      return clamp((o + clamp(z * 25, -100, 100)) / 2, -100, 100);
    });
    const turn = a.osc.map((o, i) => (i >= 3 && ok(o) && ok(a.osc[i - 3]) ? clamp(2.5 * (o - a.osc[i - 3]), -100, 100) : NaN));
    return { stretch, turn };
  }

  // Rotación tipo RRG contra BTC: fuerza relativa respecto de su media de 20 velas (X) y su
  // velocidad en 5 velas (Y), en %. Arriba a la derecha lidera; abajo a la izquierda queda atrás.
  function rrg(k, btc) {
    const { sma, ema } = T();
    const bt = new Map(btc.map((x) => [x.t, x.c]));
    const rs = k.map((x) => { const b = bt.get(x.t); return b > 0 ? x.c / b : NaN; });
    const base = sma(rs, 20);
    const ratio = ema(rs.map((v, i) => (ok(v) && base[i] > 0 ? (100 * v) / base[i] : NaN)), 3);
    const x = ratio.map((v) => (ok(v) ? v - 100 : NaN));
    const y = ratio.map((v, i) => (i >= 5 && ok(v) && ratio[i - 5] > 0 ? (100 * v) / ratio[i - 5] - 100 : NaN));
    return { x, y };
  }

  // Puntaje de reversión por vela (0–100) y sus motivos. `extra`: { funding, flow }, con
  // flow = { arrows:[{i,side}], divs:[{i,side,kind}] } de Binance (null si no cotiza o no se pidió).
  function scores(k, a, hull, ax, extra = {}) {
    const { sma } = T();
    const n = k.length, V = k.map((x) => x.v), vAvg = sma(V, 20);
    const f = ok(extra.funding) ? extra.funding : 0;
    const flow = extra.flow || null;
    const within = (arr, i, back) => { for (let j = Math.max(0, i - back); j <= i; j++) if (arr[j]) return true; return false; };
    const flowAt = (list, side, i, back) => !!list && list.some((e) => e.side === side && e.i <= i && e.i >= i - back);
    const climax = (i, side) => {
      for (let j = Math.max(10, i - 2); j <= i; j++) {
        if (!(vAvg[j - 1] > 0 && V[j] > 2 * vAvg[j - 1])) continue;
        let ext = true;
        for (let q = j - 9; q < j && ext; q++) ext = side > 0 ? k[j].l <= k[q].l : k[j].h >= k[q].h;
        if (ext) return true;
      }
      return false;
    };
    const wick = (i, side) => {
      for (let j = Math.max(0, i - 1); j <= i; j++) {
        const x = k[j], r = x.h - x.l;
        if (r <= 0) continue;
        if (side > 0 && (Math.min(x.o, x.c) - x.l) / r >= 0.5 && x.c >= x.l + r / 2) return true;
        if (side < 0 && (x.h - Math.max(x.o, x.c)) / r >= 0.5 && x.c <= x.h - r / 2) return true;
      }
      return false;
    };
    function side(i, s) {
      const st = ax.stretch[i], tu = ax.turn[i];
      const ext = ok(st) ? clamp((-s * st - 30) / 20, 0, 1) * 25 : 0;
      let lowest = Infinity;
      for (let j = Math.max(0, i - 4); j <= i; j++) if (ok(a.osc[j])) lowest = Math.min(lowest, -s * a.osc[j]);
      const sig = within(s > 0 ? a.sigUp : a.sigDn, i, 2);
      const giro = sig ? 20 : ok(tu) && s * tu > 0 && -lowest <= -40 ? clamp((s * tu) / 40, 0, 1) * 20 : 0;
      const hullOk = i > 0 && ok(hull[i]) && ok(hull[i - 1]) && s * (hull[i] - hull[i - 1]) > 0;
      const parts = [
        { k: 'ext', label: s > 0 ? 'Sobreventa (estiramiento)' : 'Sobrecompra (estiramiento)', pts: ext, max: 25 },
        { k: 'giro', label: sig ? 'Giro de Aurora en zona extrema' : 'El oscilador gira', pts: giro, max: 20 },
        { k: 'div', label: 'Divergencia Aurora', pts: within(s > 0 ? a.bullDiv : a.bearDiv, i, 9) ? 15 : 0, max: 15 },
        { k: 'vol', label: s > 0 ? 'Clímax de volumen en el mínimo' : 'Clímax de volumen en el máximo', pts: climax(i, s) ? 10 : 0, max: 10 },
        { k: 'wick', label: s > 0 ? 'Mecha de rechazo abajo' : 'Mecha de rechazo arriba', pts: wick(i, s) ? 10 : 0, max: 10 },
        { k: 'fund', label: s > 0 ? 'Funding negativo' : 'Funding alto', pts: clamp((-s * f) / 0.00005, 0, 1) * 5, max: 5 },
        { k: 'hull', label: 'Hull Suite ya giró', pts: hullOk ? 5 : 0, max: 5 }
      ];
      if (flow) {
        parts.push({ k: 'cvd', label: s > 0 ? 'Divergencia CVD alcista (Binance)' : 'Divergencia CVD bajista (Binance)', pts: flowAt(flow.divs, s, i, 9) ? 10 : 0, max: 10 });
        parts.push({ k: 'arrow', label: s > 0 ? 'Flecha verde delta/OI (Binance)' : 'Flecha roja delta/OI (Binance)', pts: flowAt(flow.arrows, s, i, 4) ? 5 : 0, max: 5 });
      }
      return { score: Math.round(clamp(parts.reduce((t, p) => t + p.pts, 0), 0, 100)), parts };
    }
    const bull = new Array(n).fill(NaN), bear = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) if (ok(a.osc[i])) { bull[i] = side(i, 1).score; bear[i] = side(i, -1).score; }
    return { bull, bear, detail: (i) => ({ bull: side(i, 1), bear: side(i, -1) }) };
  }

  root.ScannerMath = { axes, rrg, scores, clamp };
})(typeof window !== 'undefined' ? window : globalThis);
