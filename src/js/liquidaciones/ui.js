// Liquidaciones · interfaz. Se crea recién cuando se abre la pestaña.
// env: { live, hlPost, CAT, loadCatalog, makePicker, labelOf, aliasKey, snapshot() }
window.createLiqMap = function createLiqMap(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LM = window.LiqMath;
  const src = window.createLiqSource(env);
  const css = getComputedStyle($('panel-liq'));
  const C = (n, d) => css.getPropertyValue(n).trim() || d;
  const COL = { fg:C('--fg','#ECE9E2'), muted:C('--muted','#8E8B84'), faint:C('--faint','#5B5953'), line:C('--line','#25252A'),
    gold:C('--gold','#C9A227'), long:C('--bear','#C8704F'), short:C('--bull','#7FAF7F'), surface:C('--surface','#121214') };
  const FONT = '11px "IBM Plex Mono", ui-monospace, monospace';
  const S = { coin: 'BTC', ctx: {}, map: null, hover: null, drawQ: false };
  try { const c = localStorage.getItem('baLiqCoin'); if (c) S.coin = c; } catch {}
  // S.coin es el alias del catálogo (como en Aurora); para Hyperliquid se usa su nombre real (xyz:NVDA, @107…).
  const mkt = () => env.CAT && env.CAT.byAlias.get(S.coin);
  const real = () => (env.CAT && env.CAT.realOf.get(S.coin)) || S.coin;
  // Las wallets se escanean en los perps principales; en HIP-3 y spot el mapa usa el Modelo.
  const walletsOk = () => { const m = mkt(); return !m || m.group === 'perp'; };
  const ctxOf = () => S.ctx[real()] || (mkt() && mkt().px ? { mark: mkt().px, oi: 0 } : null);

  // ── Formatos ───────────────────────────────────────────────────────────
  const nf = (v, d) => v.toLocaleString('es-AR', { minimumFractionDigits:d, maximumFractionDigits:d });
  const usd = (v) => { const a = Math.abs(v); return '$' + (a >= 1e9 ? nf(a / 1e9, 2) + ' B' : a >= 1e6 ? nf(a / 1e6, 1) + ' M' : a >= 1e3 ? nf(a / 1e3, 0) + ' K' : nf(a, 0)); };
  // Eje: sin decimales cuando el número ya es grande, para que entre en el margen.
  const usdAx = (v) => { const a = Math.abs(v), d = (x) => (x >= 10 ? 0 : 1); return '$' + (a >= 1e9 ? nf(a / 1e9, d(a / 1e9)) + ' B' : a >= 1e6 ? nf(a / 1e6, d(a / 1e6)) + ' M' : a >= 1e3 ? nf(a / 1e3, 0) + ' K' : nf(a, 0)); };
  const px = (v) => v >= 1000 ? nf(v, 0) : v >= 10 ? nf(v, 2) : v >= 1 ? nf(v, 3) : v.toLocaleString('es-AR', { maximumSignificantDigits:4 });
  const pct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), 1) + ' %';
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };

  // ── Opciones ───────────────────────────────────────────────────────────
  const opt = () => ({
    rangePct: +$('lqRange').value, bins: +$('lqBins').value, smooth: +$('lqSmooth').value, minUsd: +$('lqMin').value,
    minLev: +$('lqLev').value, side: $('lqSide').value, margin: $('lqMargin').value, scale: $('lqScale').value
  });

  // ── Mercado: precio y open interest ────────────────────────────────────
  async function refreshCtx() {
    if (!env.live) return;
    try {
      const [meta, ctx] = await env.hlPost({ type:'metaAndAssetCtxs' });
      meta.universe.forEach((u, i) => { if (!u.isDelisted) S.ctx[u.name] = { mark: +ctx[i].markPx, oi: +ctx[i].openInterest * +ctx[i].markPx }; });
      // Mercado HIP-3 elegido: su dex tiene su propio precio y open interest.
      const m = mkt();
      if (m && m.dex) { const [dm, dc] = await env.hlPost({ type:'metaAndAssetCtxs', dex: m.dex }); dm.universe.forEach((u, i) => { S.ctx[u.name] = { mark: +dc[i].markPx, oi: +dc[i].openInterest * +dc[i].markPx }; }); }
    } catch {}
  }

  function rebuild() {
    const c = ctxOf();
    const pos = walletsOk() ? src.positions(real()) : [];
    if (!c || !c.mark) { S.map = null; draw(); texts(pos); return; }
    S.map = LM.buildMap(pos, { ...opt(), mark: c.mark });
    texts(pos); tables(); draw();
    if (H.view === 'heat') rebuildHeat();
  }

  function coverage(coin) { const e = src.state.exposure[coin] || 0, oi = (S.ctx[coin] || {}).oi || 0; return oi ? Math.min(100, (e / oi) * 100) : 0; }

  function texts(pos) {
    const st = src.state, m = S.map, o = opt();
    $('lqSymLbl').textContent = env.labelOf ? env.labelOf(S.coin) : S.coin + '-PERP';
    const cov = coverage(real());
    $('lqCap').textContent = `Hyperliquid · ${nf(st.scanned || 0, 0)} cuentas ${st.snapshot ? 'del snapshot' : 'escaneadas'} ${st.t ? ago(st.t) : ''} · ${nf(pos.length, 0)} posiciones con precio de liquidación · cobertura ${nf(cov, 0)} % del open interest`;
    if (!st.rows.length) { $('lqTitle').textContent = 'Escaneá las cuentas para armar el mapa.'; return; }
    if (!walletsOk()) { $('lqTitle').textContent = mkt().group === 'spot' ? `${env.labelOf(S.coin)} es spot: no tiene posiciones apalancadas propias. El Modelo estima dónde se liquidarían quienes lo operan con apalancamiento.` : `${env.labelOf(S.coin)}: las wallets se escanean en los perps principales. Usá el Modelo del mapa de calor.`; return; }
    if (!m) { $('lqTitle').textContent = `Sin precio para ${S.coin}.`; return; }
    const d = Math.min(5, o.rangePct), iLo = Math.floor((m.mark * (1 - d / 100) - m.lo) / m.w), iHi = Math.floor((m.mark * (1 + d / 100) - m.lo) / m.w);
    const L = m.cumLong[Math.max(0, iLo)] || 0, Sh = m.cumShort[Math.min(m.n - 1, iHi)] || 0;
    $('lqTitle').textContent = `${env.labelOf(S.coin)}: si cae ${nf(d, 0)} % se liquidan ${usd(L)} en longs; si sube ${nf(d, 0)} %, ${usd(Sh)} en shorts`;
    $('lqCv').setAttribute('aria-label', `Mapa de liquidaciones de ${S.coin}. ${$('lqTitle').textContent}.`);
  }

  function tables() {
    const m = S.map;
    const fill = (tb, arr) => {
      tb.textContent = '';
      if (!arr.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 3; td.textContent = 'Sin clusters en el rango'; tr.append(td); tb.append(tr); return; }
      for (const c of arr) {
        const tr = document.createElement('tr'); tr.dataset.price = c.price; tr.tabIndex = 0;
        const a = document.createElement('td'); a.textContent = px(c.price);
        const b = document.createElement('td'); b.className = 'r'; b.textContent = pct(c.dist);
        const d = document.createElement('td'); d.className = 'r'; d.textContent = usd(c.usd);
        tr.append(a, b, d); tb.append(tr);
      }
    };
    fill($('lqLongs'), m ? m.clusters.long : []); fill($('lqShorts'), m ? m.clusters.short : []);
  }

  // ── Dibujo: barras por nivel arriba, acumulado abajo (dos paneles, un eje cada uno) ──
  const cv = $('lqCv'), ctx = cv.getContext('2d');
  let geo = null;
  function draw() { if (!S.drawQ) { S.drawQ = true; requestAnimationFrame(paint); } }
  function ticks(max, count) {
    if (!(max > 0)) return [0];
    const step0 = max / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => max / s <= count) || 10 * mag;
    const out = []; for (let v = 0; v <= max * 1.0001; v += step) out.push(v); return out;
  }
  function paint() {
    S.drawQ = false;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const m = S.map; if (!m) return;
    const o = opt(), AX = W < 560 ? 58 : 70, L = 10, T = 12, B = 28, GAP = 26;
    const pw = W - L - AX, ph = H - T - B - GAP, h1 = Math.round(ph * 0.68), h2 = ph - h1;
    const t1 = T, t2 = T + h1 + GAP;
    const X = (p) => L + ((p - m.lo) / (m.hi - m.lo)) * pw;
    const bw = pw / m.n;
    const maxBin = Math.max(1, ...m.long.map((v, i) => v + m.short[i]));
    const f = o.scale === 'sqrt' ? Math.sqrt : (v) => v;
    const Y1 = (v) => t1 + h1 - (f(v) / f(maxBin)) * h1;
    const maxCum = Math.max(1, m.cumLong[0] || 0, m.cumShort[m.n - 1] || 0, ...m.cumLong, ...m.cumShort);
    const Y2 = (v) => t2 + h2 - (v / maxCum) * h2;
    geo = { L, pw, t1, h1, t2, h2, X, bw, W, H, AX };
    ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

    // Grilla y ejes (USD a la derecha)
    const grid = (vals, Y, fmt) => {
      for (const v of vals) {
        const y = Math.round(Y(v)) + 0.5;
        ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
        ctx.fillStyle = COL.muted; ctx.fillText(fmt(v), W - AX + 6, y);
      }
    };
    // En escala raíz las marcas se reparten parejas en pantalla: max·(k/3)², redondeadas a 2 cifras.
    const r2 = (v) => { if (!v) return 0; const m10 = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / m10) * m10; };
    const t1v = o.scale === 'sqrt' ? [0, 1, 2, 3].map((k) => r2(maxBin * (k / 3) ** 2)) : ticks(maxBin, 4);
    grid(t1v, Y1, usdAx); grid(ticks(maxCum, 3), Y2, usdAx);
    ctx.fillStyle = COL.faint; ctx.fillText('Por nivel', L + 4, t1 + 8);
    if (W >= 560) { ctx.textAlign = 'right'; ctx.fillText('Acumulado desde el precio actual', L + pw - 4, t2 - 12); ctx.textAlign = 'left'; }

    // Barras (2 px de aire entre barras cuando hay espacio)
    const gap = bw > 5 ? 1 : 0;
    for (let i = 0; i < m.n; i++) {
      const x = L + i * bw + gap / 2, w = Math.max(1, bw - gap);
      const vl = m.long[i], vs = m.short[i];
      if (vl > 0) { ctx.fillStyle = COL.long; const y = Y1(vl); ctx.fillRect(x, y, w, t1 + h1 - y); }
      if (vs > 0) { ctx.fillStyle = COL.short; const y0 = Y1(vl), y = Y1(vl + vs); ctx.fillRect(x, y, w, y0 - y); }
      if (S.hover === i) { ctx.fillStyle = 'rgba(236,233,226,.08)'; ctx.fillRect(L + i * bw, t1, bw, h1); }
    }
    // Acumulados: longs hacia la izquierda, shorts hacia la derecha
    const area = (arr, color, from, to, dir) => {
      ctx.beginPath(); let started = false;
      for (let i = from; dir > 0 ? i <= to : i >= to; i += dir) {
        const x = L + (i + 0.5) * bw, y = Y2(arr[i]);
        started ? ctx.lineTo(x, y) : (ctx.moveTo(x, Y2(0)), ctx.lineTo(x, y), (started = true));
      }
      const xe = L + (to + 0.5) * bw; ctx.lineTo(xe, Y2(0)); ctx.closePath();
      ctx.globalAlpha = 0.18; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); started = false;
      for (let i = from; dir > 0 ? i <= to : i >= to; i += dir) { const x = L + (i + 0.5) * bw, y = Y2(arr[i]); started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), (started = true)); }
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    };
    const mi = Math.min(m.n - 1, Math.max(0, Math.floor((m.mark - m.lo) / m.w)));
    area(m.cumLong, COL.long, mi, 0, -1); area(m.cumShort, COL.short, mi, m.n - 1, 1);
    // Rótulos directos en los extremos del acumulado
    ctx.textBaseline = 'top'; ctx.fillStyle = COL.fg;
    ctx.textAlign = 'left'; ctx.fillText(`Longs ${usd(m.cumLong[0])}`, L + 6, Math.min(t2 + h2 - 14, Y2(m.cumLong[0]) + 6));
    ctx.textAlign = 'right'; ctx.fillText(`Shorts ${usd(m.cumShort[m.n - 1])}`, L + pw - 6, Math.min(t2 + h2 - 14, Y2(m.cumShort[m.n - 1]) + 6));

    // Precio actual
    const xm = Math.round(X(m.mark)) + 0.5;
    ctx.strokeStyle = COL.gold; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xm, t1); ctx.lineTo(xm, t2 + h2); ctx.stroke(); ctx.setLineDash([]);
    const lab = px(m.mark); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const lw = ctx.measureText(lab).width + 12;
    ctx.fillStyle = COL.gold; ctx.fillRect(xm - lw / 2, t1 + h1 + 4, lw, 18);
    ctx.fillStyle = '#0B0B0C'; ctx.fillText(lab, xm, t1 + h1 + 13);

    // Eje de precio
    ctx.fillStyle = COL.muted; ctx.textBaseline = 'top';
    const steps = Math.max(2, Math.min(8, Math.floor(pw / 170)));
    for (let k = 0; k <= steps; k++) {
      const p = m.lo + (k / steps) * (m.hi - m.lo), x = X(p);
      ctx.textAlign = k === 0 ? 'left' : k === steps ? 'right' : 'center';
      ctx.fillText(`${px(p)}  ${pct((p / m.mark - 1) * 100)}`, x, H - B + 8);
    }
    // Crosshair
    if (S.hover != null) {
      const x = Math.round(L + (S.hover + 0.5) * bw) + 0.5;
      ctx.strokeStyle = COL.muted; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, t1); ctx.lineTo(x, t2 + h2); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // ── Tooltip ────────────────────────────────────────────────────────────
  function showTip(i, x, y) {
    const m = S.map, tip = $('lqTip'); if (!m) return;
    const p0 = m.lo + i * m.w, p1 = p0 + m.w, below = m.centers[i] < m.mark;
    tip.textContent = '';
    const t = document.createElement('time'); t.textContent = `${px(p0)} – ${px(p1)} · ${pct((m.centers[i] / m.mark - 1) * 100)}`; tip.append(t);
    const ol = document.createElement('ol');
    const row = (name, v, color) => {
      const li = document.createElement('li'), sw = document.createElement('span'), nm = document.createElement('span'), b = document.createElement('b');
      sw.className = 'sw'; if (color) sw.style.background = color; nm.textContent = name; b.textContent = v;
      li.append(sw, nm, b); ol.append(li);
    };
    row('Longs en la zona', usd(m.long[i]), COL.long);
    row('Shorts en la zona', usd(m.short[i]), COL.short);
    row(below ? 'Longs acumulados' : 'Shorts acumulados', usd(below ? m.cumLong[i] : m.cumShort[i]), below ? COL.long : COL.short);
    row('Posiciones exactas en el nivel', nf(m.count[i], 0), null);
    tip.append(ol); tip.hidden = false;
    const fw = cv.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    let lx = x + 14; if (lx + tw > fw - 8) lx = x - tw - 14;
    tip.style.left = Math.max(8, lx) + 'px'; tip.style.top = Math.min(Math.max(8, y - th / 2), cv.clientHeight - th - 8) + 'px';
  }
  const binAt = (x) => geo && S.map ? Math.max(0, Math.min(S.map.n - 1, Math.floor((x - geo.L) / geo.bw))) : null;
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(), i = binAt(e.clientX - r.left); if (i == null) return; S.hover = i; showTip(i, e.clientX - r.left, e.clientY - r.top); draw(); });
  cv.addEventListener('pointerleave', () => { S.hover = null; $('lqTip').hidden = true; draw(); });
  cv.addEventListener('keydown', (e) => {
    if (!S.map || !['ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') { S.hover = null; $('lqTip').hidden = true; return draw(); }
    const mi = Math.floor((S.map.mark - S.map.lo) / S.map.w);
    S.hover = Math.max(0, Math.min(S.map.n - 1, (S.hover ?? mi) + (e.key === 'ArrowRight' ? 1 : -1)));
    showTip(S.hover, geo.L + (S.hover + 0.5) * geo.bw, geo.t1 + 40); draw();
  });
  const focusPrice = (tr) => { if (!tr || !S.map || !tr.dataset.price) return; const i = Math.floor((+tr.dataset.price - S.map.lo) / S.map.w); S.hover = i; showTip(i, geo.L + (i + 0.5) * geo.bw, geo.t1 + 40); draw(); };
  ['lqLongs', 'lqShorts'].forEach((id) => {
    $(id).addEventListener('click', (e) => focusPrice(e.target.closest('tr')));
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') focusPrice(e.target.closest('tr')); });
  });
  new ResizeObserver(draw).observe(cv);

  // ── Mapa de calor en el tiempo (vista por defecto, al estilo Coinglass) ──
  const LH = window.LiqHeat;
  const TF_MS = { '5m': 3e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '3d': 2592e5, '1w': 6048e5 };
  const SHOW = 300, LOOKBACK = 300;   // velas visibles + velas previas (para las bandas que nacieron antes de la ventana)
  const H = { view: 'heat', tf: '5m', wallets: true, model: false, levs: LH.LEVS.slice(), k: null, key: '', map: null, hover: null, drawQ: false, loading: null };
  try { Object.assign(H, JSON.parse(localStorage.getItem('baLiqHeat')) || {}); } catch {}
  if (!TF_MS[H.tf]) H.tf = '5m';
  const saveHeat = () => { try { localStorage.setItem('baLiqHeat', JSON.stringify({ view: H.view, tf: H.tf, wallets: H.wallets, model: H.model, levs: H.levs })); } catch {} };
  // Paleta tipo "magma": violeta oscuro (nada) → magenta → coral → amarillo pálido (máximo).
  const STOPS = [[0, [23, 10, 43]], [0.15, [59, 15, 95]], [0.35, [122, 31, 110]], [0.55, [195, 61, 104]], [0.75, [240, 116, 90]], [0.9, [251, 184, 105]], [1, [253, 243, 198]]];
  const PAL = Array.from({ length: 256 }, (_, i) => {
    const t = i / 255; let a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (let j = 1; j < STOPS.length; j++) if (t <= STOPS[j][0]) { a = STOPS[j - 1]; b = STOPS[j]; break; }
    const f = (t - a[0]) / ((b[0] - a[0]) || 1);
    return a[1].map((v, q) => Math.round(v + (b[1][q] - v) * f));
  });
  const hcv = $('lqHeat'), hctx = hcv.getContext('2d');
  let hgeo = null;

  // Mismos filtros que el perfil (tamaño mínimo, apalancamiento, lado y margen) para la capa de wallets.
  function filterPos(pos) {
    const o = opt();
    return pos.filter((p) => p.usd >= (o.minUsd || 0) && (!o.minLev || p.lev >= o.minLev) &&
      (o.side === 'both' || (o.side === 'long' ? p.side === 1 : p.side === -1)) &&
      (o.margin === 'all' || (o.margin === 'cross' ? p.cross : !p.cross)));
  }
  async function loadCandles(force) {
    if (!env.live) return;
    const key = real() + '|' + H.tf;
    if (!force && H.key === key && H.k) return;
    if (H.loading === key) return;
    H.loading = key;
    try {
      const now = Date.now(), ms = TF_MS[H.tf];
      const rows = await env.hlPost({ type: 'candleSnapshot', req: { coin: real(), interval: H.tf, startTime: now - (SHOW + LOOKBACK) * ms, endTime: now } });
      if (H.loading !== key) return;
      H.k = (rows || []).map((x) => ({ t: +x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v })); H.key = key;
    } catch { if (H.key !== key) { H.k = null; H.key = key; } }
    if (H.loading === key) H.loading = null;
  }
  function rebuildHeat() {
    if (!H.k || H.k.length < 30 || H.key !== real() + '|' + H.tf) { H.map = null; drawHeat(); return; }
    H.map = LH.build(H.k, { show: SHOW, bins: 170, wallets: H.wallets && walletsOk() ? filterPos(src.positions(real())) : null, model: H.model, levs: H.levs });
    drawHeat();
  }
  async function refreshHeat(force) { await loadCandles(force); rebuildHeat(); }
  function drawHeat() { if (!H.drawQ) { H.drawQ = true; requestAnimationFrame(paintHeat); } }
  const fmtT = (t) => { const d = new Date(t); return TF_MS[H.tf] >= 864e5 ? d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' }) : d.toLocaleString('es-AR', { day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); };
  function paintHeat() {
    H.drawQ = false;
    if (H.view !== 'heat') return;
    const dpr = window.devicePixelRatio || 1, W = hcv.clientWidth, Hh = hcv.clientHeight;
    if (!W || !Hh) return;
    if (hcv.width !== Math.round(W * dpr) || hcv.height !== Math.round(Hh * dpr)) { hcv.width = Math.round(W * dpr); hcv.height = Math.round(Hh * dpr); }
    hctx.setTransform(dpr, 0, 0, dpr, 0, 0); hctx.fillStyle = '#0B0B0C'; hctx.fillRect(0, 0, W, Hh);
    const m = H.map;
    hctx.font = FONT; hctx.textBaseline = 'middle';
    if (!m) { hctx.fillStyle = COL.muted; hctx.textAlign = 'center'; hctx.fillText(env.live ? 'Cargando velas…' : 'El mapa de calor necesita datos en vivo de Hyperliquid.', W / 2, Hh / 2); return; }
    const LEG = 54, AX = W < 560 ? 62 : 74, T = 10, B = 26, L = LEG, pw = W - L - AX, ph = Hh - T - B;
    const cw = pw / m.cols, rh = ph / m.bins;
    const Y = (p) => T + ph - ((p - m.lo) / (m.hi - m.lo)) * ph;
    hgeo = { L, T, pw, ph, cw, rh, W, H: Hh };
    // Celdas: una imagen de columnas × niveles, escalada sin suavizado.
    const img = new ImageData(m.cols, m.bins), useW = H.wallets && m.maxW > 0, useM = H.model && m.maxM > 0;
    for (let r = 0; r < m.bins; r++) for (let c = 0; c < m.cols; c++) {
      const v = LH.cell(m, r * m.cols + c, useW, useM), col = PAL[Math.round(v * 255)], o4 = ((m.bins - 1 - r) * m.cols + c) * 4;
      img.data[o4] = col[0]; img.data[o4 + 1] = col[1]; img.data[o4 + 2] = col[2]; img.data[o4 + 3] = 255;
    }
    const off = document.createElement('canvas'); off.width = m.cols; off.height = m.bins; off.getContext('2d').putImageData(img, 0, 0);
    hctx.imageSmoothingEnabled = false; hctx.drawImage(off, L, T, pw, ph); hctx.imageSmoothingEnabled = true;
    // Velas
    const bw = Math.max(1, Math.min(cw * 0.62, 9));
    m.candles.forEach((k, c) => {
      const x = L + (c + 0.5) * cw, up = k.c >= k.o, col = up ? '#2EBD85' : '#F6465D';
      hctx.strokeStyle = col; hctx.lineWidth = 1; hctx.beginPath(); hctx.moveTo(Math.round(x) + 0.5, Y(k.h)); hctx.lineTo(Math.round(x) + 0.5, Y(k.l)); hctx.stroke();
      const y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c)); hctx.fillStyle = col; hctx.fillRect(x - bw / 2, y1, bw, Math.max(1, y2 - y1));
    });
    // Precio actual
    const last = m.candles[m.candles.length - 1], mark = (ctxOf() || {}).mark || last.c, ym = Math.round(Y(mark)) + 0.5;
    hctx.strokeStyle = COL.gold; hctx.setLineDash([4, 3]); hctx.beginPath(); hctx.moveTo(L, ym); hctx.lineTo(L + pw, ym); hctx.stroke(); hctx.setLineDash([]);
    // Eje de precios (derecha) y de tiempo (abajo)
    hctx.fillStyle = COL.muted; hctx.textAlign = 'left';
    const pstep = (() => { const raw = (m.hi - m.lo) / 7, mag = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((q) => q * mag).find((s) => s >= raw); })();
    for (let p = Math.ceil(m.lo / pstep) * pstep; p <= m.hi; p += pstep) { const y = Y(p); if (Math.abs(y - ym) > 12) hctx.fillText(px(p), L + pw + 6, y); }
    const lab = px(mark), lw = hctx.measureText(lab).width + 10;
    hctx.fillStyle = COL.gold; hctx.fillRect(L + pw + 2, ym - 9, lw, 18); hctx.fillStyle = '#0B0B0C'; hctx.fillText(lab, L + pw + 7, ym);
    hctx.fillStyle = COL.muted; hctx.textBaseline = 'top';
    const nt = Math.max(2, Math.floor(pw / 150));
    for (let q = 0; q <= nt; q++) {
      const c = Math.round((q / nt) * (m.cols - 1)), x = L + (c + 0.5) * cw;
      hctx.textAlign = q === 0 ? 'left' : q === nt ? 'right' : 'center'; hctx.fillText(fmtT(m.candles[c].t), x, T + ph + 8);
    }
    // Escala de color (izquierda): arriba el máximo de la capa activa.
    const gx = 14, gw = 14, gy = T + 18, gh = ph - 36;
    for (let i = 0; i < gh; i++) { const col = PAL[Math.round((1 - i / gh) * 255)]; hctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; hctx.fillRect(gx, gy + i, gw, 1); }
    hctx.strokeStyle = COL.line; hctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
    hctx.fillStyle = COL.fg; hctx.textAlign = 'left'; hctx.textBaseline = 'bottom';
    hctx.fillText(useW && !useM ? usdAx(m.maxW) : useM && !useW ? 'Modelo' : 'Relativo', 4, gy - 4);
    hctx.textBaseline = 'top'; hctx.fillText('0', gx + 3, gy + gh + 4);
    if (H.wallets && !H.model && !useW) {
      hctx.fillStyle = 'rgba(11,11,12,.75)'; hctx.fillRect(L + pw / 2 - 230, T + ph / 2 - 24, 460, 48);
      hctx.fillStyle = COL.fg; hctx.textAlign = 'center'; hctx.textBaseline = 'middle';
      hctx.fillText(walletsOk() ? 'Ninguna posición de las wallets se liquida en este rango de precio.' : 'Las wallets se escanean en los perps principales, no en HIP-3 ni spot.', L + pw / 2, T + ph / 2 - 8);
      hctx.fillStyle = COL.muted; hctx.fillText(walletsOk() ? 'Probá una vela más grande (1H, 4H) o prendé el Modelo.' : 'Prendé el Modelo para ver las liquidaciones estimadas de este mercado.', L + pw / 2, T + ph / 2 + 10);
    }
    // Crosshair
    if (H.hover) {
      const x = Math.round(L + (H.hover.c + 0.5) * cw) + 0.5, y = Math.round(T + ph - (H.hover.r + 0.5) * rh) + 0.5;
      hctx.strokeStyle = 'rgba(236,233,226,.45)'; hctx.setLineDash([2, 3]);
      hctx.beginPath(); hctx.moveTo(x, T); hctx.lineTo(x, T + ph); hctx.moveTo(L, y); hctx.lineTo(L + pw, y); hctx.stroke(); hctx.setLineDash([]);
    }
  }
  function heatTip(c, r, x, y) {
    const m = H.map, tip = $('lqTip'); if (!m) return;
    const i = r * m.cols + c, p0 = m.lo + r * m.step, k = m.candles[c];
    tip.textContent = '';
    const t = document.createElement('time'); t.textContent = `${fmtT(k.t)} · ${px(p0)} – ${px(p0 + m.step)}`; tip.append(t);
    const ol = document.createElement('ol');
    const row = (name, v, color) => {
      const li = document.createElement('li'), sw = document.createElement('span'), nm = document.createElement('span'), b = document.createElement('b');
      sw.className = 'sw'; if (color) sw.style.background = color; nm.textContent = name; b.textContent = v; li.append(sw, nm, b); ol.append(li);
    };
    if (H.wallets) { row('Longs a liquidar (wallets)', usd(m.grid.wl[i]), COL.long); row('Shorts a liquidar (wallets)', usd(m.grid.ws[i]), COL.short); }
    if (H.model) {
      const v = m.grid.ml[i] + m.grid.ms[i];
      row('Modelo · intensidad', m.maxM ? nf(Math.min(100, (v / m.maxM) * 100), 0) + ' %' : '—', null);
      row('Modelo · lado', v ? (m.grid.ml[i] >= m.grid.ms[i] ? 'longs' : 'shorts') : '—', null);
    }
    row('Distancia al precio', pct(((p0 + m.step / 2) / ((ctxOf() || {}).mark || k.c) - 1) * 100), null);
    tip.append(ol); tip.hidden = false;
    const fw = hcv.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    let lx = x + 14; if (lx + tw > fw - 8) lx = x - tw - 14;
    tip.style.left = Math.max(8, lx) + 'px'; tip.style.top = Math.min(Math.max(8, y - th / 2), hcv.clientHeight - th - 8) + 'px';
  }
  hcv.addEventListener('pointermove', (e) => {
    if (!hgeo || !H.map) return;
    const r0 = hcv.getBoundingClientRect(), x = e.clientX - r0.left, y = e.clientY - r0.top;
    const c = Math.floor((x - hgeo.L) / hgeo.cw), r = Math.floor((hgeo.T + hgeo.ph - y) / hgeo.rh);
    if (c < 0 || c >= H.map.cols || r < 0 || r >= H.map.bins) { H.hover = null; $('lqTip').hidden = true; return drawHeat(); }
    H.hover = { c, r }; heatTip(c, r, x, y); drawHeat();
  });
  hcv.addEventListener('pointerleave', () => { H.hover = null; $('lqTip').hidden = true; drawHeat(); });
  new ResizeObserver(drawHeat).observe(hcv);

  function syncHeatControls() {
    $('panel-liq').dataset.view = H.view;
    hcv.hidden = H.view !== 'heat'; cv.hidden = H.view === 'heat';
    $('lqView').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === H.view)));
    $('lqTf').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === H.tf)));
    $('lqHw').checked = H.wallets; $('lqHm').checked = H.model;
    $('lqLevs').querySelectorAll('input').forEach((b) => { b.checked = H.levs.includes(+b.value); b.disabled = !H.model; });
  }
  $('lqView').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === H.view) return;
    H.view = b.dataset.v; saveHeat(); syncHeatControls(); $('lqTip').hidden = true;
    if (H.view === 'heat') refreshHeat(); else draw();
  });
  $('lqTf').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.tf === H.tf) return; H.tf = b.dataset.tf; saveHeat(); syncHeatControls(); H.map = null; drawHeat(); refreshHeat(); });
  $('lqHw').addEventListener('change', () => { H.wallets = $('lqHw').checked; saveHeat(); rebuildHeat(); });
  $('lqHm').addEventListener('change', () => { H.model = $('lqHm').checked; saveHeat(); syncHeatControls(); rebuildHeat(); });
  $('lqLevs').addEventListener('change', () => { H.levs = [...$('lqLevs').querySelectorAll('input:checked')].map((b) => +b.value); saveHeat(); rebuildHeat(); });
  syncHeatControls();

  // ── Selector de mercado (el mismo de Aurora: perps, spot y HIP-3) ──
  const picker = env.makePicker ? env.makePicker('lq', { current: () => S.coin, onPick: pick }) : null;
  function pick(c) {
    S.coin = c; try { localStorage.setItem('baLiqCoin', c); } catch {}
    S.hover = null; H.hover = null; H.map = null; $('lqTip').hidden = true;
    // En HIP-3 y spot no hay wallets: se prende el Modelo para que el mapa no quede vacío.
    if (!walletsOk() && !H.model) { H.model = true; saveHeat(); syncHeatControls(); }
    refreshCtx().then(rebuild); rebuild(); refreshHeat();
  }

  // ── Controles de sensibilidad ──────────────────────────────────────────
  ['lqRange', 'lqBins', 'lqMin', 'lqLev', 'lqSide', 'lqMargin', 'lqScale'].forEach((id) => $(id).addEventListener('change', rebuild));
  $('lqSmooth').addEventListener('input', () => { $('lqSmoothV').textContent = nf(+$('lqSmooth').value, 1); rebuild(); });

  // ── Escaneo ────────────────────────────────────────────────────────────
  const status = (t) => { $('lqStatus').textContent = t; };
  window.addEventListener('ba:ratewait', (e) => { if (!$('panel-liq').hidden && $('lqScan').disabled) status(`Esperando el límite de pedidos de Hyperliquid · ${e.detail} s…`); });
  function veil(t) { $('lqVeil').classList.toggle('off', t == null); if (t != null) $('lqVeilTxt').textContent = t; }
  $('lqScan').addEventListener('click', async () => {
    if (!env.live) return;
    $('lqScan').disabled = true; $('lqN').disabled = true;
    try {
      await src.scan(+$('lqN').value, (st, done, total) => { status(`Escaneando ${nf(done, 0)} de ${nf(total, 0)} cuentas…`); veil(null); rebuild(); }, (t) => { status(t); });
      await refreshCtx(); rebuild();
      status(`Listo · ${nf(src.state.scanned, 0)} cuentas · ${nf(src.state.rows.length, 0)} posiciones`);
    } catch (e) { status('No se pudo completar el escaneo. Revisá la conexión y probá de nuevo.'); }
    $('lqScan').disabled = false; $('lqN').disabled = false;
  });

  let ctxTimer = null;
  (async function start() {
    if (!env.live) {
      const snap = env.snapshot();
      src.useSnapshot(snap);
      snap.coins.forEach((c, i) => (S.ctx[c] = { mark: snap.mark[i], oi: snap.oi[i] * 1000 }));
      if (!S.ctx[S.coin]) S.coin = snap.coins[0];
      $('lqSymBtn').disabled = true; $('lqSymCtl').title = 'Disponible con datos en vivo';
      ['lqScan', 'lqN'].forEach((id) => { $(id).disabled = true; $(id).title = 'Disponible con datos en vivo'; });
      status('Modo demo');
      $('lqNote').textContent = `Modo demo: snapshot real de ${nf(snap.accounts, 0)} cuentas de Hyperliquid tomado el ${new Date(snap.t).toLocaleString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })}, para ${snap.coins.join(', ')}. Abrí el archivo en tu navegador para escanear cualquier perpetuo en vivo.`;
      veil(null); rebuild(); return;
    }
    veil('Cargando precios y posiciones…');
    if (env.CAT && !env.CAT.ready) { try { await env.loadCatalog(); } catch {} }
    if (env.CAT && env.CAT.ready) { if (!env.CAT.byAlias.has(env.aliasKey(S.coin))) S.coin = 'BTC'; S.coin = env.aliasKey(S.coin); }
    picker && picker.render();
    await Promise.all([refreshCtx(), src.loadServer()]);
    $('lqNote').textContent = 'Mapa de calor: cuanto más clara la franja, más se liquidaría en ese precio. Wallets: posiciones reales de las cuentas más grandes (escaneadas cada hora), desde su apertura estimada. Modelo: en cada vela con volumen sobre el promedio se estiman las liquidaciones de x3 a x125 desde su máximo y su mínimo; la franja se apaga cuando el precio la toca. Las cuentas chicas no entran en las wallets: por eso se muestra la cobertura del open interest.';
    if (src.state.rows.length) { status(`${src.state.server ? 'Escaneo del servidor' : 'Último escaneo'} ${ago(src.state.t)} · ${nf(src.state.scanned, 0)} cuentas. Reescaneá para tener lo último.`); veil(null); }
    else { status('Todavía no hay posiciones de wallets. Tocá Reescanear en vivo, o usá el Modelo.'); veil(H.view === 'heat' ? null : 'Tocá Reescanear en vivo para leer las posiciones de las cuentas más grandes.'); }
    rebuild(); refreshHeat();
    ctxTimer = setInterval(async () => { if (!$('panel-liq').hidden) { await refreshCtx(); rebuild(); } }, 30000);
    // Velas del mapa de calor: se renuevan cada minuto mientras se ve la sección.
    setInterval(() => { if (!$('panel-liq').hidden && H.view === 'heat') refreshHeat(true); }, 60000);
  })();

  return { show() { draw(); drawHeat(); }, hide() { S.hover = null; H.hover = null; $('lqTip').hidden = true; } };
};
