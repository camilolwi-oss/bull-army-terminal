// Flujo · cálculo puro (sin DOM): delta, CVD y open interest de Binance alineados a las velas
// del gráfico, flechas delta/OI, divergencias CVD-precio y VWAP anclados.
// Velas del gráfico: { time, open, high, low, close, volume } (time = apertura en ms).
(function (root) {
  'use strict';
  const ok = Number.isFinite;
  const DAY = 864e5;

  // Última vela del gráfico con time <= t (búsqueda binaria); -1 si no hay.
  function barAt(times, t) {
    let lo = 0, hi = times.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  // Fin de cada vela: la apertura de la siguiente, sin pasar de time + tfMs (por si faltan velas).
  const barEnds = (times, tfMs) => times.map((t, i) => Math.min(i + 1 < times.length ? times[i + 1] : Infinity, t + tfMs));

  // Agrupa las velas de Binance { t, end, v, buy, final } en las del gráfico. Una vela queda
  // completa cuando sus velas de Binance cubren todo su rango y todas están cerradas.
  function bucketize(times, tfMs, klines) {
    const n = times.length, ends = barEnds(times, tfMs);
    const vol = new Array(n).fill(0), buy = new Array(n).fill(0), has = new Array(n).fill(false);
    const first = new Array(n).fill(Infinity), last = new Array(n).fill(-Infinity), fin = new Array(n).fill(true);
    for (const k of klines) {
      const i = barAt(times, k.t);
      if (i < 0 || k.t >= ends[i]) continue;
      vol[i] += k.v; buy[i] += k.buy; has[i] = true;
      first[i] = Math.min(first[i], k.t); last[i] = Math.max(last[i], k.end);
      if (!k.final) fin[i] = false;
    }
    const complete = has.map((h, i) => h && fin[i] && first[i] <= times[i] && last[i] >= ends[i]);
    const delta = has.map((h, i) => (h ? 2 * buy[i] - vol[i] : NaN));
    // CVD: suma del delta desde la primera vela con datos; NaN donde falta el dato.
    const cvd = new Array(n).fill(NaN);
    let acc = 0;
    for (let i = 0; i < n; i++) if (has[i]) { acc += delta[i]; cvd[i] = acc; }
    return { vol, delta, cvd, has, complete, ends };
  }

  // Open interest por vela. `samples`: Map timestamp → OI (fotos de Binance al inicio de cada período).
  // oiOpen/oiClose solo con fotos exactas en la apertura y el cierre (sin aproximar);
  // `line` usa la última foto disponible para dibujar, y la foto en vivo en la vela abierta.
  function oiSeries(times, ends, samples, periodMs, live) {
    const n = times.length, keys = [...samples.keys()].sort((a, b) => a - b);
    const line = new Array(n).fill(NaN), dOi = new Array(n).fill(NaN);
    for (let i = 0; i < n; i++) {
      const a = samples.get(times[i]), b = samples.get(ends[i]);
      if (ok(a) && ok(b)) dOi[i] = b - a;
      if (ok(b)) { line[i] = b; continue; }
      const j = barAt(keys, ends[i]);
      if (j >= 0 && ends[i] - keys[j] <= 2 * periodMs) line[i] = samples.get(keys[j]);
    }
    if (n && live && ok(live.v) && live.t >= times[n - 1]) line[n - 1] = live.v;
    return { line, dOi };
  }

  // Flechas en velas cerradas con volumen > `mult` veces el promedio de las `len` anteriores:
  //  verde: delta negativo y OI que sube · roja: delta positivo y OI que baja.
  function arrows(b, dOi, closed, len = 20, mult = 2) {
    const out = [];
    for (let i = len; i < closed; i++) {
      if (!b.complete[i] || !ok(dOi[i])) continue;
      let s = 0, good = true;
      for (let k = i - len; k < i; k++) { if (!b.has[k]) { good = false; break; } s += b.vol[k]; }
      if (!good || !(b.vol[i] > mult * (s / len))) continue;
      if (b.delta[i] < 0 && dOi[i] > 0) out.push({ i, side: 1 });
      else if (b.delta[i] > 0 && dOi[i] < 0) out.push({ i, side: -1 });
    }
    return out;
  }

  // Pivote: el valor central supera a los `L` de la izquierda y a los `R` de la derecha (como ta.pivothigh).
  function isPivot(x, c, L, R, hi, n = x.length) {
    const v = x[c];
    if (!ok(v) || c - L < 0 || c + R >= n) return false;
    for (let k = c - L; k <= c + R; k++) {
      if (k === c) continue;
      const w = x[k];
      if (!ok(w) || (hi ? (k < c ? w >= v : w > v) : (k < c ? w <= v : w < v))) return false;
    }
    return true;
  }
  const winExt = (x, a, b, hi) => {
    let m = hi ? -Infinity : Infinity;
    for (let k = a; k <= b; k++) { if (!ok(x[k])) return NaN; m = hi ? Math.max(m, x[k]) : Math.min(m, x[k]); }
    return m;
  };

  // Divergencias CVD contra el precio, solo con velas cerradas. Se comparan dos pivotes seguidos del
  // precio (máximos o mínimos) y el CVD alrededor de cada uno:
  //  máximos · precio más alto y CVD más bajo  → agotamiento bajista
  //            precio más bajo y CVD más alto  → absorción bajista
  //  mínimos · precio más bajo y CVD más alto  → agotamiento alcista
  //            precio más alto y CVD más bajo  → absorción alcista
  // Solo cuenta si el oscilador Aurora estuvo en su extremo (>= ob en máximos, <= os en mínimos)
  // alrededor del segundo pivote. La marca va en la vela del pivote y aparece `R` velas después.
  function cvdDivergences(H, L, cvd, osc, closed, o = {}) {
    const { pL = 5, pR = 3, dMin = 5, dMax = 60, ob = 50, os = -50 } = o;
    const out = [];
    let pH = null, pLo = null;
    for (let i = pL + pR; i < closed; i++) {
      const c = i - pR, a = c - pR, b = c + pR;
      if (isPivot(H, c, pL, pR, true, closed)) {
        const cv = winExt(cvd, a, b, true), os_ = winExt(osc, a, b, true);
        if (ok(cv)) {
          if (pH && c - pH.c >= dMin && c - pH.c <= dMax && os_ >= ob) {
            if (H[c] > pH.px && cv < pH.cv) out.push({ i: c, from: pH.c, side: -1, kind: 'exh' });
            else if (H[c] < pH.px && cv > pH.cv) out.push({ i: c, from: pH.c, side: -1, kind: 'abs' });
          }
          pH = { c, px: H[c], cv };
        }
      }
      if (isPivot(L, c, pL, pR, false, closed)) {
        const cv = winExt(cvd, a, b, false), os_ = winExt(osc, a, b, false);
        if (ok(cv)) {
          if (pLo && c - pLo.c >= dMin && c - pLo.c <= dMax && os_ <= os) {
            if (L[c] < pLo.px && cv > pLo.cv) out.push({ i: c, from: pLo.c, side: 1, kind: 'exh' });
            else if (L[c] > pLo.px && cv < pLo.cv) out.push({ i: c, from: pLo.c, side: 1, kind: 'abs' });
          }
          pLo = { c, px: L[c], cv };
        }
      }
    }
    return out;
  }

  // ── VWAP anclados (UTC) ────────────────────────────────────────────────
  const PERIOD = { D: DAY, W: 7 * DAY, M: 28 * DAY, Q: 90 * DAY, Y: 365 * DAY };
  function anchorStart(t, kind) {
    const d = new Date(t);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (kind === 'D') return Date.UTC(y, m, d.getUTCDate());
    if (kind === 'W') return Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    if (kind === 'M') return Date.UTC(y, m, 1);
    if (kind === 'Q') return Date.UTC(y, m - (m % 3), 1);
    return Date.UTC(y, 0, 1);
  }
  // Un VWAP no tiene sentido si cada vela ya dura lo mismo o más que su período.
  const vwapApplies = (kind, tfMs) => tfMs < PERIOD[kind];
  // `prefix`: { anchor, pv, v } con lo acumulado desde el ancla hasta la primera vela del gráfico.
  // La primera vela de cada período queda en null para cortar la línea en el cambio.
  function vwap(bars, kind, prefix) {
    const out = new Array(bars.length).fill(null);
    let cur = null, pv = 0, v = 0;
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i], a = anchorStart(b.time, kind);
      const vol = ok(b.volume) ? b.volume : 0, tp = (b.high + b.low + b.close) / 3;
      const fresh = a !== cur;
      if (fresh) { cur = a; pv = 0; v = 0; if (i === 0 && prefix && prefix.anchor === a) { pv = prefix.pv; v = prefix.v; } }
      pv += tp * vol; v += vol;
      out[i] = (fresh && i > 0) || v <= 0 ? null : pv / v;
    }
    return out;
  }

  root.FlujoMath = { barAt, barEnds, bucketize, oiSeries, arrows, cvdDivergences, anchorStart, vwapApplies, vwap, PERIOD };
})(typeof window !== 'undefined' ? window : globalThis);
