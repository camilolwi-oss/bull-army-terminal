// Niveles · cálculo puro (sin DOM). Zonas de confluencia Fibonacci a partir de impulsos del ZigZag,
// solo con impulsos anclados en extremos del oscilador Aurora, sin mirar el futuro, más señales de
// pinchazo y limpieza con su resultado histórico. Basado en el "Puzzle" (FiboHeatmap) de Bull Army.
// Velas: { t, o, h, l, c, v }. `osc`: AuroraMath.compute(velas).osc, alineado con las velas.
(function (root) {
  'use strict';
  const ok = Number.isFinite;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Ratios y peso de cada uno: los puntos de una zona son la suma de los pesos que caen en ella.
  const FIBO = [
    [0.618, 3], [1.618, 3],
    [0.382, 2], [0.714, 2], [0.905, 2], [1.097, 2], [1.382, 2],
    [0, 1], [0.236, 1], [0.814, 1], [0.875, 1], [1, 1], [1.2, 1], [1.5, 1], [1.85, 1], [2, 1], [2.11, 1],
    [-0.097, 0.5], [4.414, 0.5], [4.618, 0.5], [4.764, 0.5]
  ];
  // ZigZag en múltiplos del rango típico de vela de cada mercado (así un 9% de BTC diario y el ruido
  // de una acción HIP-3 en 5m se miden con la misma vara).
  const K = { '1d': 3, '4h': 3.5, '1h': 4, '15m': 4.5, '5m': 5 };
  const DEF = { ob: 50, os: -50, extWin: 3, maxImp: 25, halfLife: 400, minPts: 10, sweepBars: 12, horizon: 400 };

  function params(k, tf) {
    const r = k.slice(-300).map((x) => (x.c > 0 ? (x.h - x.l) / x.c * 100 : NaN)).filter(ok).sort((a, b) => a - b);
    const med = r.length ? r[r.length >> 1] : 1;
    const zz = (K[tf] || 4) * med;
    return { med, zz, minImp: 1.4 * zz, tol: 0.05 * zz, maxW: 0.22 * zz, atr: med };
  }

  // ZigZag por porcentaje; cada pivote sabe en qué vela quedó confirmado (confirmIdx).
  function pivots(k, thPct) {
    const th = thPct / 100, out = [];
    if (!k.length) return out;
    let dir = 0, extP = k[0].c, extI = 0;
    for (let i = 1; i < k.length; i++) {
      const c = k[i];
      if (dir >= 0) {
        if (c.h > extP) { extP = c.h; extI = i; }
        if (dir !== -1 && c.l < extP * (1 - th)) { out.push({ i: extI, px: extP, hi: true, conf: i }); dir = -1; extP = c.l; extI = i; }
        else if (dir === 0 && c.h > extP) dir = 1;
      }
      if (dir <= 0) {
        if (c.l < extP) { extP = c.l; extI = i; }
        if (dir === -1 && c.h > extP * (1 + th)) { out.push({ i: extI, px: extP, hi: false, conf: i }); dir = 1; extP = c.h; extI = i; }
      }
    }
    return out;
  }

  // ¿El pivote se formó con Aurora en su extremo? Máximo con el oscilador ≥ +50, mínimo con ≤ −50,
  // mirando unas velas alrededor pero nunca después de la vela que lo confirma.
  function atExtreme(p, osc, o) {
    const a = Math.max(0, p.i - o.extWin), b = Math.min(p.conf, p.i + o.extWin);
    for (let j = a; j <= b; j++) {
      const v = osc[j];
      if (ok(v) && (p.hi ? v >= o.ob : v <= o.os)) return true;
    }
    return false;
  }

  // Impulsos: tramos entre dos pivotes con tamaño mínimo cuyo ancla (el pivote final, desde donde se
  // miden los Fibonacci) se formó con Aurora en su extremo. Exigirlo en las dos puntas deja casi nada:
  // un mismo tramo rara vez va de sobreventa a sobrecompra completo (BTC 1D: 2 de 300 impulsos).
  function impulses(k, osc, P, o) {
    const pv = pivots(k, P.zz), out = [];
    for (let j = 1; j < pv.length; j++) {
      const a = pv[j - 1], b = pv[j];
      if (a.hi === b.hi) continue;
      const size = Math.abs(b.px - a.px) / a.px * 100;
      if (size < P.minImp) continue;
      if (!atExtreme(b, osc, o)) continue;
      out.push({ a, b, up: b.hi, size, conf: b.conf });
    }
    return out;
  }

  // Zonas con lo que se sabía en la vela `at`. Los impulsos compiten: tamaño × cercanía en el tiempo;
  // se quedan los `maxImp` mejores. Los puntos siguen siendo la suma de pesos Fibonacci.
  function zonesAt(k, imps, at, P, o) {
    const known = imps.filter((m) => m.conf <= at);
    if (!known.length) return [];
    const sizes = known.map((m) => m.size).sort((x, y) => x - y), medS = sizes[sizes.length >> 1];
    const ranked = known.map((m) => ({ m, w: clamp(m.size / medS, 0.5, 3) * Math.pow(0.5, (at - m.conf) / o.halfLife) }))
      .sort((x, y) => y.w - x.w).slice(0, o.maxImp).map((x) => x.m);
    let lo = Infinity, hi = 0;
    for (let i = 0; i <= at; i++) { lo = Math.min(lo, k[i].l); hi = Math.max(hi, k[i].h); }
    lo *= 0.7; hi *= 1.4;
    const levels = [];
    for (const m of ranked) {
      const A = m.a.px, B = m.b.px, rg = B - A;
      for (const [ratio, w] of FIBO) { const p = B - ratio * rg; if (p > lo && p < hi) levels.push({ p, ratio, w, m }); }
    }
    levels.sort((x, y) => x.p - y.p);
    const zones = [];
    let cur = null;
    for (const l of levels) {
      if (cur && (l.p - cur.hi) / cur.hi <= P.tol / 100 && (l.p - cur.lo) / cur.lo <= P.maxW / 100) { cur.levels.push(l); cur.hi = Math.max(cur.hi, l.p); }
      else { if (cur) zones.push(cur); cur = { lo: l.p, hi: l.p, levels: [l] }; }
    }
    if (cur) zones.push(cur);
    const close = k[at].c, pad = 0.02 * P.zz / 100;
    for (const z of zones) {
      z.pts = Math.round(z.levels.reduce((s, l) => s + l.w, 0) * 10) / 10;
      if (z.hi - z.lo < z.lo * pad * 2) { const c = (z.lo + z.hi) / 2; z.lo = c * (1 - pad); z.hi = c * (1 + pad); }
      z.mid = (z.lo + z.hi) / 2;
      z.width = (z.hi - z.lo) / z.mid * 100;
      z.born = Math.max(...z.levels.map((l) => l.m.conf));   // la confluencia existe cuando llega su último impulso
      z.dom = z.levels.slice().sort((x, y) => y.w - x.w)[0].ratio;
      z.sup = z.mid < close;
      z.id = String(Math.round(Math.log(z.mid) / Math.max(1e-5, P.tol / 100)));   // misma zona aunque cambie un poco
    }
    return zones;
  }

  // Estado de cada zona hasta la vela `to`: sin tocar → tocada → reaccionó / trabajada (superada).
  function states(k, zones, to) {
    for (const z of zones) {
      z.state = 'sin tocar'; z.touch = null;
      const bh = z.hi - z.lo;
      for (let i = z.born; i <= to; i++) {
        const c = k[i], touch = c.l <= z.hi && c.h >= z.lo;
        if (z.state === 'sin tocar') { if (touch) { z.state = 'tocada'; z.touch = i; } continue; }
        if (z.sup ? c.c < z.lo - bh : c.c > z.hi + bh) { z.state = 'trabajada'; break; }
        if (z.state === 'tocada' && (z.sup ? c.c > z.hi + bh : c.c < z.lo - bh)) z.state = 'reaccionó';
      }
    }
    return zones;
  }

  // Bandas pegadas suman puntos: dos zonas se unen si el hueco entre ellas no supera el ancho de la
  // mayor (en el video: "limpia 13 + 9 = 22 puntos"). Se calcula sobre las zonas que se muestran.
  function blocks(zones) {
    const z = zones.slice().sort((a, b) => a.lo - b.lo);
    let start = 0;
    for (let i = 1; i <= z.length; i++) {
      if (i < z.length && z[i].lo - z[i - 1].hi <= Math.max(z[i].hi - z[i].lo, z[i - 1].hi - z[i - 1].lo)) continue;
      const sum = z.slice(start, i).reduce((s, x) => s + x.pts, 0);
      for (let j = start; j < i; j++) z[j].block = i - start > 1 ? Math.round(sum * 10) / 10 : null;
      start = i;
    }
    return zones;
  }

  // Señales sin mirar el futuro: en cada vela se usan las zonas que existían en ese momento (se
  // recalculan cada vez que se confirma un impulso nuevo).
  //  · Pinchazo: la vela entra en la zona y cierra afuera, del lado del que vino.
  //  · Limpieza: el precio cerró del otro lado de la zona y vuelve a cerrar adentro o del lado original.
  // Una señal por zona: la de su primera visita después de formarse (la que más respeta el precio).
  // Con `o.hull` (serie del Hull Suite) se descartan las señales contra su tendencia: compras solo con el
  // Hull alcista (hull > hull de 2 velas atrás, la misma regla que colorea el Hull) y ventas solo bajista.
  // Stop detrás del extremo (mecha o barrido) y objetivo en la zona opuesta más cercana (o 3R si no hay).
  function signals(k, imps, P, o, minPts) {
    const out = [], confs = [...new Set(imps.map((m) => m.conf))].sort((a, b) => a - b);
    const buf = 0.1 * P.atr / 100;
    let zones = [], next = 0, swept = new Map(), used = new Set();
    for (let i = 1; i < k.length; i++) {
      if (next < confs.length && confs[next] <= i) {
        while (next < confs.length && confs[next] <= i) next++;
        zones = zonesAt(k, imps, i, P, o).filter((z) => z.pts >= minPts);
        swept = new Map();
      }
      const c = k[i], p = k[i - 1];
      for (const z of zones) {
        // Barrido: cierra del otro lado después de haber estado del lado opuesto en las últimas velas
        // (la banda se recorrió entera). Se sigue el extremo mientras dure, hasta `sweepBars` velas.
        const crossedFrom = (above) => { for (let j = Math.max(0, i - o.sweepBars); j < i; j++) if (above ? k[j].c > z.hi : k[j].c < z.lo) return true; return false; };
        const dn = swept.get(z.id + 'd'), up = swept.get(z.id + 'u');
        if (c.c < z.lo) {
          if (dn && i - dn.i <= o.sweepBars) dn.x = Math.min(dn.x, c.l);
          else if (p.c >= z.lo && crossedFrom(true)) swept.set(z.id + 'd', { i, x: c.l });
        }
        if (c.c > z.hi) {
          if (up && i - up.i <= o.sweepBars) up.x = Math.max(up.x, c.h);
          else if (p.c <= z.hi && crossedFrom(false)) swept.set(z.id + 'u', { i, x: c.h });
        }
        if (used.has(z.id) || i <= z.born) continue;
        let kind = null, stop = null;
        const sup = z.mid < p.c, bw = z.hi - z.lo;   // soporte si el precio venía desde arriba
        if (sup && c.l <= z.hi && c.l >= z.lo - bw && c.c > z.hi) { kind = 'pinchazo'; stop = c.l * (1 - buf); }
        else if (!sup && c.h >= z.lo && c.h <= z.hi + bw && c.c < z.lo) { kind = 'pinchazo'; stop = c.h * (1 + buf); }
        else if (dn && dn.i < i && i - dn.i <= o.sweepBars && c.c > z.lo && p.c <= z.lo) { kind = 'limpieza'; stop = Math.min(dn.x, c.l) * (1 - buf); swept.delete(z.id + 'd'); }
        else if (up && up.i < i && i - up.i <= o.sweepBars && c.c < z.hi && p.c >= z.hi) { kind = 'limpieza'; stop = Math.max(up.x, c.h) * (1 + buf); swept.delete(z.id + 'u'); }
        if (!kind) { if (c.l <= z.hi && c.h >= z.lo && !swept.has(z.id + 'd') && !swept.has(z.id + 'u')) used.add(z.id); continue; }
        const long = stop < c.c, entry = c.c, risk = Math.abs(entry - stop);
        if (!(risk > 0)) continue;
        if (o.hull) {
          const h = o.hull[i], h2 = o.hull[i - 2];
          if (!ok(h) || !ok(h2) || (long ? h <= h2 : h >= h2)) { used.add(z.id); continue; }   // contra el Hull: se descarta (la visita cuenta igual)
        }
        const opp = zones.filter((x) => (long ? x.lo > entry + risk * 0.5 : x.hi < entry - risk * 0.5)).sort((a, b) => (long ? a.lo - b.lo : b.hi - a.hi))[0];
        const target = opp ? (long ? opp.lo : opp.hi) : entry + (long ? 3 : -3) * risk;
        out.push({ i, t: c.t, kind, long, entry, stop, target, rr: Math.abs(target - entry) / risk, zone: { lo: z.lo, hi: z.hi, pts: z.pts }, ...outcome(k, i, long, entry, stop, target, o.horizon) });
        used.add(z.id);
      }
    }
    return out;
  }
  // Resultado: si toca el stop o el objetivo primero (con los dos en la misma vela, cuenta el stop),
  // y cuántas R llegó a recorrer a favor antes de salir.
  function outcome(k, i, long, entry, stop, target, horizon) {
    const risk = Math.abs(entry - stop);
    let best = 0;
    for (let j = i + 1; j < Math.min(k.length, i + 1 + horizon); j++) {
      const c = k[j], fav = long ? (c.h - entry) / risk : (entry - c.l) / risk;
      const hitStop = long ? c.l <= stop : c.h >= stop, hitTp = long ? c.h >= target : c.l <= target;
      if (hitStop) return { res: 'stop', r: -1, best, end: j };
      best = Math.max(best, fav);
      if (hitTp) return { res: 'objetivo', r: Math.abs(target - entry) / risk, best, end: j };
    }
    return { res: 'abierta', r: long ? (k[k.length - 1].c - entry) / risk : (entry - k[k.length - 1].c) / risk, best, end: null };
  }
  function stats(sigs) {
    const done = sigs.filter((s) => s.res !== 'abierta'), n = done.length;
    if (!n) return { n: 0, open: sigs.length };
    const pct = (f) => Math.round(done.filter(f).length / n * 100);
    return {
      n, open: sigs.length - n,
      r1: pct((s) => s.best >= 1 || (s.res === 'objetivo' && s.r >= 1)),
      r3: pct((s) => s.best >= 3 || (s.res === 'objetivo' && s.r >= 3)),
      tp: pct((s) => s.res === 'objetivo'), stop: pct((s) => s.res === 'stop'),
      exp: Math.round(done.reduce((a, s) => a + s.r, 0) / n * 100) / 100
    };
  }

  // Todo junto para un corte: zonas al corte (con estado, bloques y filtros) y señales históricas.
  function analyze(k, osc, tf, cut, opt = {}) {
    const o = { ...DEF, ...opt }, P = params(k, tf);
    const at = clamp(cut == null ? k.length - 1 : cut, 1, k.length - 1);
    const imps = impulses(k, osc, P, o);
    const all = states(k, zonesAt(k, imps, at, P, o), at);
    const zones = blocks(all.filter((z) => z.pts >= o.minPts && (!o.hideWorked || z.state !== 'trabajada')));
    const sigs = signals(k, imps, P, o, o.minPts);
    return { P, at, imps, known: imps.filter((m) => m.conf <= at), zones, all, sigs, stats: stats(sigs.filter((s) => s.i <= at)) };
  }

  root.NivelesMath = { FIBO, params, pivots, impulses, zonesAt, states, blocks, signals, outcome, stats, analyze, DEF };
})(typeof window !== 'undefined' ? window : globalThis);
