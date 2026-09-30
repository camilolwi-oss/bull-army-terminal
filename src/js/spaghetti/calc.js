// Spaghetti · cálculo puro (sin DOM). Series con null donde falta el dato.
(function (root) {
  'use strict';
  const isNum = (v) => v != null && Number.isFinite(v);

  // Fórmula sobre la serie cruda. `base` = índice donde arranca la ventana visible.
  function formula(x, kind, base) {
    const n = x.length, out = new Array(n).fill(null);
    let b0 = null;
    for (let i = base; i < n && b0 == null; i++) if (isNum(x[i])) b0 = x[i];
    for (let i = 0; i < n; i++) {
      const v = x[i];
      if (!isNum(v)) continue;
      if (kind === 'standard') out[i] = v;
      else if (kind === 'cum') { if (b0 != null) out[i] = v - b0; }
      else if (kind === 'cumpct') { if (b0) out[i] = (v / b0 - 1) * 100; }
      else {
        const p = i > 0 ? x[i - 1] : null;
        if (!isNum(p)) continue;
        if (kind === 'chg') out[i] = v - p;
        else if (kind === 'chgpct' && p) out[i] = (v / p - 1) * 100;
      }
    }
    return out;
  }

  // Promedio transversal por índice (ignora null).
  function crossMean(seriesList, n) {
    const out = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (const a of seriesList) { const v = a[i]; if (isNum(v)) { s += v; c++; } }
      if (c) out[i] = s / c;
    }
    return out;
  }

  const minus = (a, b) => a.map((v, i) => (isNum(v) && isNum(b[i]) ? v - b[i] : null));

  function sma(x, len) {
    const out = new Array(x.length).fill(null), q = [];
    let s = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!isNum(v)) continue;
      q.push(v); s += v;
      if (q.length > len) s -= q.shift();
      if (q.length === len) out[i] = s / len;
    }
    return out;
  }

  // EMA sembrada con SMA, como ta.ema de Pine.
  function ema(x, len) {
    const out = new Array(x.length).fill(null), k = 2 / (len + 1);
    let e = null, seed = [];
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!isNum(v)) continue;
      if (e == null) {
        seed.push(v);
        if (seed.length === len) { e = seed.reduce((a, b) => a + b, 0) / len; out[i] = e; }
      } else { e = v * k + e * (1 - k); out[i] = e; }
    }
    return out;
  }

  // RSI de Wilder (RMA), como ta.rsi de Pine.
  function rsi(x, len) {
    const out = new Array(x.length).fill(null);
    let prev = null, ag = 0, al = 0, cnt = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!isNum(v)) continue;
      if (prev == null) { prev = v; continue; }
      const d = v - prev, g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
      prev = v;
      if (cnt < len) {
        ag += g; al += l; cnt++;
        if (cnt === len) { ag /= len; al /= len; out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); }
      } else {
        ag = (ag * (len - 1) + g) / len; al = (al * (len - 1) + l) / len;
        out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
      }
    }
    return out;
  }

  // Percentil móvil: % de los últimos `len` valores que quedan por debajo o igual al actual.
  function rollingPct(x, len) {
    const out = new Array(x.length).fill(null), q = [];
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!isNum(v)) continue;
      q.push(v); if (q.length > len) q.shift();
      if (q.length < 2) continue;
      let below = 0; for (const w of q) if (w <= v) below++;
      out[i] = ((below - 1) / (q.length - 1)) * 100;
    }
    return out;
  }

  // Pipeline completo. raw: {coin: number[]}; devuelve {coin: number[]} recortado a la ventana.
  function compute(raw, o) {
    const coins = Object.keys(raw);
    if (!coins.length) return { series: {}, avg: [] };
    const n = raw[coins[0]].length, base = o.base || 0;
    let f = {};
    for (const c of coins) f[c] = formula(raw[c], o.formula, base);
    if (o.ref === 'market') {
      const m = crossMean(coins.map((c) => f[c]), n);
      for (const c of coins) f[c] = minus(f[c], m);
    } else if (o.ref && o.ref !== 'none' && f[o.ref]) {
      const r = f[o.ref];
      for (const c of coins) f[c] = minus(f[c], r);
    }
    const L = Math.max(2, o.len | 0);
    for (const c of coins) {
      let s = f[c];
      if (o.metric === 'rsi') s = rsi(s, L);
      else if (o.metric === 'sma') s = sma(s, L);
      else if (o.metric === 'ema') s = ema(s, L);
      if (o.pct) s = rollingPct(s, L);
      f[c] = s.slice(base);
    }
    return { series: f, avg: crossMean((o.visible || coins).filter((c) => f[c]).map((c) => f[c]), n - base) };
  }

  root.SpagMath = { formula, crossMean, sma, ema, rsi, rollingPct, compute };
})(typeof window !== 'undefined' ? window : globalThis);
