// Aurora · cálculo puro (sin DOM), réplica de src/pine/aurora.pine para el Grid.
// Velas: { o, h, l, c, v }. Las series usan NaN donde Pine tiene na.
(function (root) {
  'use strict';
  const ok = Number.isFinite;

  // ── Funciones de Pine (ta.*) ─────────────────────────────────────────
  function sma(x, n) {
    const out = new Array(x.length).fill(NaN);
    let s = 0, bad = 0;
    for (let i = 0; i < x.length; i++) {
      if (ok(x[i])) s += x[i]; else bad++;
      if (i >= n) { if (ok(x[i - n])) s -= x[i - n]; else bad--; }
      if (i >= n - 1 && !bad) out[i] = s / n;
    }
    return out;
  }
  // ta.ema y ta.rma: se siembran con la SMA y siguen de forma recursiva.
  function smooth(x, n, alpha) {
    const out = new Array(x.length).fill(NaN), seed = sma(x, n);
    for (let i = 0; i < x.length; i++) {
      const p = i ? out[i - 1] : NaN;
      out[i] = ok(p) ? alpha * x[i] + (1 - alpha) * p : seed[i];
    }
    return out;
  }
  const ema = (x, n) => smooth(x, n, 2 / (n + 1));
  const rma = (x, n) => smooth(x, n, 1 / n);
  const wma = (x, n) => {
    const out = new Array(x.length).fill(NaN), den = n * (n + 1) / 2;
    for (let i = n - 1; i < x.length; i++) {
      let s = 0, good = true;
      for (let k = 0; k < n; k++) { const v = x[i - k]; if (!ok(v)) { good = false; break; } s += v * (n - k); }
      if (good) out[i] = s / den;
    }
    return out;
  };
  const change = (x) => x.map((v, i) => (i ? v - x[i - 1] : NaN));
  const sum = (x, n) => sma(x, n).map((v) => v * n);
  function extreme(x, n, hi) {
    const out = new Array(x.length).fill(NaN);
    for (let i = n - 1; i < x.length; i++) {
      let m = x[i];
      for (let k = 1; k < n; k++) m = hi ? Math.max(m, x[i - k]) : Math.min(m, x[i - k]);
      out[i] = m;
    }
    return out;
  }
  const highest = (x, n) => extreme(x, n, true);
  const lowest = (x, n) => extreme(x, n, false);
  function rsi(x, n) {
    const ch = change(x), up = rma(ch.map((d) => (ok(d) ? Math.max(d, 0) : NaN)), n), dn = rma(ch.map((d) => (ok(d) ? Math.max(-d, 0) : NaN)), n);
    return up.map((u, i) => { const d = dn[i]; if (!ok(u) || !ok(d)) return NaN; return d === 0 ? 100 : u === 0 ? 0 : 100 - 100 / (1 + u / d); });
  }
  function stoch(src, h, l, n) {
    const hh = highest(h, n), ll = lowest(l, n);
    return src.map((v, i) => (hh[i] - ll[i] ? 100 * (v - ll[i]) / (hh[i] - ll[i]) : NaN));
  }
  function mfi(src, vol, n) {
    // En Pine, una comparación con na da false: la primera vela suma a los dos lados.
    const ch = change(src);
    const up = sum(src.map((v, i) => vol[i] * (ch[i] <= 0 ? 0 : v)), n);
    const dn = sum(src.map((v, i) => vol[i] * (ch[i] >= 0 ? 0 : v)), n);
    return up.map((u, i) => { const d = dn[i]; if (!ok(u) || !ok(d)) return NaN; return d === 0 ? (u === 0 ? NaN : 100) : 100 - 100 / (1 + u / d); });
  }
  function cci(src, n) {
    const ma = sma(src, n);
    return src.map((v, i) => {
      if (!ok(ma[i])) return NaN;
      let dev = 0; for (let k = 0; k < n; k++) dev += Math.abs(src[i - k] - ma[i]);
      dev /= n;
      return dev ? (v - ma[i]) / (0.015 * dev) : NaN;
    });
  }
  function tsi(src, s, l) {
    const pc = change(src), num = ema(ema(pc, l), s), den = ema(ema(pc.map(Math.abs), l), s);
    return num.map((v, i) => (den[i] ? v / den[i] : NaN));
  }
  // Pivote: el valor central supera a los `L` de la izquierda y a los `R` de la derecha.
  function pivot(x, L, R, hi) {
    const out = new Array(x.length).fill(NaN);
    for (let i = L + R; i < x.length; i++) {
      const c = i - R, v = x[c];
      if (!ok(v)) continue;
      let is = true;
      for (let k = c - L; k <= c + R && is; k++) {
        if (k === c) continue;
        const w = x[k];
        if (!ok(w) || (hi ? (k < c ? w >= v : w > v) : (k < c ? w <= v : w < v))) is = false;
      }
      if (is) out[i] = v;
    }
    return out;
  }
  const clamp = (v) => Math.max(-100, Math.min(100, v));

  // ── Hull Suite (InSilico) ────────────────────────────────────────────
  function hull(close, len = 55, mode = 'Hma') {
    const n = Math.max(2, len | 0), half = Math.max(1, (n / 2) | 0), sq = Math.max(1, Math.round(Math.sqrt(n)));
    if (mode === 'Ehma') { const a = ema(close, half), b = ema(close, n); return ema(a.map((v, i) => 2 * v - b[i]), sq); }
    if (mode === 'Thma') {
      const m = Math.max(2, (n / 2) | 0), a = wma(close, Math.max(1, (m / 3) | 0)), b = wma(close, Math.max(1, (m / 2) | 0)), c = wma(close, m);
      return wma(a.map((v, i) => v * 3 - b[i] - c[i]), m);
    }
    const a = wma(close, half), b = wma(close, n);
    return wma(a.map((v, i) => 2 * v - b[i]), sq);
  }

  // ── Aurora ───────────────────────────────────────────────────────────
  const DEF = {
    rsiLen: 14, stoLen: 14, stoSm: 3, mfiLen: 14, cciLen: 20, tsiShort: 13, tsiLong: 25, smoothLen: 4,
    obLevel: 50, osLevel: -50, flowLen: 21, flowSm: 5, flowGain: 1, volLen: 50, sigCool: 5,
    divL: 5, divR: 3, divMin: 5, divMax: 60, obSwing: 10, obBody: false, obConfWin: 3, obOnlyConf: false, obMax: 5
  };

  function compute(k, opt = {}) {
    const o = { ...DEF, ...opt }, n = k.length;
    const O = k.map((x) => x.o), H = k.map((x) => x.h), L = k.map((x) => x.l), C = k.map((x) => x.c);
    const V = k.map((x) => (ok(x.v) ? x.v : 0)), hlc3 = k.map((x) => (x.h + x.l + x.c) / 3);

    // Oscilador compuesto: cada oscilador a ±100 y promedio de los disponibles.
    const nRsi = rsi(C, o.rsiLen).map((v) => (v - 50) * 2);
    const nSto = sma(stoch(C, H, L, o.stoLen), o.stoSm).map((v) => (v - 50) * 2);
    const nMfi = mfi(hlc3, V, o.mfiLen).map((v) => (v - 50) * 2);
    const nCci = cci(hlc3, o.cciLen).map((v) => (ok(v) ? clamp(v / 2) : NaN));
    const nTsi = tsi(C, o.tsiShort, o.tsiLong).map((v) => (ok(v) ? clamp(v * 200) : NaN));
    const parts = [nRsi, nSto, nMfi, nCci, nTsi];
    const raw = new Array(n).fill(NaN), bull = new Array(n).fill(0), cnt = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const p of parts) if (ok(p[i])) { s += p[i]; cnt[i]++; if (p[i] > 0) bull[i]++; }
      if (cnt[i]) raw[i] = s / cnt[i];
    }
    const osc = ema(raw, o.smoothLen);

    // Flujo de dinero (CMF) y volumen relativo.
    const mfm = k.map((x) => { const r = x.h - x.l; return r > 0 ? ((x.c - x.l) - (x.h - x.c)) / r : 0; });
    const vSum = sum(V, o.flowLen), mv = sum(mfm.map((m, i) => m * V[i]), o.flowLen);
    const flow = ema(vSum.map((s, i) => (ok(s) ? (s > 0 ? mv[i] / s : 0) * 100 * o.flowGain : NaN)), o.flowSm);
    const vAvg = sma(V, o.volLen), rvol = ema(V.map((v, i) => (ok(vAvg[i]) ? (vAvg[i] > 0 ? v / vAvg[i] : 0) : NaN)), 3);

    // Giros en zona extrema, con separación mínima.
    const sigUp = new Array(n).fill(false), sigDn = new Array(n).fill(false);
    let lastDn = -1e5, lastUp = -1e5;
    for (let i = 2; i < n; i++) {
      const a = osc[i], b = osc[i - 1], c = osc[i - 2];
      if (a < b && b >= c && b > o.obLevel && i - lastDn > o.sigCool) { sigDn[i] = true; lastDn = i; }
      if (a > b && b <= c && b < o.osLevel && i - lastUp > o.sigCool) { sigUp[i] = true; lastUp = i; }
    }

    // Divergencias regulares: pivotes del oscilador contra el precio alrededor del pivote.
    const phO = pivot(osc, o.divL, o.divR, true), plO = pivot(osc, o.divL, o.divR, false);
    const hiWin = highest(H, o.divR * 2 + 1), loWin = lowest(L, o.divR * 2 + 1);
    const divs = [], bullDiv = new Array(n).fill(false), bearDiv = new Array(n).fill(false);
    let pH = null, pL = null;
    for (let i = 0; i < n; i++) {
      const cur = i - o.divR;
      if (ok(phO[i])) {
        if (pH) {
          const d = cur - pH.bar;
          if (d >= o.divMin && d <= o.divMax && phO[i] < pH.osc && hiWin[i] > pH.px && pH.osc > 0) {
            bearDiv[i] = true; divs.push({ side: -1, at: i, from: pH.bar, to: cur, osc0: pH.osc, osc1: phO[i], px0: pH.px, px1: hiWin[i] });
          }
        }
        pH = { bar: cur, osc: phO[i], px: hiWin[i] };
      }
      if (ok(plO[i])) {
        if (pL) {
          const d = cur - pL.bar;
          if (d >= o.divMin && d <= o.divMax && plO[i] > pL.osc && loWin[i] < pL.px && pL.osc < 0) {
            bullDiv[i] = true; divs.push({ side: 1, at: i, from: pL.bar, to: cur, osc0: pL.osc, osc1: plO[i], px0: pL.px, px1: loWin[i] });
          }
        }
        pL = { bar: cur, osc: plO[i], px: loWin[i] };
      }
    }

    // Order Blocks por estructura: BOS → vela extrema del tramo; se borran al cerrar del otro lado.
    const pivH = pivot(H, o.obSwing, o.obSwing, true), pivL = pivot(L, o.obSwing, o.obSwing, false);
    let swH = NaN, swHBar = 0, swHDone = true, swL = NaN, swLBar = 0, swLDone = true;
    let bullOBs = [], bearOBs = [];
    const obEvents = [];
    const confAt = (i, idx, test) => { for (let j = Math.max(idx - o.obConfWin, 0); j <= idx + o.obConfWin; j++) if (i - j >= 0 && test(osc[i - j])) return true; return false; };
    for (let i = 0; i < n; i++) {
      if (ok(pivH[i])) { swH = pivH[i]; swHBar = i - o.obSwing; swHDone = false; }
      if (ok(pivL[i])) { swL = pivL[i]; swLBar = i - o.obSwing; swLDone = false; }
      bullOBs = bullOBs.filter((b) => C[i] >= b.bot);
      bearOBs = bearOBs.filter((b) => C[i] <= b.top);
      if (!swHDone && C[i] > swH) {
        swHDone = true;
        const span = Math.min(i - swHBar, 300);
        if (span >= 1) {
          let idx = 1, m = L[i - 1];
          for (let j = 1; j <= span; j++) if (L[i - j] < m) { m = L[i - j]; idx = j; }
          const conf = confAt(i, idx, (v) => v <= o.osLevel);
          obEvents.push({ side: 1, at: i, conf });
          if (conf || !o.obOnlyConf) {
            bullOBs.push({ side: 1, from: i - idx, top: o.obBody ? Math.max(O[i - idx], C[i - idx]) : H[i - idx], bot: L[i - idx], conf });
            if (bullOBs.length > o.obMax) bullOBs.shift();
          }
        }
      }
      if (!swLDone && C[i] < swL) {
        swLDone = true;
        const span = Math.min(i - swLBar, 300);
        if (span >= 1) {
          let idx = 1, m = H[i - 1];
          for (let j = 1; j <= span; j++) if (H[i - j] > m) { m = H[i - j]; idx = j; }
          const conf = confAt(i, idx, (v) => v >= o.obLevel);
          obEvents.push({ side: -1, at: i, conf });
          if (conf || !o.obOnlyConf) {
            bearOBs.push({ side: -1, from: i - idx, top: H[i - idx], bot: o.obBody ? Math.min(O[i - idx], C[i - idx]) : L[i - idx], conf });
            if (bearOBs.length > o.obMax) bearOBs.shift();
          }
        }
      }
    }

    const last = n - 1;
    return {
      osc, flow, rvol, sigUp, sigDn, bullDiv, bearDiv, divs, obs: [...bullOBs, ...bearOBs], obEvents,
      bullCnt: bull[last], oscCnt: cnt[last],
      zone: osc[last] > o.obLevel ? 'Sobrecompra' : osc[last] < o.osLevel ? 'Sobreventa' : 'Neutral'
    };
  }

  // Señal más reciente dentro de las últimas `bars` velas: giro, divergencia u OB con confluencia.
  function latestSignal(a, bars) {
    const n = a.osc.length;
    for (let i = n - 1; i >= Math.max(0, n - bars); i--) {
      const ev = a.obEvents.find((e) => e.at === i && e.conf);
      if (a.sigUp[i]) return { side: 1, kind: 'Giro alcista', ago: n - 1 - i };
      if (a.sigDn[i]) return { side: -1, kind: 'Giro bajista', ago: n - 1 - i };
      if (a.bullDiv[i]) return { side: 1, kind: 'Divergencia alcista', ago: n - 1 - i };
      if (a.bearDiv[i]) return { side: -1, kind: 'Divergencia bajista', ago: n - 1 - i };
      if (ev) return { side: ev.side, kind: ev.side > 0 ? 'OB de demanda con confluencia' : 'OB de oferta con confluencia', ago: n - 1 - i };
    }
    return null;
  }

  root.AuroraMath = { compute, hull, latestSignal, DEF, _ta: { sma, ema, rma, wma, rsi, stoch, mfi, cci, tsi, pivot, highest, lowest } };
})(typeof window !== 'undefined' ? window : globalThis);
