// Orderflow · cálculo puro (sin DOM): perfiles por sesión (Volume Profile y TPO), POC, área de valor,
// Initial Balance, single prints y niveles "naked" (POC, VAH y VAL que el precio todavía no volvió a tocar).
// Velas: { t, o, h, l, c, v } de Hyperliquid, en una temporalidad fina para la sesión elegida.
(function (root) {
  'use strict';
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  // Cada sesión: con qué velas se arma y cuánto dura cada período TPO (una letra).
  const SESS = {
    day: { src: '5m', srcMs: 5 * MIN, tpoMs: 30 * MIN, ib: 2, label: 'Diaria' },
    ny: { src: '5m', srcMs: 5 * MIN, tpoMs: 30 * MIN, ib: 2, label: 'Nueva York' },
    week: { src: '1h', srcMs: HOUR, tpoMs: 4 * HOUR, ib: 6, label: 'Semanal' },
    month: { src: '4h', srcMs: 4 * HOUR, tpoMs: DAY, ib: 7, label: 'Mensual' }
  };
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const VA = 0.7;

  // Hora de Nueva York (con horario de verano) para la sesión de acciones de 9:30 a 16:00.
  const nyFmt = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  function nyParts(t) {
    const o = {}; for (const p of nyFmt.formatToParts(new Date(t))) o[p.type] = p.value;
    return { date: `${o.year}-${o.month}-${o.day}`, min: +o.hour * 60 + +o.minute };
  }
  // Clave y límites de la sesión a la que pertenece una vela (null = fuera de sesión).
  function sessionOf(t, type) {
    const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (type === 'day') { const a = Date.UTC(y, m, d.getUTCDate()); return { key: a, t0: a, t1: a + DAY }; }
    if (type === 'week') { const a = Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return { key: a, t0: a, t1: a + 7 * DAY }; }
    if (type === 'month') { const a = Date.UTC(y, m, 1); return { key: a, t0: a, t1: Date.UTC(y, m + 1, 1) }; }
    const p = nyParts(t);
    if (p.min < 570 || p.min >= 960) return null;          // 9:30 a 16:00 NY
    const t0 = t - (p.min - 570) * MIN;
    return { key: p.date, t0, t1: t0 + 390 * MIN };
  }
  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 2.25 ? 2 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
  }
  // Área de valor: desde el POC se suma el lado vecino más grande hasta juntar el 70 %.
  function valueArea(vals, poc) {
    const total = vals.reduce((a, b) => a + b, 0);
    let lo = poc, hi = poc, acc = vals[poc];
    while (acc < total * VA && (lo > 0 || hi < vals.length - 1)) {
      const up = hi < vals.length - 1 ? vals[hi + 1] : -1, dn = lo > 0 ? vals[lo - 1] : -1;
      if (up >= dn) acc += vals[++hi]; else acc += vals[--lo];
    }
    return { lo, hi, total };
  }
  const argmax = (vals, mid) => { let b = 0; for (let i = 1; i < vals.length; i++) if (vals[i] > vals[b] || (vals[i] === vals[b] && Math.abs(i - mid) < Math.abs(b - mid))) b = i; return b; };

  /**
   * Perfiles por sesión. o = { rows: niveles objetivo por sesión (≈ 40) }
   * Devuelve { step, sessions:[...], nakeds:[...] }. La última sesión puede estar en curso (done = false).
   */
  function build(k, type, o = {}) {
    const S = SESS[type], groups = [], byKey = new Map();
    for (const c of k) {
      const s = sessionOf(c.t, type); if (!s) continue;
      let g = byKey.get(s.key);
      if (!g) { g = { t0: s.t0, t1: s.t1, k: [] }; byKey.set(s.key, g); groups.push(g); }
      g.k.push(c);
    }
    // Un mismo tamaño de nivel para todas las sesiones (así los niveles se comparan entre sesiones).
    const ranges = groups.map((g) => Math.max(...g.k.map((c) => c.h)) - Math.min(...g.k.map((c) => c.l))).filter((r) => r > 0).sort((a, b) => a - b);
    const step = niceStep((ranges.length ? ranges[ranges.length >> 1] : 1) / (o.rows || 40));
    const now = Date.now();
    const sessions = groups.map((g) => {
      const lo = Math.min(...g.k.map((c) => c.l)), hi = Math.max(...g.k.map((c) => c.h));
      const r0 = Math.floor(lo / step), n = Math.floor(hi / step) - r0 + 1;
      const vol = new Array(n).fill(0), tpo = new Array(n).fill(0), let_ = Array.from({ length: n }, () => []);
      const periods = new Map();
      for (const c of g.k) {
        // Volumen repartido en el rango de la vela, según cuánto de cada nivel cubre.
        const a = Math.floor(c.l / step) - r0, b = Math.floor(c.h / step) - r0, span = c.h - c.l;
        for (let r = a; r <= b; r++) {
          const p0 = (r0 + r) * step, p1 = p0 + step, ov = span > 0 ? (Math.min(p1, c.h) - Math.max(p0, c.l)) / span : 1;
          if (ov > 0) vol[r] += c.v * ov;
        }
        const pi = Math.floor((c.t - g.t0) / S.tpoMs), pr = periods.get(pi);
        periods.set(pi, pr ? { l: Math.min(pr.l, c.l), h: Math.max(pr.h, c.h) } : { l: c.l, h: c.h });
      }
      // TPO: cada período marca con su letra todos los niveles que tocó.
      for (const [pi, pr] of [...periods.entries()].sort((x, y) => x[0] - y[0])) {
        for (let r = Math.floor(pr.l / step) - r0; r <= Math.floor(pr.h / step) - r0; r++) { tpo[r]++; let_[r].push(pi); }
      }
      const mid = (n - 1) / 2, pv = argmax(vol, mid), pt = argmax(tpo, mid), vav = valueArea(vol, pv), vat = valueArea(tpo, pt);
      const price = (r) => (r0 + r) * step;
      const ordered = [...periods.keys()].sort((x, y) => x - y), ibp = ordered.slice(0, S.ib).map((pi) => periods.get(pi));
      const singles = []; for (let r = 1; r < n - 1; r++) if (tpo[r] === 1) singles.push(r);
      const shape = (() => { const x = (pt + 0.5) / n; return x > 0.66 ? 'P' : x < 0.34 ? 'b' : 'D'; })();
      return {
        t0: g.t0, t1: g.t1, done: g.t1 <= now, lo, hi, r0, n, step,
        rows: vol.map((v, r) => ({ p0: price(r), p1: price(r + 1), vol: v, tpo: tpo[r], letters: let_[r] })),
        vp: { poc: price(pv) + step / 2, pocRow: pv, vah: price(vav.hi + 1), val: price(vav.lo), vaLo: vav.lo, vaHi: vav.hi, total: vav.total, max: vol[pv] },
        tp: { poc: price(pt) + step / 2, pocRow: pt, vah: price(vat.hi + 1), val: price(vat.lo), vaLo: vat.lo, vaHi: vat.hi, total: vat.total, max: tpo[pt] },
        ib: ibp.length ? { lo: Math.min(...ibp.map((p) => p.l)), hi: Math.max(...ibp.map((p) => p.h)) } : null,
        singles, poorHigh: tpo[n - 1] >= 2, poorLow: tpo[0] >= 2, shape, periods: ordered.length
      };
    });
    return { type, step, sessions };
  }

  // Niveles naked: de cada sesión terminada, POC/VAH/VAL que ninguna vela posterior volvió a tocar.
  function nakeds(k, sessions, mode, kinds = ['poc', 'vah', 'val']) {
    const out = [];
    for (const s of sessions) {
      if (!s.done) continue;
      const P = s[mode];
      for (const kind of kinds) {
        const p = P[kind];
        let touched = null;
        for (const c of k) { if (c.t < s.t1) continue; if (c.l <= p && c.h >= p) { touched = c.t; break; } }
        if (touched == null) out.push({ kind, price: p, from: s.t1, session: s.t0 });
      }
    }
    return out;
  }

  root.OrderflowMath = { SESS, LETTERS, sessionOf, niceStep, valueArea, build, nakeds };
})(typeof window !== 'undefined' ? window : globalThis);
