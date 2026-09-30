// Liquidaciones · interfaz. Se crea recién cuando se abre la pestaña.
// env: { live, hlPost, snapshot() }
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
    } catch {}
  }

  function rebuild() {
    const c = S.ctx[S.coin];
    const pos = src.positions(S.coin);
    if (!c || !c.mark) { S.map = null; draw(); texts(pos); return; }
    S.map = LM.buildMap(pos, { ...opt(), mark: c.mark });
    texts(pos); tables(); draw();
  }

  function coverage(coin) { const e = src.state.exposure[coin] || 0, oi = (S.ctx[coin] || {}).oi || 0; return oi ? Math.min(100, (e / oi) * 100) : 0; }

  function texts(pos) {
    const st = src.state, m = S.map, o = opt();
    $('lqCoinLbl').textContent = S.coin + '-PERP';
    const cov = coverage(S.coin);
    $('lqCap').textContent = `Hyperliquid · ${nf(st.scanned || 0, 0)} cuentas ${st.snapshot ? 'del snapshot' : 'escaneadas'} ${st.t ? ago(st.t) : ''} · ${nf(pos.length, 0)} posiciones con precio de liquidación · cobertura ${nf(cov, 0)} % del open interest`;
    if (!st.rows.length) { $('lqTitle').textContent = 'Escaneá las cuentas para armar el mapa.'; return; }
    if (!m) { $('lqTitle').textContent = `Sin precio para ${S.coin}.`; return; }
    const d = Math.min(5, o.rangePct), iLo = Math.floor((m.mark * (1 - d / 100) - m.lo) / m.w), iHi = Math.floor((m.mark * (1 + d / 100) - m.lo) / m.w);
    const L = m.cumLong[Math.max(0, iLo)] || 0, Sh = m.cumShort[Math.min(m.n - 1, iHi)] || 0;
    $('lqTitle').textContent = `${S.coin}: si cae ${nf(d, 0)} % se liquidan ${usd(L)} en longs; si sube ${nf(d, 0)} %, ${usd(Sh)} en shorts`;
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

  // ── Selector de mercado ────────────────────────────────────────────────
  function coins() {
    const set = new Set([...Object.keys(src.state.exposure), ...Object.keys(S.ctx)]);
    return [...set].filter((c) => S.ctx[c]).sort((a, b) => (S.ctx[b].oi || 0) - (S.ctx[a].oi || 0));
  }
  function renderCoins() {
    const q = $('lqCoinQ').value.trim().toLowerCase(), ul = $('lqCoinList'); ul.textContent = '';
    const list = coins().filter((c) => !q || c.toLowerCase().includes(q));
    for (const c of list.slice(0, 300)) {
      const li = document.createElement('li'); li.dataset.c = c; li.setAttribute('role', 'option'); li.tabIndex = -1;
      if (c === S.coin) li.className = 'cur';
      const a = document.createElement('span'), b = document.createElement('b'); b.textContent = c; a.append(b);
      const oi = document.createElement('span'); oi.textContent = usd(S.ctx[c].oi || 0);
      const cv2 = document.createElement('span'); cv2.textContent = src.state.rows.length ? nf(coverage(c), 0) + ' %' : '—';
      li.append(a, oi, cv2); ul.append(li);
    }
    $('lqCoinFoot').textContent = `${list.length} perpetuos · ordenados por open interest · cobertura = parte del OI que cubren las cuentas escaneadas`;
  }
  const setPop = (open) => { $('lqCoinPop').hidden = !open; $('lqCoinBtn').setAttribute('aria-expanded', String(open)); if (open) { $('lqCoinQ').value = ''; renderCoins(); $('lqCoinQ').focus(); } };
  $('lqCoinBtn').addEventListener('click', () => setPop($('lqCoinPop').hidden));
  $('lqCoinQ').addEventListener('input', renderCoins);
  $('lqCoinQ').addEventListener('keydown', (e) => { if (e.key === 'Escape') setPop(false); if (e.key === 'Enter') { const li = $('lqCoinList').firstElementChild; li && pick(li.dataset.c); } });
  $('lqCoinList').addEventListener('click', (e) => { const li = e.target.closest('li[data-c]'); li && pick(li.dataset.c); });
  document.addEventListener('mousedown', (e) => { if (!$('lqCoinPop').hidden && !$('lqCoinCtl').contains(e.target)) setPop(false); });
  function pick(c) { S.coin = c; try { localStorage.setItem('baLiqCoin', c); } catch {} setPop(false); S.hover = null; $('lqTip').hidden = true; rebuild(); }

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
      ['lqScan', 'lqN'].forEach((id) => { $(id).disabled = true; $(id).title = 'Disponible con datos en vivo'; });
      status('Modo demo');
      $('lqNote').textContent = `Modo demo: snapshot real de ${nf(snap.accounts, 0)} cuentas de Hyperliquid tomado el ${new Date(snap.t).toLocaleString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' })}, para ${snap.coins.join(', ')}. Abrí el archivo en tu navegador para escanear cualquier perpetuo en vivo.`;
      veil(null); rebuild(); return;
    }
    veil('Cargando precios…');
    await refreshCtx();
    $('lqNote').textContent = 'Cada posición trae el precio de liquidación que calcula Hyperliquid. El mapa suma el nocional de las posiciones de las cuentas más grandes del ranking público; las cuentas chicas no entran, por eso se muestra la cobertura del open interest.';
    if (src.state.rows.length) { status(`Último escaneo ${ago(src.state.t)} · ${nf(src.state.scanned, 0)} cuentas. Tocá Escanear para actualizar.`); veil(null); }
    else { status('Todavía no hay datos. Tocá Escanear.'); veil('Tocá Escanear para leer las posiciones de las cuentas más grandes.'); }
    rebuild();
    ctxTimer = setInterval(async () => { if (!$('panel-liq').hidden) { await refreshCtx(); rebuild(); } }, 30000);
  })();

  return { show() { draw(); }, hide() { S.hover = null; $('lqTip').hidden = true; } };
};
