// Order Flow · cálculo puro (sin DOM): footprint por nivel de precio, POC y naked POC, CVD y VWAP anclados.
// Operación: { t (ms), px, qty, buy (true = compra agresiva) }. Vela: { t, o, h, l, c, v, buy? (volumen comprador) }.
(function (root) {
  'use strict';

  // Tamaño de nivel "redondo" (1, 2, 2.5, 5 × 10^k) para que cada vela tenga ~`target` niveles.
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
    return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
  }
  function autoStep(candles, target = 14) {
    const r = candles.slice(-80).map((k) => k.h - k.l).filter((x) => x > 0).sort((a, b) => a - b);
    return niceStep(r.length ? r[Math.floor(r.length / 2)] / target : 1);
  }
  const levelOf = (px, step) => Math.floor(px / step + 1e-9) * step;

  // Footprint: por vela, un mapa nivel → { buy, sell }. Se puede alimentar en vivo, una operación por vez.
  function createFootprint(tfMs, step) {
    const bars = new Map(), cache = new Map();   // cache: vista ya calculada de cada vela (se invalida al sumar operaciones)
    let seen = new Set(), first = Infinity;
    return {
      step, tfMs, bars,
      get first() { return first; },
      add(tr, id) {
        if (id != null) { if (seen.has(id)) return false; seen.add(id); if (seen.size > 400000) seen = new Set(); }
        const t = Math.floor(tr.t / tfMs) * tfMs, lv = levelOf(tr.px, step);
        let b = bars.get(t);
        if (!b) { b = { levels: new Map(), buy: 0, sell: 0 }; bars.set(t, b); }
        let c = b.levels.get(lv);
        if (!c) { c = { buy: 0, sell: 0 }; b.levels.set(lv, c); }
        if (tr.buy) { c.buy += tr.qty; b.buy += tr.qty; } else { c.sell += tr.qty; b.sell += tr.qty; }
        cache.delete(t);
        if (t < first) first = t;
        return true;
      },
      // Datos listos para dibujar una vela: niveles ordenados, POC, máximos y delta.
      view(t) {
        if (cache.has(t)) return cache.get(t);
        const b = bars.get(t); if (!b) return null;
        let poc = null, pocVol = 0, maxVol = 0, maxAbs = 0;
        const levels = [...b.levels].map(([px, c]) => {
          const vol = c.buy + c.sell, delta = c.buy - c.sell;
          if (vol > pocVol) { pocVol = vol; poc = px; }
          maxVol = Math.max(maxVol, vol); maxAbs = Math.max(maxAbs, Math.abs(delta));
          return { px, buy: c.buy, sell: c.sell, vol, delta };
        }).sort((a, b2) => b2.px - a.px);
        const out = { levels, poc, pocVol, maxVol, maxAbs, buy: b.buy, sell: b.sell, delta: b.buy - b.sell, vol: b.buy + b.sell };
        cache.set(t, out);
        return out;
      }
    };
  }

  // Naked POC: el POC de una vela que el precio todavía no volvió a tocar en ninguna vela posterior.
  // minT: velas anteriores no cuentan (por ejemplo, la primera vela con historia incompleta).
  function nakedPocs(candles, fp, minT = -Infinity) {
    const out = [];
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].t < minT) continue;
      const v = fp.view(candles[i].t); if (!v || v.poc == null) continue;
      const mid = v.poc + fp.step / 2;
      let touched = false;
      for (let j = i + 1; j < candles.length && !touched; j++) if (candles[j].l <= mid && candles[j].h >= mid) touched = true;
      if (!touched) out.push({ t: candles[i].t, i, px: mid, vol: v.pocVol });
    }
    return out;
  }

  // CVD desde velas con volumen comprador (Binance: taker buy volume). Delta = compras − ventas.
  function cvdFromCandles(candles) {
    let acc = 0;
    return candles.map((k) => { const d = Number.isFinite(k.buy) ? 2 * k.buy - k.v : NaN; if (Number.isFinite(d)) acc += d; return Number.isFinite(d) ? acc : NaN; });
  }

  // VWAP anclado: se reinicia al comienzo de cada día / semana (lunes) / mes / trimestre / año, en UTC.
  function anchorStart(t, kind) {
    const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (kind === 'D') return Date.UTC(y, m, d.getUTCDate());
    if (kind === 'W') { const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(y, m, d.getUTCDate() - dow); }
    if (kind === 'M') return Date.UTC(y, m, 1);
    if (kind === 'Q') return Date.UTC(y, m - (m % 3), 1);
    return Date.UTC(y, 0, 1);
  }
  // base: velas (de cualquier resolución) desde antes del ancla. Devuelve [{ t, vwap }] al cierre de cada vela base.
  function vwapSeries(base, kind) {
    const out = []; let a = null, pv = 0, vol = 0;
    for (const k of base) {
      const s = anchorStart(k.t, kind);
      if (s !== a) { a = s; pv = 0; vol = 0; }
      const tp = (k.h + k.l + k.c) / 3;
      pv += tp * k.v; vol += k.v;
      if (vol > 0) out.push({ t: k.t, anchor: a, vwap: pv / vol });
    }
    return out;
  }
  // Valor del VWAP en el instante t: el de la última vela base que empezó antes o en t.
  function vwapAt(series, t) {
    let lo = 0, hi = series.length - 1, ans = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (series[mid].t <= t) { ans = series[mid]; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }

  root.OrderFlowMath = { niceStep, autoStep, levelOf, createFootprint, nakedPocs, cvdFromCandles, anchorStart, vwapSeries, vwapAt };
})(typeof window !== 'undefined' ? window : globalThis);
