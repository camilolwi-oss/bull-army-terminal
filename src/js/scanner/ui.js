// Scanner · plano cartesiano con los 50 perps de más volumen. Tres vistas: Reversión (estiramiento
// contra giro), Rotación contra BTC (tipo RRG) y Puntaje (alcista contra bajista). Solo velas cerradas.
// env: { live, CAT, loadCatalog, hlPost, labelOf, openAurora(alias, tf) }
window.createScanner = function createScanner(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const A = window.AuroraMath, S = window.ScannerMath, F = window.FlujoMath;
  const WS_URL = 'wss://api.hyperliquid.xyz/ws', BF = 'https://fapi.binance.com';
  const IV_MS = { '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 };
  const TF_AURORA = { '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': '1D' };
  const UNIVERSE = 50, BARS = 150, TAIL = 5, BINANCE_TOP = 15;   // 150 velas: Aurora necesita ~60 para calentar
  const COL = { bg: '#0B0B0C', line: '#25252A', axis: '#3A3936', text: '#8E8B84', fg: '#ECE9E2', bull: '#29E6C9', bear: '#FF4F7B', gold: '#C9A227', grey: '#5B5953' };
  const MODES = {
    rev: {
      x: 'Estiramiento', y: 'Giro', lo: 'sobreventa', hi: 'sobrecompra', ylo: 'cayendo', yhi: 'subiendo',
      quad: [['Reversión alcista', 'sobreventa y girando arriba', COL.bull], ['Tendencia fuerte', 'sobrecompra y subiendo', null], ['Cuchillo cayendo', 'sobreventa y sigue bajando', null], ['Reversión bajista', 'sobrecompra y girando abajo', COL.bear]]
    },
    rrg: {
      x: 'Fuerza relativa vs BTC', y: 'Momentum de la fuerza', lo: 'más débil', hi: 'más fuerte', ylo: 'perdiendo', yhi: 'ganando',
      quad: [['Mejorando', 'débil pero acelerando', COL.bull], ['Liderando', 'fuerte y acelerando', COL.gold], ['Rezagado', 'débil y frenando', null], ['Debilitándose', 'fuerte pero frenando', COL.bear]]
    },
    score: {
      x: 'Puntaje alcista', y: 'Puntaje bajista', lo: '0', hi: '100', ylo: '0', yhi: '100',
      quad: [['Bajista', 'solo señales bajistas', COL.bear], ['Señales mixtas', 'ambos lados', null], ['Sin señal', 'nada destacado', null], ['Alcista', 'solo señales alcistas', COL.bull]]
    }
  };

  // ── Estado ─────────────────────────────────────────────────────────────
  const KEY = 'baScanner';
  let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
  const st = { mode: 'rev', tf: '15m', tails: true, names: true, ...(saved || {}) };
  if (!MODES[st.mode]) st.mode = 'rev';
  if (!IV_MS[st.tf]) st.tf = '15m';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };

  const data = new Map();    // alias → { k:[velas], res, flow, err }
  let universe = [], funding = new Map(), ws = null, wsTimer = null, visible = false, token = 0;
  let loaded = 0, lastCalc = 0, binanceAt = 0, binSet = null, pts = [], hover = null, drawQueued = false, calcTimer = null, binTimer = null;
  const real = (alias) => env.CAT.realOf.get(alias) || alias;
  const nameOf = (alias) => { const m = env.CAT.byAlias.get(alias); return m ? m.real : alias; };
  const toK = (x) => ({ t: +x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v });
  const closedOf = (k) => { const now = Date.now(), ms = IV_MS[st.tf]; let n = k.length; while (n && k[n - 1].t + ms > now) n--; return k.slice(0, n); };

  // ── Datos de Hyperliquid ───────────────────────────────────────────────
  async function loadFunding() {
    try {
      const [meta, ctx] = await env.hlPost({ type: 'metaAndAssetCtxs' });
      funding = new Map(meta.universe.map((u, i) => [u.name, +(ctx[i] || {}).funding]));
    } catch {}
  }
  async function loadOne(alias, my) {
    const now = Date.now();
    try {
      const rows = await env.hlPost({ type: 'candleSnapshot', req: { coin: real(alias), interval: st.tf, startTime: now - BARS * IV_MS[st.tf], endTime: now } });
      if (my !== token) return;
      data.set(alias, { k: (rows || []).map(toK), res: null, flow: null });
    } catch { if (my === token) data.set(alias, { k: [], err: true }); }
    loaded++;
  }
  async function loadAll() {
    const my = ++token;
    data.clear(); loaded = 0; pts = []; binanceAt = 0;
    universe = env.CAT.list.filter((m) => m.group === 'perp').slice(0, UNIVERSE).map((m) => m.alias);
    if (!universe.includes('BTC')) universe.unshift('BTC');
    status(); draw();
    await loadFunding();
    let i = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (i < universe.length && my === token) { await loadOne(universe[i++], my); if (my === token) { status(); schedule(300); } }
    }));
    if (my !== token) return;
    openWs(); compute(); refreshBinance();
  }

  // Velas en vivo por WebSocket: cuando abre una vela nueva, la anterior quedó cerrada y se recalcula.
  function openWs() {
    closeWs();
    const w = new WebSocket(WS_URL); ws = w;
    w.onopen = () => {
      universe.forEach((a) => w.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'candle', coin: real(a), interval: st.tf } })));
      wsTimer = setInterval(() => { try { w.send('{"method":"ping"}'); } catch {} }, 50000);
    };
    w.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.channel !== 'candle' || !m.data || m.data.i !== st.tf) return;
      const alias = universe.find((a) => real(a) === m.data.s);
      const d = alias && data.get(alias);
      if (!d || !d.k.length) return;
      const c = toK(m.data), last = d.k[d.k.length - 1];
      if (c.t === last.t) d.k[d.k.length - 1] = c;
      else if (c.t > last.t) { d.k.push(c); if (d.k.length > BARS + 20) d.k.shift(); schedule(1500); planBinance(); }
    };
    w.onclose = () => { if (ws === w) { ws = null; clearInterval(wsTimer); if (visible) setTimeout(() => visible && !ws && openWs(), 5000); } };
  }
  function closeWs() { const w = ws; ws = null; clearInterval(wsTimer); if (w) try { w.close(); } catch {} }

  // ── Binance: CVD y delta/OI para los mejores candidatos ───────────────
  async function binanceSymbols() {
    binSet = binSet || fetch(BF + '/fapi/v1/ticker/price').then((r) => r.json()).then((a) => new Set(a.map((x) => x.symbol))).catch(() => { binSet = null; return new Set(); });
    return binSet;
  }
  const bsym = (alias) => { const r = real(alias); return (/^k[A-Z]/.test(r) ? '1000' + r.slice(1) : r) + 'USDT'; };
  function planBinance() { clearTimeout(binTimer); binTimer = setTimeout(refreshBinance, 20000); }   // OI de Binance se publica unos segundos después del cierre
  async function refreshBinance() {
    const my = token, set = await binanceSymbols();
    const ranked = [...data.entries()].filter(([a, d]) => d.res && set.has(bsym(a)))
      .sort((p, q) => Math.max(q[1].res.bull, q[1].res.bear) - Math.max(p[1].res.bull, p[1].res.bear)).slice(0, BINANCE_TOP);
    for (const d of data.values()) d.flow = null;
    await Promise.all(ranked.map(async ([alias, d]) => {
      const k = closedOf(d.k); if (k.length < 40) return;
      const sym = bsym(alias), ms = IV_MS[st.tf];
      try {
        const [kl, oi] = await Promise.all([
          fetch(`${BF}/fapi/v1/klines?symbol=${sym}&interval=${st.tf}&startTime=${k[0].t}&limit=${BARS + 5}`).then((r) => r.json()),
          fetch(`${BF}/futures/data/openInterestHist?symbol=${sym}&period=${st.tf}&limit=${Math.min(500, BARS + 5)}`).then((r) => r.json())
        ]);
        if (my !== token) return;
        const now = Date.now();
        const klines = kl.map((r) => ({ t: +r[0], end: +r[6] + 1, v: +r[5], buy: +r[9], final: +r[6] < now }));
        const times = k.map((x) => x.t), b = F.bucketize(times, ms, klines);
        const o = F.oiSeries(times, b.ends, new Map(oi.map((r) => [+r.timestamp, +r.sumOpenInterest])), ms, null);
        // Las señales se guardan por hora de vela: los índices cambian cuando entra una vela nueva.
        const osc = A.compute(k).osc, byT = (e) => ({ ...e, t: times[e.i] });
        d.flow = { sym, arrows: F.arrows(b, o.dOi, k.length).map(byT), divs: F.cvdDivergences(k.map((x) => x.h), k.map((x) => x.l), b.cvd, osc, k.length).map(byT) };
      } catch {}
    }));
    if (my !== token) return;
    binanceAt = Date.now();
    compute();
  }

  // ── Cálculo ────────────────────────────────────────────────────────────
  function schedule(ms) { clearTimeout(calcTimer); calcTimer = setTimeout(compute, ms); }
  function compute() {
    const btc = data.get('BTC'), btcK = btc ? closedOf(btc.k) : [];
    for (const [alias, d] of data) {
      const k = closedOf(d.k);
      if (k.length < 60) { d.res = null; continue; }
      const a = A.compute(k), hull = A.hull(k.map((x) => x.c)), ax = S.axes(k, a);
      const ix = new Map(k.map((x, i) => [x.t, i])), at_ = (e) => ({ ...e, i: ix.has(e.t) ? ix.get(e.t) : -1 });
      const flow = d.flow ? { arrows: d.flow.arrows.map(at_), divs: d.flow.divs.map(at_) } : null;
      const sc = S.scores(k, a, hull, ax, { funding: funding.get(real(alias)), flow });
      const r = alias !== 'BTC' && btcK.length ? S.rrg(k, btcK) : null;
      const n = k.length, idx = Array.from({ length: TAIL + 1 }, (_, j) => n - 1 - TAIL + j).filter((i) => i >= 0);
      const at = (i) => ({
        rev: [ax.stretch[i], ax.turn[i]],
        rrg: r ? [r.x[i], r.y[i]] : [NaN, NaN],
        score: [sc.bull[i], sc.bear[i]]
      });
      d.res = { t: k[n - 1].t, bull: sc.bull[n - 1], bear: sc.bear[n - 1], detail: sc.detail(n - 1), path: idx.map(at), osc: a.osc[n - 1] };
    }
    lastCalc = Date.now();
    status(); ranking(); draw();
  }

  // ── Plano ──────────────────────────────────────────────────────────────
  const cv = $('scCv');
  function range(mode) {
    if (mode === 'rev') return { x0: -100, x1: 100, y0: -100, y1: 100, cx: 0, cy: 0 };
    if (mode === 'score') return { x0: 0, x1: 100, y0: 0, y1: 100, cx: 40, cy: 40 };
    let mx = 0.5, my = 0.5;
    for (const d of data.values()) if (d.res) for (const p of d.res.path) { const [x, y] = p.rrg; if (Number.isFinite(x)) mx = Math.max(mx, Math.abs(x)); if (Number.isFinite(y)) my = Math.max(my, Math.abs(y)); }
    return { x0: -mx * 1.15, x1: mx * 1.15, y0: -my * 1.15, y1: my * 1.15, cx: 0, cy: 0 };
  }
  // Lado al que se inclina el punto (para el color y el tamaño).
  function lean(d) {
    const [x, y] = d.res.path[d.res.path.length - 1][st.mode];
    if (st.mode === 'score') return d.res.bull >= d.res.bear ? 1 : -1;
    if (st.mode === 'rrg') return y >= 0 ? 1 : -1;
    return x <= 0 ? 1 : -1;
  }
  function draw() { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; paint(); }); }
  function paint() {
    if (!visible) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    const M = MODES[st.mode], R = range(st.mode);
    const L = 54, Rr = 18, T = 18, B = 46, pw = W - L - Rr, ph = H - T - B;
    const X = (v) => L + ((v - R.x0) / (R.x1 - R.x0)) * pw, Y = (v) => T + (1 - (v - R.y0) / (R.y1 - R.y0)) * ph;
    const cx = X(R.cx), cy = Y(R.cy);
    // Cuadrantes: [arriba-izq, arriba-der, abajo-izq, abajo-der]
    const boxes = [[L, T, cx - L, cy - T], [cx, T, L + pw - cx, cy - T], [L, cy, cx - L, T + ph - cy], [cx, cy, L + pw - cx, T + ph - cy]];
    boxes.forEach(([x, y, w, h], i) => {
      const q = M.quad[i];
      g.fillStyle = q[2] ? hexA(q[2], 0.07) : 'rgba(255,255,255,0.015)'; g.fillRect(x, y, w, h);
      g.font = '600 13px system-ui, sans-serif'; g.fillStyle = q[2] || COL.text;
      const right = i % 2 === 1, bottom = i > 1;
      g.textAlign = right ? 'right' : 'left';
      const tx = right ? x + w - 10 : x + 10, ty = bottom ? y + h - 26 : y + 20;
      g.fillText(q[0], tx, ty);
      g.font = '11px system-ui, sans-serif'; g.fillStyle = COL.text; g.fillText(q[1], tx, ty + 15);
    });
    // Ejes
    g.strokeStyle = COL.axis; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + 0.5, T); g.lineTo(cx + 0.5, T + ph); g.moveTo(L, cy + 0.5); g.lineTo(L + pw, cy + 0.5); g.stroke();
    g.strokeStyle = COL.line; g.strokeRect(L + 0.5, T + 0.5, pw - 1, ph - 1);
    g.font = '11px ui-monospace, monospace'; g.fillStyle = COL.text; g.textAlign = 'center';
    g.fillText(`${M.lo}  ←  ${M.x}  →  ${M.hi}`, L + pw / 2, H - 14);
    g.save(); g.translate(16, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText(`${M.ylo}  ←  ${M.y}  →  ${M.yhi}`, 0, 0); g.restore();
    const fmtAx = (v) => (st.mode === 'rrg' ? (v > 0 ? '+' : '') + v.toFixed(1) + '%' : Math.round(v));
    g.textAlign = 'center'; [R.x0, R.cx, R.x1].forEach((v, i) => g.fillText(fmtAx(v), i === 0 ? L + 14 : i === 2 ? L + pw - 16 : X(v), T + ph + 14));
    g.textAlign = 'right'; [R.y0, R.cy, R.y1].forEach((v, i) => g.fillText(fmtAx(v), L - 6, i === 0 ? T + ph - 2 : i === 2 ? T + 10 : Y(v) + 4));

    // Puntos: primero los chicos, al final los mejores (quedan arriba).
    pts = [];
    const items = [...data.entries()].filter(([, d]) => d.res && Number.isFinite(d.res.path[d.res.path.length - 1][st.mode][0]))
      .map(([alias, d]) => { const s = lean(d), score = s > 0 ? d.res.bull : d.res.bear; return { alias, d, s, score }; })
      .sort((p, q) => p.score - q.score);
    // Cola y nombre solo para los 14 mejores (y el punto bajo el mouse): con 50 colas no se lee nada.
    const labelSet = new Set(items.slice(-14).map((x) => x.alias)), names = [];
    // En Rotación el color es el del cuadrante; en las otras vistas, el lado al que se inclina si el puntaje alcanza.
    const rrgCol = ([x, y]) => (x < 0 ? (y >= 0 ? COL.bull : COL.grey) : (y >= 0 ? COL.gold : COL.bear));
    for (const it of items) {
      const path = it.d.res.path.map((p) => p[st.mode]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      if (!path.length) continue;
      const col = st.mode === 'rrg' ? rrgCol(path[path.length - 1]) : it.score >= 35 ? (it.s > 0 ? COL.bull : COL.bear) : COL.grey;
      const isHover = hover === it.alias;
      if (st.tails && path.length > 1 && (labelSet.has(it.alias) || isHover)) {
        for (let j = 1; j < path.length; j++) {
          g.strokeStyle = hexA(col, 0.15 + 0.6 * (j / path.length)); g.lineWidth = isHover ? 2.2 : 1.4;
          g.beginPath(); g.moveTo(X(path[j - 1][0]), Y(path[j - 1][1])); g.lineTo(X(path[j][0]), Y(path[j][1])); g.stroke();
          g.fillStyle = hexA(col, 0.25 + 0.5 * (j / path.length));
          g.beginPath(); g.arc(X(path[j - 1][0]), Y(path[j - 1][1]), 1.8, 0, Math.PI * 2); g.fill();
        }
      }
      const [x, y] = path[path.length - 1], px = X(x), py = Y(y), r = 4 + (it.score / 100) * 10;
      g.fillStyle = hexA(col, isHover ? 0.95 : 0.75); g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      if (it.d.flow) { g.strokeStyle = COL.gold; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, r + 2.5, 0, Math.PI * 2); g.stroke(); }
      if (isHover) { g.strokeStyle = COL.fg; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, r + 5, 0, Math.PI * 2); g.stroke(); }
      if (st.names && (labelSet.has(it.alias) || isHover)) names.push({ it, px, py, r, isHover });
      pts.push({ alias: it.alias, x: px, y: py, r });
    }
    // Nombres de mayor a menor puntaje; si uno pisaría a otro ya escrito, prueba a la izquierda y si no, se omite.
    const placed = [];
    g.textBaseline = 'middle';
    for (const n of names.reverse().sort((p, q) => q.isHover - p.isHover)) {
      g.font = (n.isHover ? '600 ' : '') + '11px ui-monospace, monospace';
      const txt = nameOf(n.it.alias), w = g.measureText(txt).width;
      const opts = [[n.px + n.r + 4, n.py], [n.px - n.r - 4 - w, n.py], [n.px - w / 2, n.py - n.r - 9], [n.px - w / 2, n.py + n.r + 9]];
      const spot = opts.find(([x, y]) => x > L && x + w < L + pw && !placed.some((b) => x < b.x + b.w + 3 && x + w + 3 > b.x && Math.abs(y - b.y) < 12));
      if (!spot && !n.isHover) continue;
      const [x, y] = spot || opts[0];
      placed.push({ x, y, w });
      g.fillStyle = n.it.score >= 35 || st.mode === 'rrg' ? COL.fg : COL.text; g.textAlign = 'left';
      g.fillText(txt, x, y);
    }
    g.textBaseline = 'alphabetic';
    if (!items.length) {
      g.font = '13px system-ui, sans-serif'; g.fillStyle = COL.text; g.textAlign = 'center';
      g.fillText(env.live ? 'Cargando mercados…' : 'El scanner necesita datos en vivo de Hyperliquid.', L + pw / 2, T + ph / 2 - 30);
    }
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  // ── Tooltip, ranking y estado ──────────────────────────────────────────
  const tip = $('scTip');
  const fmtV = (v) => (Number.isFinite(v) ? (st.mode === 'rrg' ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : Math.round(v)) : '—');
  function reasons(side) {
    return side.parts.map((p) => `<li class="${p.pts > 0 ? 'on' : ''}"><span>${p.pts > 0 ? '✓' : '·'}</span>${p.label}<b>${p.pts > 0 ? '+' + Math.round(p.pts) : ''}</b></li>`).join('');
  }
  function showTip(alias, mx, my) {
    const d = data.get(alias); if (!d || !d.res) { tip.hidden = true; return; }
    const M = MODES[st.mode], [x, y] = d.res.path[d.res.path.length - 1][st.mode];
    const bull = d.res.detail.bull, bear = d.res.detail.bear, main = bull.score >= bear.score ? 1 : -1;
    tip.innerHTML = `<div class="sc-tip-h"><b>${env.labelOf(alias)}</b><span>${M.x}: ${fmtV(x)} · ${M.y}: ${fmtV(y)}</span></div>
      <div class="sc-tip-s"><span class="bull">Alcista ${bull.score}</span><span class="bear">Bajista ${bear.score}</span>${d.flow ? '<span class="bin">Binance ✓</span>' : ''}</div>
      <ul>${reasons(main > 0 ? bull : bear)}</ul><p>Clic para abrirlo en Aurora</p>`;
    tip.hidden = false;
    const box = cv.parentElement.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.min(mx + 16, box.width - tw - 8) + 'px';
    tip.style.top = Math.max(8, Math.min(my + 16, box.height - th - 8)) + 'px';
  }
  function hit(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = Infinity;
    for (const p of pts) { const dd = Math.hypot(p.x - x, p.y - y); if (dd <= p.r + 6 && dd < bd) { bd = dd; best = p; } }
    return { best, x, y };
  }
  cv.addEventListener('mousemove', (e) => {
    const { best, x, y } = hit(e), a = best ? best.alias : null;
    if (a !== hover) { hover = a; draw(); }
    cv.style.cursor = a ? 'pointer' : 'default';
    if (a) showTip(a, x, y); else tip.hidden = true;
  });
  cv.addEventListener('mouseleave', () => { hover = null; tip.hidden = true; draw(); });
  cv.addEventListener('click', (e) => { const { best } = hit(e); if (best) env.openAurora(best.alias, TF_AURORA[st.tf]); });

  function ranking() {
    const rows = [...data.entries()].filter(([, d]) => d.res);
    const list = (side) => rows.map(([alias, d]) => ({ alias, d, s: side > 0 ? d.res.bull : d.res.bear }))
      .filter((x) => x.s >= 20).sort((p, q) => q.s - p.s).slice(0, 5)
      .map(({ alias, d, s }) => {
        const det = side > 0 ? d.res.detail.bull : d.res.detail.bear;
        const why = det.parts.filter((p) => p.pts > 0).sort((p, q) => q.pts - p.pts).slice(0, 3).map((p) => p.label).join(' · ');
        return `<li><button type="button" data-a="${alias}"><span class="sc-n">${nameOf(alias)}${d.flow ? ' <i title="Confirmado con datos de Binance">B</i>' : ''}</span><span class="sc-s ${side > 0 ? 'bull' : 'bear'}">${s}</span><span class="sc-w">${why || '—'}</span></button></li>`;
      }).join('') || '<li class="sc-empty">Sin candidatos con puntaje suficiente.</li>';
    $('scBull').innerHTML = list(1); $('scBear').innerHTML = list(-1);
  }
  ['scBull', 'scBear'].forEach((id) => $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]'); if (b) env.openAurora(b.dataset.a, TF_AURORA[st.tf]);
  }));
  function status() {
    const hm = (t) => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const parts = [];
    if (loaded < universe.length) parts.push(`Cargando ${loaded}/${universe.length} mercados…`);
    else if (lastCalc) parts.push(`<b>${[...data.values()].filter((d) => d.res).length} perps</b> de más volumen · ${st.tf.toUpperCase()} · velas cerradas · actualizado ${hm(lastCalc)}`);
    if (binanceAt) parts.push(`Binance: ${[...data.values()].filter((d) => d.flow).length} candidatos confirmados (anillo dorado)`);
    $('scStatus').innerHTML = parts.join(' · ');
  }

  // ── Controles ──────────────────────────────────────────────────────────
  function syncControls() {
    document.querySelectorAll('#scMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
    document.querySelectorAll('#scTf button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === st.tf)));
    $('scTails').checked = st.tails; $('scNames').checked = st.names;
  }
  $('scMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.m === st.mode) return; st.mode = b.dataset.m; save(); syncControls(); draw(); });
  $('scTf').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.tf === st.tf) return;
    st.tf = b.dataset.tf; save(); syncControls(); closeWs(); loadAll();
  });
  $('scTails').addEventListener('change', (e) => { st.tails = e.target.checked; save(); draw(); });
  $('scNames').addEventListener('change', (e) => { st.names = e.target.checked; save(); draw(); });
  window.addEventListener('resize', () => visible && draw());
  syncControls();

  let started = false, hiddenAt = 0;
  return {
    async show() {
      visible = true; draw();
      if (!env.live) { status(); return; }
      if (!started) {
        started = true;
        if (!env.CAT.ready) { try { await env.loadCatalog(); } catch {} }
        loadAll();
      } else if (hiddenAt && Date.now() - hiddenAt > IV_MS[st.tf]) loadAll();   // se perdió al menos una vela: datos nuevos
      else if (!ws && universe.length) { openWs(); schedule(500); }
      hiddenAt = 0;
    },
    hide() { if (visible) hiddenAt = Date.now(); visible = false; closeWs(); tip.hidden = true; }
  };
};
