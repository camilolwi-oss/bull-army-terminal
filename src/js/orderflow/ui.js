// Order Flow · footprint (mapa de delta o perfil de volumen), naked POC, CVD, open interest y VWAP anclados.
// Fuente híbrida: Binance Futures si el mercado cotiza ahí (con historia), si no Hyperliquid (en vivo desde que se abre).
// env: { live, CAT, loadCatalog, hlPost, makePicker, labelOf }
window.createOrderFlow = function createOrderFlow(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const M = window.OrderFlowMath;
  const BN = 'https://fapi.binance.com';
  const TF = { '1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5 };
  const BARS = 500, BACKFILL_REQ = 40;
  const VWAP_COL = { D: '#C9A227', W: '#29E6C9', M: '#9085E9', Q: '#FF4F7B', Y: '#ECE9E2' };
  const VWAP_NAME = { D: 'diario', W: 'semanal', M: 'mensual', Q: 'trimestral', Y: 'anual' };
  const COL = { bg: '#0B0B0C', grid: '#17171A', line: '#25252A', text: '#8E8B84', faint: '#5B5953', fg: '#ECE9E2', up: '#7FAF7F', dn: '#C8704F', buy: '#2FBF71', sell: '#E5484D', gold: '#C9A227' };

  const KEY = 'baOrderflow';
  let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
  const S = { symbol: 'BTC', tf: '1m', profile: false, naked: true, cvd: true, oi: true, vwap: { D: true, W: false, M: false, Q: false, Y: false }, ...(saved || {}) };
  if (!TF[S.tf]) S.tf = '1m';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ symbol: S.symbol, tf: S.tf, profile: S.profile, naked: S.naked, cvd: S.cvd, oi: S.oi, vwap: S.vwap })); } catch {} };

  // Datos del mercado abierto
  let D = null, token = 0, ws = null, wsTimer = null, oiTimer = null, vwTimer = null, visible = false;
  const BAR_W = 36;   // zoom inicial: suficiente para leer el mapa de delta de cada vela
  const view = { barW: BAR_W, offset: 0, hover: null, drag: null };

  // ── Utilidades ───────────────────────────────────────────────────────
  const market = (a) => env.CAT.byAlias.get(a);
  const real = (a) => env.CAT.realOf.get(a) || a;
  // Perps de Hyperliquid → símbolo de Binance (los "k" de Hyperliquid son "1000" en Binance).
  const binanceSymbol = (a) => { const m = market(a); if (!m || m.group !== 'perp') return null; return m.real.replace(/^k(?=[A-Z])/, '1000') + 'USDT'; };
  const decs = (p) => (p > 0 ? Math.min(8, Math.max(0, 4 - Math.floor(Math.log10(p)))) : 2);
  const fmt = (p, d = decs(Math.abs(p))) => (Number.isFinite(p) ? p.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const fmtQ = (q) => { const a = Math.abs(q); return a >= 1e6 ? fmt(q / 1e6, 2) + ' M' : a >= 1e3 ? fmt(q / 1e3, 1) + ' K' : fmt(q, a >= 100 ? 0 : a >= 1 ? 2 : 4); };
  const fmtStep = (s) => s.toLocaleString('es-AR', { maximumFractionDigits: 8 });
  const hm = (t) => new Date(t).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const getJSON = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Carga de un mercado ─────────────────────────────────────────────
  async function load() {
    const my = ++token; closeWs(); clearInterval(oiTimer); clearInterval(vwTimer);
    D = null; status('Cargando…'); queueDraw();
    const tfMs = TF[S.tf], bsym = binanceSymbol(S.symbol);
    let source = 'hl', candles = null;
    if (bsym) {
      try {
        const k = await getJSON(`${BN}/fapi/v1/klines?symbol=${bsym}&interval=${S.tf}&limit=${BARS}`);
        candles = k.map((x) => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], buy: +x[9] }));
        source = 'binance';
      } catch {}
    }
    if (!candles) {
      const now = Date.now();
      const r = await env.hlPost({ type: 'candleSnapshot', req: { coin: real(S.symbol), interval: S.tf, startTime: now - BARS * tfMs, endTime: now } }).catch(() => []);
      candles = (r || []).map((x) => ({ t: +x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v }));
    }
    if (my !== token) return;
    if (!candles.length) { status('No hay datos para este mercado en esta temporalidad.'); return; }
    D = { source, bsym, tfMs, candles, fp: M.createFootprint(tfMs, M.autoStep(candles)), oi: [], vwap: {}, trades: 0, liveFrom: Date.now(), backfillFrom: null };
    view.offset = 0;
    openWs(my);
    if (source === 'binance') backfill(my);
    loadOI(my); loadVwaps(my);
    oiTimer = setInterval(() => loadOI(my, true), 60000);
    vwTimer = setInterval(() => loadVwaps(my), 5 * 60000);
    status(); queueDraw();
  }

  // Binance: las operaciones más recientes hacia atrás, de a 1000, hasta el tope de pedidos o el inicio de las velas.
  async function backfill(my) {
    let fromId = null, n = 0;
    while (n < BACKFILL_REQ && my === token) {
      const url = `${BN}/fapi/v1/aggTrades?symbol=${D.bsym}&limit=1000` + (fromId != null ? `&fromId=${fromId}` : '');
      let rows; try { rows = await getJSON(url); } catch { await sleep(1500); n++; continue; }
      if (my !== token || !rows.length) break;
      for (const x of rows) if (D.fp.add({ t: x.T, px: +x.p, qty: +x.q, buy: !x.m }, x.a)) D.trades++;
      D.backfillFrom = rows[0].T;
      n++;
      if (n % 4 === 0) { status(); queueDraw(); }
      if (rows[0].T <= D.candles[0].t || rows[0].a <= 0) break;
      fromId = Math.max(0, rows[0].a - 1000);
      await sleep(120);
    }
    if (my === token) { status(); queueDraw(); }
  }

  // Open interest: Binance con historia (cada 5 min, o la temporalidad si es mayor) + valor actual; Hyperliquid en vivo.
  async function loadOI(my, onlyNow) {
    try {
      if (D.source === 'binance') {
        if (!onlyNow) {
          const period = D.tfMs >= 36e5 ? '1h' : D.tfMs >= 18e5 ? '30m' : D.tfMs >= 9e5 ? '15m' : '5m';
          const h = await getJSON(`${BN}/futures/data/openInterestHist?symbol=${D.bsym}&period=${period}&limit=500`);
          if (my !== token) return;
          D.oi = h.map((x) => ({ t: +x.timestamp, v: +x.sumOpenInterest }));
        }
        const cur = await getJSON(`${BN}/fapi/v1/openInterest?symbol=${D.bsym}`);
        if (my !== token) return;
        D.oi.push({ t: +cur.time, v: +cur.openInterest });
      } else if (!onlyNow) {
        const [meta, ctx] = await env.hlPost({ type: 'metaAndAssetCtxs', dex: market(S.symbol)?.dex || undefined });
        const i = meta.universe.findIndex((u) => u.name === real(S.symbol));
        if (my !== token) return;
        if (i >= 0 && ctx[i]) D.oi.push({ t: Date.now(), v: +ctx[i].openInterest });
      }
      queueDraw();
    } catch {}
  }

  // VWAP: para cada ancla activa, velas de la resolución más fina que cubra desde el ancla de la primera vela visible.
  async function loadVwaps(my) {
    const ivs = [['1m', 6e4], ['5m', 3e5], ['15m', 9e5], ['1h', 36e5], ['4h', 144e5], ['1d', 864e5]];
    for (const kind of Object.keys(S.vwap)) {
      if (!S.vwap[kind] || !D) continue;
      const start = M.anchorStart(D.candles[0].t, kind), span = Date.now() - start;
      const [iv] = ivs.find(([, ms]) => span / ms <= 1400) || ivs[ivs.length - 1];
      try {
        let base;
        if (D.source === 'binance') {
          const k = await getJSON(`${BN}/fapi/v1/klines?symbol=${D.bsym}&interval=${iv}&startTime=${start}&limit=1500`);
          base = k.map((x) => ({ t: x[0], h: +x[2], l: +x[3], c: +x[4], v: +x[5] }));
        } else {
          const r = await env.hlPost({ type: 'candleSnapshot', req: { coin: real(S.symbol), interval: iv, startTime: start, endTime: Date.now() } });
          base = (r || []).map((x) => ({ t: +x.t, h: +x.h, l: +x.l, c: +x.c, v: +x.v }));
        }
        if (my !== token) return;
        D.vwap[kind] = M.vwapSeries(base, kind);
        queueDraw();
      } catch {}
    }
  }

  // ── En vivo ──────────────────────────────────────────────────────────
  function applyCandle(k) {
    const cs = D.candles, last = cs[cs.length - 1];
    if (k.t === last.t) Object.assign(last, k);
    else if (k.t > last.t) { cs.push(k); if (cs.length > BARS + 200) cs.shift(); if (view.offset > 0) view.offset++; }
  }
  function openWs(my) {
    if (!visible || !D) return;
    if (D.source === 'binance') {
      const s = D.bsym.toLowerCase();
      const w = ws = new WebSocket(`wss://fstream.binance.com/stream?streams=${s}@aggTrade/${s}@kline_${S.tf}`);
      w.onmessage = (e) => {
        if (my !== token) return;
        const { data: d } = JSON.parse(e.data);
        if (d.e === 'aggTrade') { if (D.fp.add({ t: d.T, px: +d.p, qty: +d.q, buy: !d.m }, d.a)) D.trades++; }
        else if (d.e === 'kline') { const k = d.k; applyCandle({ t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, buy: +k.V }); }
        queueDraw();
      };
      w.onclose = () => { if (ws === w && visible && my === token) setTimeout(() => openWs(my), 3000); };
    } else {
      const coin = real(S.symbol);
      const w = ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
      w.onopen = () => {
        for (const sub of [{ type: 'trades', coin }, { type: 'candle', coin, interval: S.tf }, { type: 'activeAssetCtx', coin }]) w.send(JSON.stringify({ method: 'subscribe', subscription: sub }));
        wsTimer = setInterval(() => { try { w.send('{"method":"ping"}'); } catch {} }, 50000);
      };
      w.onmessage = (e) => {
        if (my !== token) return;
        const m = JSON.parse(e.data);
        if (m.channel === 'trades') for (const x of m.data) { if (x.time >= D.liveFrom && D.fp.add({ t: x.time, px: +x.px, qty: +x.sz, buy: x.side === 'B' }, x.tid)) D.trades++; }
        else if (m.channel === 'candle') { const k = m.data; if (k.i === S.tf) applyCandle({ t: +k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v }); }
        else if (m.channel === 'activeAssetCtx' && m.data.ctx) { const v = +m.data.ctx.openInterest, last = D.oi[D.oi.length - 1]; if (!last || Date.now() - last.t > 15000 || last.v !== v) D.oi.push({ t: Date.now(), v }); }
        else return;
        queueDraw();
      };
      w.onclose = () => { clearInterval(wsTimer); if (ws === w && visible && my === token) setTimeout(() => openWs(my), 3000); };
    }
  }
  function closeWs() { const w = ws; ws = null; clearInterval(wsTimer); if (w) try { w.close(); } catch {} }

  function status(msg) {
    if (msg) { $('ofStatus').textContent = msg; return; }
    if (!D) return;
    const name = env.labelOf(S.symbol);
    $('ofStatus').innerHTML = D.source === 'binance'
      ? `<b>${name}</b> · fuente <b>Binance Futures ${D.bsym}</b> · footprint ${D.backfillFrom ? `desde las ${hm(D.backfillFrom)}` : 'cargando historia…'} (${D.trades.toLocaleString('es-AR')} operaciones) y en vivo · nivel de precio ${fmtStep(D.fp.step)}. Los precios de Binance pueden diferir levemente de Hyperliquid.`
      : `<b>${name}</b> · fuente <b>Hyperliquid</b> · footprint y CVD en vivo desde las ${hm(D.liveFrom)} (este mercado no cotiza en Binance y Hyperliquid no ofrece historial de operaciones) · nivel de precio ${fmtStep(D.fp.step)}.`;
  }

  // ── Dibujo ───────────────────────────────────────────────────────────
  let queued = false;
  function queueDraw() { if (queued || !visible) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); }
  function draw() {
    const cv = $('ofCv'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    g.font = '11px "IBM Plex Mono", ui-monospace, monospace'; g.textBaseline = 'middle';
    if (!D) return;
    const cs = D.candles, fp = D.fp, AX = 72, TAX = 18, plotW = W - AX;
    const paneH = Math.round(H * 0.15), deltaH = 26;
    const oiH = S.oi ? paneH : 0, cvdH = S.cvd ? paneH : 0;
    const mainTop = 6, mainBot = H - TAX - oiH - cvdH - deltaH - 6;
    const dTop = mainBot + 4, cvdTop = dTop + deltaH + 2, oiTop = cvdTop + cvdH;
    const n = Math.max(5, Math.floor(plotW / view.barW));
    view.offset = Math.max(0, Math.min(view.offset, cs.length - 5));
    const end = cs.length - view.offset, s0 = Math.max(0, end - n);
    const bw = view.barW, x = (i) => plotW - (end - i - 0.5) * bw;

    // Escala de precio (velas visibles)
    let lo = Infinity, hi = -Infinity;
    for (let i = s0; i < end; i++) { lo = Math.min(lo, cs[i].l); hi = Math.max(hi, cs[i].h); }
    const pad = (hi - lo) * 0.06 || hi * 0.001; lo -= pad; hi += pad;
    const y = (p) => mainTop + (hi - p) / (hi - lo) * (mainBot - mainTop);

    // Grilla y eje
    const st = M.niceStep((hi - lo) / 6), dd = Math.max(0, -Math.floor(Math.log10(st)) + 1);
    for (let p = Math.ceil(lo / st) * st; p < hi; p += st) {
      const yy = Math.round(y(p)) + 0.5; g.strokeStyle = COL.grid; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke();
      g.fillStyle = COL.faint; g.textAlign = 'left'; g.fillText(fmt(p, Math.min(8, dd)), plotW + 6, yy);
    }

    // VWAP anclados (recortados al panel de precio; si quedan fuera, flecha con el valor en el borde)
    g.save(); g.beginPath(); g.rect(0, mainTop, plotW, mainBot - mainTop); g.clip();
    const offscreen = [];
    for (const kind of Object.keys(S.vwap)) {
      const ser = S.vwap[kind] && D.vwap[kind]; if (!ser || !ser.length) continue;
      g.strokeStyle = VWAP_COL[kind]; g.lineWidth = 1.6; g.beginPath();
      let prevA = null, lastY = null, lastV = null;
      for (let i = s0; i < end; i++) {
        const v = M.vwapAt(ser, cs[i].t + D.tfMs - 1); if (!v) { prevA = null; continue; }
        const yy = y(v.vwap);
        if (v.anchor !== prevA) g.moveTo(x(i) - bw / 2, yy); else g.lineTo(x(i), yy);
        prevA = v.anchor; lastY = yy; lastV = v.vwap;
      }
      g.stroke();
      if (lastY != null) {
        if (lastY < mainTop || lastY > mainBot) offscreen.push({ kind, up: lastY < mainTop, v: lastV });
        else { g.fillStyle = VWAP_COL[kind]; g.textAlign = 'right'; g.fillText('VWAP ' + kind, plotW - 4, lastY - 8); }
      }
    }
    g.restore();
    offscreen.forEach((o, j) => {
      g.fillStyle = VWAP_COL[o.kind]; g.textAlign = 'right';
      const yy = o.up ? mainTop + 10 + j * 14 : mainBot - 8 - j * 14;
      g.fillText(`${o.up ? '▲' : '▼'} VWAP ${o.kind} ${fmt(o.v)}`, plotW - 4, yy);
    });

    // Velas + footprint
    // El footprint arranca en la primera vela completa (la historia o el en vivo empiezan a mitad de una vela).
    const fpStart = Math.ceil((D.source === 'binance' ? (D.backfillFrom ?? Infinity) : D.liveFrom) / D.tfMs) * D.tfMs;
    const cellW = Math.max(1, bw * 0.86), canFp = bw >= 3;
    for (let i = s0; i < end; i++) {
      const k = cs[i], xc = x(i), v = canFp && k.t >= fpStart ? fp.view(k.t) : null, up = k.c >= k.o;
      if (v) {
        const left = xc - cellW / 2 + 3;
        for (const lv of v.levels) {
          const y0 = y(lv.px + fp.step), y1 = y(lv.px), hh = Math.max(1, y1 - y0 - (y1 - y0 > 3 ? 1 : 0));
          if (S.profile) {
            const wv = (cellW - 4) * lv.vol / v.maxVol, wb = wv * lv.buy / (lv.vol || 1);
            g.fillStyle = hexA(COL.buy, 0.75); g.fillRect(left, y0, wb, hh);
            g.fillStyle = hexA(COL.sell, 0.75); g.fillRect(left + wb, y0, wv - wb, hh);
          } else {
            const a = 0.12 + 0.8 * Math.abs(lv.delta) / (v.maxAbs || 1);
            g.fillStyle = hexA(lv.delta >= 0 ? COL.buy : COL.sell, a); g.fillRect(left, y0, cellW - 4, hh);
          }
          if (lv.px === v.poc) { g.strokeStyle = COL.gold; g.lineWidth = 1; g.strokeRect(left + 0.5, y0 + 0.5, (S.profile ? (cellW - 4) : cellW - 4) - 1, Math.max(1, hh - 1)); }
        }
        // Vela fina a la izquierda de la celda
        g.strokeStyle = g.fillStyle = up ? COL.up : COL.dn; g.lineWidth = 1;
        const xl = Math.round(xc - cellW / 2) + 1.5;
        g.beginPath(); g.moveTo(xl, y(k.h)); g.lineTo(xl, y(k.l)); g.stroke();
        g.fillRect(xl - 1, y(Math.max(k.o, k.c)), 2, Math.max(1, y(Math.min(k.o, k.c)) - y(Math.max(k.o, k.c))));
      } else {
        const body = Math.max(1, Math.floor(bw * 0.6)), xx = Math.round(xc) + 0.5;
        g.strokeStyle = g.fillStyle = up ? COL.up : COL.dn; g.lineWidth = 1;
        g.beginPath(); g.moveTo(xx, y(k.h)); g.lineTo(xx, y(k.l)); g.stroke();
        const yt = y(Math.max(k.o, k.c)); g.fillRect(xx - body / 2, yt, body, Math.max(1, y(Math.min(k.o, k.c)) - yt));
      }
    }

    // Naked POC: línea punteada dorada desde la vela hasta el borde derecho
    if (S.naked) {
      g.setLineDash([4, 3]); g.strokeStyle = hexA(COL.gold, 0.85); g.lineWidth = 1;
      for (const p of M.nakedPocs(cs, fp, fpStart)) {
        if (p.i >= end) continue;
        const yy = Math.round(y(p.px)) + 0.5; if (yy < mainTop || yy > mainBot) continue;
        g.beginPath(); g.moveTo(Math.max(0, x(p.i)), yy); g.lineTo(plotW, yy); g.stroke();
        g.setLineDash([]); g.fillStyle = hexA(COL.gold, 0.9); g.fillRect(plotW + 1, yy - 7, AX - 2, 14);
        g.fillStyle = COL.bg; g.textAlign = 'left'; g.fillText(fmt(p.px), plotW + 5, yy); g.setLineDash([4, 3]);
      }
      g.setLineDash([]);
    }

    // Último precio
    const last = cs[cs.length - 1], ly = y(last.c), lc = last.c >= last.o ? COL.up : COL.dn;
    if (ly > mainTop && ly < mainBot) {
      g.setLineDash([2, 3]); g.strokeStyle = hexA(lc, 0.7); g.beginPath(); g.moveTo(0, Math.round(ly) + 0.5); g.lineTo(plotW, Math.round(ly) + 0.5); g.stroke(); g.setLineDash([]);
      g.fillStyle = lc; g.fillRect(plotW + 1, ly - 8, AX - 2, 16); g.fillStyle = COL.bg; g.textAlign = 'left';
      g.font = '600 11px "IBM Plex Mono", ui-monospace, monospace'; g.fillText(fmt(last.c), plotW + 5, ly); g.font = '11px "IBM Plex Mono", ui-monospace, monospace';
    }

    // Delta por vela (del footprint si hay; si no, de la vela de Binance)
    // Delta: en Binance, el dato oficial de la vela (siempre completo); en Hyperliquid, el footprint en vivo.
    const deltaOf = (k) => { if (Number.isFinite(k.buy)) return 2 * k.buy - k.v; if (k.t < fpStart) return null; const v = fp.view(k.t); return v ? v.delta : null; };
    let dMax = 0; for (let i = s0; i < end; i++) { const d = deltaOf(cs[i]); if (d != null) dMax = Math.max(dMax, Math.abs(d)); }
    const dMid = dTop + deltaH / 2;
    g.strokeStyle = COL.line; g.beginPath(); g.moveTo(0, dTop - 2.5); g.lineTo(W, dTop - 2.5); g.stroke();
    for (let i = s0; i < end; i++) {
      const d = deltaOf(cs[i]); if (d == null || !dMax) continue;
      const hgt = (deltaH / 2 - 1) * Math.abs(d) / dMax; g.fillStyle = d >= 0 ? COL.buy : COL.sell;
      g.fillRect(x(i) - Math.max(1, bw * 0.35), d >= 0 ? dMid - hgt : dMid, Math.max(1, bw * 0.7), Math.max(1, hgt));
    }
    g.fillStyle = COL.faint; g.textAlign = 'left'; g.fillText('Delta', plotW + 6, dMid);

    // CVD
    if (S.cvd) {
      let acc = 0; const vals = [];
      for (let i = s0; i < end; i++) { const d = deltaOf(cs[i]); if (d == null) { vals.push(null); continue; } acc += d; vals.push(acc); }
      paneLine(g, vals, s0, x, cvdTop, cvdH, plotW, 'CVD', true);
    }
    // Open interest (escalonado en el tiempo de cada vela)
    if (S.oi) {
      const vals = [];
      for (let i = s0; i < end; i++) { const tEnd = cs[i].t + D.tfMs; let v = null; for (const o of D.oi) { if (o.t <= tEnd) v = o.v; else break; } vals.push(v); }
      paneLine(g, vals, s0, x, oiTop, oiH, plotW, 'OI', false);
    }

    // Eje de tiempo
    g.fillStyle = COL.faint; g.textAlign = 'center';
    const every = Math.max(1, Math.ceil(90 / bw));
    for (let i = s0; i < end; i++) if (i % every === 0) g.fillText(hm(cs[i].t), x(i), H - TAX / 2);

    // Cursor
    if (view.hover && view.hover.x < plotW) {
      const i = Math.min(end - 1, Math.max(s0, s0 + Math.floor((view.hover.x - (plotW - (end - s0) * bw)) / bw)));
      const k = cs[i], v = k.t >= fpStart ? fp.view(k.t) : null, xx = Math.round(x(i)) + 0.5;
      g.strokeStyle = hexA(COL.fg, 0.3); g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, H - TAX); g.stroke();
      const lines = [`${new Date(k.t).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}  O ${fmt(k.o)} H ${fmt(k.h)} L ${fmt(k.l)} C ${fmt(k.c)}`];
      const d = deltaOf(k); lines.push(`Volumen ${fmtQ(k.v)}` + (d != null ? `  ·  Delta ${d >= 0 ? '+' : ''}${fmtQ(d)}` : '  ·  sin datos de operaciones'));
      if (v && view.hover.y >= mainTop && view.hover.y <= mainBot) {
        const px = M.levelOf(hi - (view.hover.y - mainTop) / (mainBot - mainTop) * (hi - lo), fp.step), lv = v.levels.find((l) => l.px === px);
        if (lv) lines.push(`Nivel ${fmt(lv.px)}: compras ${fmtQ(lv.buy)} · ventas ${fmtQ(lv.sell)} · delta ${lv.delta >= 0 ? '+' : ''}${fmtQ(lv.delta)}` + (lv.px === v.poc ? '  · POC' : ''));
      }
      g.textAlign = 'left'; const tw = Math.max(...lines.map((s) => g.measureText(s).width)) + 14;
      g.fillStyle = hexA(COL.bg, 0.92); g.fillRect(6, 6, tw, lines.length * 16 + 8); g.strokeStyle = COL.line; g.strokeRect(6.5, 6.5, tw, lines.length * 16 + 8);
      g.fillStyle = COL.fg; lines.forEach((s, j) => g.fillText(s, 13, 18 + j * 16));
    }
  }
  function paneLine(g, vals, s0, x, top, h, plotW, label, signed) {
    g.strokeStyle = COL.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, top + 0.5); g.lineTo(plotW + 80, top + 0.5); g.stroke();
    const ok = vals.filter((v) => v != null);
    g.fillStyle = COL.faint; g.textAlign = 'left'; g.fillText(label, 6, top + 10);
    if (ok.length < 2) { g.fillText(label === 'OI' ? 'Juntando datos en vivo…' : 'Sin datos de operaciones todavía', 40, top + 10); return; }
    let lo = Math.min(...ok), hi = Math.max(...ok); if (lo === hi) { lo -= 1; hi += 1; }
    const yy = (v) => top + 6 + (hi - v) / (hi - lo) * (h - 12);
    if (signed && lo < 0 && hi > 0) { g.setLineDash([3, 3]); g.strokeStyle = COL.faint; g.beginPath(); g.moveTo(0, yy(0)); g.lineTo(plotW, yy(0)); g.stroke(); g.setLineDash([]); }
    g.lineWidth = 1.6; let prev = null;
    vals.forEach((v, j) => {
      if (v == null) { prev = null; return; }
      const xx = x(s0 + j);
      if (prev) { g.strokeStyle = v >= prev.v ? '#2FBF71' : '#E5484D'; g.beginPath(); g.moveTo(prev.x, yy(prev.v)); g.lineTo(xx, yy(v)); g.stroke(); }
      prev = { x: xx, v };
    });
    const lastV = ok[ok.length - 1]; g.fillStyle = COL.fg; g.textAlign = 'left'; g.fillText(fmtQ(lastV), plotW + 6, Math.min(top + h - 8, Math.max(top + 8, yy(lastV))));
  }

  // ── Controles ────────────────────────────────────────────────────────
  const picker = env.makePicker('of', { current: () => S.symbol, onPick: (a) => { S.symbol = a; save(); load(); } });
  const pressed = (seg, attr, val) => $(seg).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
  $('ofTf').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.tf === S.tf) return; S.tf = b.dataset.tf; pressed('ofTf', 'tf', S.tf); save(); load(); });
  $('ofMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.profile = b.dataset.m === 'profile'; pressed('ofMode', 'm', b.dataset.m); save(); queueDraw(); });
  for (const [id, k] of [['ofNaked', 'naked'], ['ofCvd', 'cvd'], ['ofOi', 'oi']]) { $(id).checked = S[k]; $(id).addEventListener('change', () => { S[k] = $(id).checked; save(); queueDraw(); }); }
  $('ofVwap').querySelectorAll('input').forEach((inp) => {
    inp.checked = !!S.vwap[inp.value];
    inp.addEventListener('change', () => { S.vwap[inp.value] = inp.checked; save(); if (inp.checked && D) loadVwaps(token); queueDraw(); });
  });
  const cv = $('ofCv');
  cv.addEventListener('wheel', (e) => { e.preventDefault(); view.barW = Math.max(3, Math.min(90, view.barW * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); queueDraw(); }, { passive: false });
  cv.addEventListener('mousedown', (e) => { view.drag = { x: e.clientX, off: view.offset }; });
  window.addEventListener('mouseup', () => { view.drag = null; });
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect(); view.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (view.drag) view.offset = Math.max(0, Math.round(view.drag.off + (e.clientX - view.drag.x) / view.barW));
    queueDraw();
  });
  cv.addEventListener('mouseleave', () => { view.hover = null; queueDraw(); });
  cv.addEventListener('dblclick', () => { view.offset = 0; view.barW = BAR_W; queueDraw(); });
  new ResizeObserver(() => queueDraw()).observe(cv);

  let started = false;
  return {
    async show() {
      visible = true;
      pressed('ofTf', 'tf', S.tf); pressed('ofMode', 'm', S.profile ? 'profile' : 'delta');
      if (!env.live) { status('Order Flow necesita conexión en vivo.'); return; }
      if (!env.CAT.ready) { try { await env.loadCatalog(); } catch {} }
      if (env.CAT.ready && !env.CAT.byAlias.has(S.symbol)) S.symbol = 'BTC';
      picker.render();
      if (!started) { started = true; load(); } else { load(); }
    },
    hide() { visible = false; token++; closeWs(); clearInterval(oiTimer); clearInterval(vwTimer); }
  };
};
