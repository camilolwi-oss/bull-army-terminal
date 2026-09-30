// Spaghetti · módulo de interfaz. Se crea recién cuando se abre la pestaña.
// env: { live, CAT, loadCatalog, hlPost, snapshot() }
window.createSpaghetti = function createSpaghetti(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const M = window.SpagMath;
  const HL_WS = 'wss://api.hyperliquid.xyz/ws';
  const IV_MS = { '1m':6e4, '5m':3e5, '15m':9e5, '30m':18e5, '1h':36e5, '2h':72e5, '4h':144e5, '8h':288e5, '12h':432e5, '1d':864e5 };
  const WARM = 120;            // velas extra para que RSI/EMA/percentil arranquen asentados
  const MAX_COINS = 80;
  const SLOTS = 8;             // colores categóricos disponibles (orden fijo)
  const FX_LABEL = { standard:'Estándar', cum:'Cambio acum.', cumpct:'Cambio acum. %', chg:'Cambio', chgpct:'Cambio %' };
  const MX_LABEL = { rsi:'RSI', sma:'SMA', ema:'EMA' };
  const css = getComputedStyle($('panel-spag'));
  const COL = {
    fg: css.getPropertyValue('--fg').trim() || '#ECE9E2', muted: css.getPropertyValue('--muted').trim() || '#8E8B84',
    faint: css.getPropertyValue('--faint').trim() || '#5B5953', line: css.getPropertyValue('--line').trim() || '#25252A',
    surface: css.getPropertyValue('--surface').trim() || '#121214', gold: css.getPropertyValue('--gold').trim() || '#C9A227',
    slots: Array.from({ length: SLOTS }, (_, i) => css.getPropertyValue('--s' + (i + 1)).trim())
  };
  const FONT = '11px "IBM Plex Mono", ui-monospace, monospace';

  // ── Estado ─────────────────────────────────────────────────────────────
  const S = {
    live: env.live, coins: [], group: 'perp', raw: {}, t0: 0, step: 36e5, base: 0,
    out: { series: {}, avg: [] }, hidden: new Set(), pinned: new Set(), showAvg: true,
    slotOf: new Map(), hover: null, hoverIdx: null, cursor: null, playing: false, token: 0
  };
  let snap = null, ws = null, wsTimer = null, wsRetry = 0, drawQueued = false, liveQueued = false;
  const short = (m) => m.group === 'perp' ? m.real : m.label;
  const metaOf = (real) => env.CAT.list.find((m) => m.real === real);

  // ── Opciones de la UI ──────────────────────────────────────────────────
  const opt = () => ({
    src: $('spSrc').value, ref: $('spRef').value, lb: +$('spLb').value, tf: $('spTf').value,
    formula: document.querySelector('input[name=spF]:checked').value,
    metric: document.querySelector('input[name=spM]:checked').value,
    len: Math.min(100, Math.max(2, +$('spLen').value || 14)), pct: $('spPct').checked
  });
  const isPctUnit = (o) => o.metric === 'none' && !o.pct && (o.formula === 'cumpct' || o.formula === 'chgpct');
  const isOsc = (o) => o.metric === 'rsi' || o.pct;

  // Solo se permiten combinaciones con 12–1500 puntos y dentro de las ~5000 velas que guarda Hyperliquid.
  function validTf(lb, tf) { const n = lb / IV_MS[tf]; return n >= 12 && n <= 1500 && n + WARM <= 5000; }
  function syncTfOptions() {
    const lb = +$('spLb').value, sel = $('spTf');
    let best = null, bestD = Infinity;
    for (const o of sel.options) {
      o.disabled = !validTf(lb, o.value);
      const d = Math.abs(Math.log(lb / IV_MS[o.value] / 72));
      if (!o.disabled && d < bestD) { best = o.value; bestD = d; }
    }
    if (sel.selectedOptions[0].disabled && best) sel.value = best;
  }

  async function pool(items, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
  }

  // ── Datos ──────────────────────────────────────────────────────────────
  async function fetchCoin(real, o, t0, N) {
    const w = 20 + Math.ceil(N / 60);
    const rows = await env.hlPost({ type:'candleSnapshot', req:{ coin:real, interval:o.tf, startTime:t0, endTime:t0 + N * S.step } });
    const arr = new Array(N).fill(null);
    for (const k of rows || []) {
      const i = Math.round((+k.t - t0) / S.step);
      if (i >= 0 && i < N) arr[i] = o.src === 'vol' ? +k.v * +k.c : +k.c;
    }
    return arr;
  }

  async function load(onlyMissing) {
    const o = opt(), my = ++S.token;
    if (!S.live) return loadSnapshot();
    S.step = IV_MS[o.tf];
    const n = Math.round(o.lb / S.step), N = n + WARM;
    const now = Date.now(), last = Math.floor(now / S.step) * S.step;
    if (!onlyMissing || !S.t0) { S.raw = {}; S.t0 = last - (N - 1) * S.step; S.base = WARM; }
    const curN = Object.values(S.raw).find(Boolean)?.length || N;
    const todo = S.coins.filter((c) => !S.raw[c]);
    if (!todo.length) { recompute(); return; }
    let done = 0;
    veil(`Cargando ${todo.length} activos…`);
    await pool(todo, 4, async (c) => {
      try { const a = await fetchCoin(c, o, S.t0, curN); if (my === S.token) S.raw[c] = a; }
      catch { if (my === S.token) S.raw[c] = null; }
      done++;
      if (my !== S.token) return;
      // Se dibuja a medida que llegan: si el límite de pedidos obliga a esperar, lo ya cargado se ve igual.
      if (done >= 8 && done % 4 === 0) { veil(null); recompute(); $('spNote').textContent = `Cargando activos · ${done}/${todo.length}`; }
      else if (done < 8) veil(`Cargando activos · ${done}/${todo.length}`);
    });
    if (my !== S.token) return;
    const failed = todo.filter((c) => !S.raw[c]);
    failed.forEach((c) => delete S.raw[c]);
    $('spNote').textContent = failed.length ? `Sin datos para ${failed.map(labelOf).join(', ')}.` : liveNote();
    veil(null);
    recompute();
    openWs();
  }

  function loadSnapshot() {
    snap = snap || env.snapshot();
    S.step = snap.step; S.t0 = snap.t0; S.base = 0;
    S.raw = {};
    for (const c of S.coins) if (snap.c[c]) S.raw[c] = snap.c[c].slice();
    veil(null);
    recompute();
  }

  // ── Precio en vivo: una sola suscripción allMids por dex ───────────────
  function openWs() {
    closeWs();
    if (!S.live || $('spSrc').value !== 'close' || typeof WebSocket === 'undefined') return;
    const dexes = new Set(S.coins.map((c) => (metaOf(c) || {}).dex || ''));
    ws = new WebSocket(HL_WS);
    ws.onopen = () => {
      wsRetry = 0;
      dexes.forEach((d) => ws.send(JSON.stringify({ method:'subscribe', subscription: d ? { type:'allMids', dex:d } : { type:'allMids' } })));
      wsTimer = setInterval(() => { try { ws.send('{"method":"ping"}'); } catch {} }, 50000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.channel === 'allMids' && m.data && m.data.mids) onMids(m.data.mids);
    };
    ws.onclose = () => {
      clearInterval(wsTimer);
      if (ws && !$('panel-spag').hidden) setTimeout(openWs, Math.min(30000, 2000 * 2 ** wsRetry++));
    };
  }
  function closeWs() { if (ws) { const w = ws; ws = null; clearInterval(wsTimer); try { w.close(); } catch {} } }

  function onMids(mids) {
    const coins = Object.keys(S.raw); if (!coins.length) return;
    const N = S.raw[coins[0]].length;
    const k = Math.floor((Date.now() - S.t0) / S.step);
    if (k >= N) {                             // vela nueva: la ventana avanza
      const shift = Math.min(N, k - N + 1);
      for (const c of coins) { const a = S.raw[c]; for (let i = 0; i < shift; i++) { a.shift(); a.push(a[a.length - 1] ?? null); } }
      S.t0 += shift * S.step;
    }
    const idx = Math.min(N - 1, Math.floor((Date.now() - S.t0) / S.step));
    let changed = false;
    for (const c of coins) { const px = +mids[c]; if (px > 0) { S.raw[c][idx] = px; changed = true; } }
    if (changed && !liveQueued) { liveQueued = true; setTimeout(() => { liveQueued = false; recompute(); }, 1000); }
  }

  // ── Cálculo ────────────────────────────────────────────────────────────
  function recompute() {
    const o = opt();
    const raw = {};
    for (const c of S.coins) if (S.raw[c]) raw[c] = S.raw[c];
    if (o.ref !== 'none' && o.ref !== 'market' && !raw[o.ref] && S.raw[o.ref]) raw[o.ref] = S.raw[o.ref];
    S.out = M.compute(raw, { ...o, base: S.base, visible: S.coins.filter((c) => raw[c] && !S.hidden.has(c)) });
    const n = S.out.avg.length;
    $('spScrub').max = Math.max(1, n - 1);
    if (!S.playing && ($('spReplay').hidden || S.cursor == null || S.cursor > n - 1)) S.cursor = n - 1;
    $('spScrub').value = S.cursor;
    updateText(o); renderLegend(); draw();
  }

  const valAt = (c, i) => { const a = c === '__avg' ? S.out.avg : S.out.series[c]; return a ? a[i] : null; };
  function lastVal(c, i) { for (let j = i; j >= 0; j--) { const v = valAt(c, j); if (v != null) return v; } return null; }
  const visibleCoins = () => S.coins.filter((c) => S.out.series[c] && !S.hidden.has(c));

  function rankAt(i) {
    return visibleCoins().map((c) => [c, lastVal(c, i)]).filter((x) => x[1] != null).sort((a, b) => b[1] - a[1]);
  }

  // Resaltados: fijados + top/bottom 5. El color sigue a la entidad, no al puesto.
  function highlighted(i) {
    const r = rankAt(i), set = new Set([...S.pinned].filter((c) => !S.hidden.has(c) && S.out.series[c]));
    if ($('spTop').checked) r.slice(0, 5).forEach((x) => set.add(x[0]));
    if ($('spBot').checked) r.slice(-5).forEach((x) => set.add(x[0]));
    for (const [c] of S.slotOf) if (!set.has(c)) S.slotOf.delete(c);
    const used = new Set(S.slotOf.values());
    for (const c of set) {
      if (S.slotOf.has(c)) continue;
      const free = [...Array(SLOTS).keys()].find((s) => !used.has(s));
      if (free == null) break;
      S.slotOf.set(c, free); used.add(free);
    }
    return set;
  }
  const EXTRA = '#B4B0A6';   // resaltados más allá de los 8 colores: gris claro, siempre con etiqueta
  const colorOf = (c) => S.slotOf.has(c) ? COL.slots[S.slotOf.get(c)] : null;

  // ── Formatos ───────────────────────────────────────────────────────────
  const nf = (v, d) => v.toLocaleString('es-AR', { minimumFractionDigits:d, maximumFractionDigits:d });
  function fmtVal(v, o) {
    if (v == null) return '—';
    if (Math.abs(v) < 5e-5 * Math.max(1, Math.abs(v))) v = 0;
    if (isOsc(o)) return nf(v, 1);
    if (isPctUnit(o)) { if (Math.abs(v) < 0.005) return '0,00 %'; return (v > 0 ? '+' : '−') + nf(Math.abs(v), 2) + ' %'; }
    const a = Math.abs(v), s = v < 0 ? '−' : (o.formula === 'standard' ? '' : '+');
    if (a >= 1e9) return s + nf(a / 1e9, 2) + ' B';
    if (a >= 1e6) return s + nf(a / 1e6, 2) + ' M';
    if (a >= 1e4) return s + nf(a / 1e3, 1) + ' K';
    if (a >= 100) return s + nf(a, 1);
    if (a >= 1) return s + nf(a, 3);
    return s + a.toLocaleString('es-AR', { maximumSignificantDigits:4 });
  }
  // Marcas del eje: tantos decimales como pide el paso de la grilla.
  function fmtTick(v, o, step) {
    if (!isPctUnit(o)) return fmtVal(v, o).replace(/^\+/, '');
    const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return (v < 0 ? '−' : '') + nf(Math.abs(v), d) + ' %';
  }
  function fmtTime(t, full) {
    const d = new Date(t), intraday = S.step < 864e5;
    const day = d.toLocaleDateString('es-AR', { day:'numeric', month:'short' });
    if (!intraday) return full ? d.toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' }) : day;
    const hm = d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
    return full ? day + ' ' + hm : hm;
  }
  const labelOf = (c) => { const m = metaOf(c); return m ? short(m) : c; };
  const liveNote = () => 'En vivo desde Hyperliquid. El último punto se actualiza con el precio medio cada segundo; la vela se cierra al terminar el intervalo.';

  function updateText(o) {
    const n = S.out.avg.length, i = S.cursor ?? n - 1, r = rankAt(i);
    const tfLabel = $('spTf').selectedOptions[0].textContent, lbLabel = $('spLb').selectedOptions[0].textContent;
    const fx = FX_LABEL[o.formula] + (o.metric !== 'none' ? ` · ${MX_LABEL[o.metric]} ${o.len}` : '') + (o.pct ? ` · percentil ${o.len}` : '');
    $('spFxLbl').textContent = o.metric !== 'none' ? MX_LABEL[o.metric] + ' ' + o.len : FX_LABEL[o.formula];
    const refTxt = { none:'Absoluta', market:'Relativa al mercado', BTC:'Relativa a BTC' }[o.ref];
    $('spCap').textContent = `${o.src === 'vol' ? 'Volumen (USD)' : 'Precio de cierre'} · Hyperliquid · ${S.coins.length} activos · ${S.live ? lbLabel + ' | ' + tfLabel : '3D | 1H · snapshot real'} · ${fx} · ${refTxt}`;
    if (r.length < 2) { $('spTitle').textContent = 'Elegí al menos dos activos para comparar.'; return; }
    const top = r[0], bot = r[r.length - 1], avg = lastVal('__avg', i);
    $('spTitle').textContent = `${labelOf(top[0])} lidera con ${fmtVal(top[1], o)} y ${labelOf(bot[0])} queda último con ${fmtVal(bot[1], o)}` + (avg != null && o.ref !== 'market' ? ` · promedio ${fmtVal(avg, o)}` : '');
    $('spCv').setAttribute('aria-label', `Spaghetti de ${r.length} activos. ${$('spTitle').textContent}.`);
    $('spScrubT').textContent = S.t0 ? fmtTime(S.t0 + (S.base + i) * S.step, true) : '';
  }

  // ── Leyenda = vista de tabla ───────────────────────────────────────────
  function renderLegend() {
    const o = opt(), i = S.cursor ?? S.out.avg.length - 1, hl = highlighted(i);
    const rows = S.coins.filter((c) => S.out.series[c]).map((c) => [c, lastVal(c, i)]).sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity));
    const tb = $('spLegBody'); tb.textContent = '';
    const row = (key, name, v, color, extra) => {
      const tr = document.createElement('tr'); tr.dataset.c = key;
      if (extra) tr.className = extra;
      const td0 = document.createElement('td'), cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = key === '__avg' ? S.showAvg : !S.hidden.has(key);
      cb.setAttribute('aria-label', 'Mostrar ' + name); cb.dataset.act = 'vis';
      td0.append(cb);
      const td1 = document.createElement('td'), b = document.createElement('button');
      b.type = 'button'; b.dataset.act = 'pin';
      const sw = document.createElement('span'); sw.className = 'sw';
      if (color) sw.style.background = color;
      b.append(sw, document.createTextNode(name));
      if (key !== '__avg') { b.setAttribute('aria-pressed', String(S.pinned.has(key))); b.title = 'Fijar resaltado'; } else b.disabled = true;
      td1.append(b);
      const td2 = document.createElement('td'); td2.className = 'r'; td2.textContent = fmtVal(v, o);
      tr.append(td0, td1, td2);
      if (key !== '__avg' && S.hidden.has(key)) tr.classList.add('off');
      tb.append(tr);
    };
    row('__avg', 'Promedio global', lastVal('__avg', i), COL.fg, 'avg');
    for (const [c, v] of rows) row(c, labelOf(c), v, hl.has(c) ? (colorOf(c) || EXTRA) : null);
    $('spAll').checked = S.hidden.size === 0;
    $('spAll').indeterminate = S.hidden.size > 0 && S.hidden.size < S.coins.length;
  }

  // ── Dibujo ─────────────────────────────────────────────────────────────
  const cv = $('spCv'), ctx = cv.getContext('2d');
  let geo = null;
  function draw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(paint); } }

  function niceTicks(lo, hi, count) {
    const span = hi - lo || 1, step0 = span / count, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
  }

  function paint() {
    drawQueued = false;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const o = opt(), n = S.out.avg.length;
    if (n < 2) return;
    const narrow = W < 560, AX = narrow ? 56 : 66, LBL = narrow ? 92 : 136;
    const L = 10, T = 14, B = 26, R = AX + LBL, pw = W - L - R, ph = H - T - B;
    const cur = S.cursor ?? n - 1, vis = visibleCoins();
    // Dominio Y con todos los valores visibles (fijo durante el replay).
    let lo = Infinity, hi = -Infinity;
    const scan = (a) => { for (const v of a) if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } };
    vis.forEach((c) => scan(S.out.series[c])); if (S.showAvg) scan(S.out.avg);
    if (!isFinite(lo)) return;
    if (isOsc(o)) { lo = Math.min(lo, 0); hi = Math.max(hi, 100); }
    const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
    const X = (i) => L + (i / (n - 1)) * pw, Y = (v) => T + (1 - (v - lo) / (hi - lo)) * ph;
    geo = { L, T, B, R, pw, ph, n, X, Y, lo, hi, W, H, AX, LBL };

    // Grilla y eje Y (a la derecha)
    ctx.font = FONT; ctx.textBaseline = 'middle';
    const yt = niceTicks(lo, hi, Math.max(3, Math.round(ph / 70)));
    for (const v of yt) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = v === 0 ? COL.faint : COL.line; ctx.lineWidth = 1;
      ctx.setLineDash(v === 0 ? [3, 3] : []);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillStyle = COL.muted; ctx.textAlign = 'left';
      ctx.fillText(fmtTick(v, o, yt[1] - yt[0]), W - AX + 6, y);
    }
    ctx.setLineDash([]);
    // Eje X
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = COL.muted;
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 110))));
    let lastDay = '';
    for (let i = 0; i < n; i += every) {
      const t = S.t0 + (S.base + i) * S.step, d = new Date(t).toDateString();
      const txt = S.step < 864e5 && d !== lastDay ? fmtTime(t, true) : fmtTime(t, false);
      lastDay = d; ctx.textAlign = i === 0 ? 'left' : 'center'; ctx.fillText(txt, X(i), H - B + 7);
    }

    const hl = highlighted(cur);
    const line = (a, color, width, alpha) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.lineJoin = 'round';
      ctx.beginPath(); let pen = false;
      for (let i = 0; i <= cur; i++) { const v = a[i]; if (v == null) { pen = false; continue; } const x = X(i), y = Y(v); pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; }
      ctx.stroke(); ctx.globalAlpha = 1;
    };
    // 1) la masa en gris, 2) resaltados en color, 3) promedio, 4) hover encima
    for (const c of vis) if (!hl.has(c) && c !== S.hover) line(S.out.series[c], COL.muted, 1, 0.28);
    for (const c of vis) if (hl.has(c) && c !== S.hover) line(S.out.series[c], colorOf(c) || EXTRA, 2, 1);
    if (S.showAvg) line(S.out.avg, COL.fg, 2.5, 1);
    if (S.hover && S.out.series[S.hover] && !S.hidden.has(S.hover)) line(S.out.series[S.hover], colorOf(S.hover) || EXTRA, 3, 1);

    // Etiquetas al final (texto en tinta, color solo en la muestra)
    const labs = [];
    for (const c of hl) { const v = lastVal(c, cur); if (v != null) labs.push({ c, v, name: labelOf(c), color: colorOf(c) || EXTRA }); }
    if (S.showAvg) { const v = lastVal('__avg', cur); if (v != null) labs.push({ c:'__avg', v, name:'Promedio', color: COL.fg }); }
    if (S.hover && !hl.has(S.hover)) { const v = lastVal(S.hover, cur); if (v != null) labs.push({ c:S.hover, v, name: labelOf(S.hover), color: EXTRA }); }
    labs.forEach((l) => { l.y0 = Y(l.v); l.y = l.y0; });
    labs.sort((a, b) => a.y - b.y);
    const gap = 17;
    for (let k = 1; k < labs.length; k++) labs[k].y = Math.max(labs[k].y, labs[k - 1].y + gap);
    const over = labs.length ? labs[labs.length - 1].y - (T + ph - 8) : 0;
    if (over > 0) { labs.forEach((l) => (l.y -= over)); for (let k = labs.length - 2; k >= 0; k--) labs[k].y = Math.min(labs[k].y, labs[k + 1].y - gap); }
    const xEnd = X(cur), lx = Math.min(L + pw + 8, xEnd + 14), maxW = W - AX - lx - 4;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const l of labs) {
      ctx.strokeStyle = l.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xEnd, l.y0); ctx.lineTo(lx - 2, l.y); ctx.stroke(); ctx.globalAlpha = 1;
      const txt = `${l.name} ${fmtVal(l.v, o)}`;
      const tw = Math.min(maxW, ctx.measureText(txt).width + 22);
      ctx.fillStyle = COL.surface; ctx.fillRect(lx, l.y - 8, tw, 16);
      ctx.fillStyle = l.color; ctx.fillRect(lx + 4, l.y - 4, 8, 8);
      ctx.fillStyle = COL.fg; ctx.fillText(txt, lx + 16, l.y, tw - 18);
    }

    // Crosshair
    if (S.hoverIdx != null && S.hoverIdx <= cur) {
      const x = Math.round(X(S.hoverIdx)) + 0.5;
      ctx.strokeStyle = COL.muted; ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke();
      if (S.hoverY != null) { ctx.beginPath(); ctx.moveTo(L, S.hoverY + 0.5); ctx.lineTo(L + pw, S.hoverY + 0.5); ctx.stroke(); }
      ctx.setLineDash([]);
      if (S.hoverY != null) {
        const v = lo + (1 - (S.hoverY - T) / ph) * (hi - lo), txt = fmtVal(v, o);
        ctx.fillStyle = COL.gold; ctx.fillRect(W - AX + 2, S.hoverY - 9, AX - 4, 18);
        ctx.fillStyle = '#0B0B0C'; ctx.textAlign = 'left'; ctx.fillText(txt.replace(/^\+/, ''), W - AX + 6, S.hoverY);
      }
    }
  }

  // ── Interacción: crosshair, línea más cercana, tooltip ─────────────────
  function pointAt(px, py) {
    if (!geo) return;
    const { L, pw, n, X, Y, T, ph } = geo;
    const cur = S.cursor ?? n - 1;
    const i = Math.max(0, Math.min(cur, Math.round(((px - L) / pw) * (n - 1))));
    let best = null, bd = 14;
    for (const c of visibleCoins()) { const v = valAt(c, i); if (v == null) continue; const d = Math.abs(Y(v) - py); if (d < bd) { bd = d; best = c; } }
    S.hoverIdx = i; S.hoverY = py >= T && py <= T + ph ? py : null;
    S.hover = best;
    showTip(i, px, py);
    draw();
  }
  function clearHover() { S.hoverIdx = null; S.hover = null; S.hoverY = null; $('spTip').hidden = true; draw(); }

  function showTip(i, px, py) {
    const o = opt(), tip = $('spTip'), cur = S.cursor ?? geo.n - 1, hl = highlighted(cur);
    const keys = new Set(hl); if (S.hover) keys.add(S.hover);
    const rows = [...keys].map((c) => [c, valAt(c, i)]).filter((r) => r[1] != null).sort((a, b) => b[1] - a[1]).slice(0, 12);
    tip.textContent = '';
    const t = document.createElement('time'); t.textContent = fmtTime(S.t0 + (S.base + i) * S.step, true); tip.append(t);
    const ol = document.createElement('ol');
    const li = (name, v, color, cls) => {
      const el = document.createElement('li'); if (cls) el.className = cls;
      const sw = document.createElement('span'); sw.className = 'sw'; if (color) sw.style.background = color;
      const nm = document.createElement('span'); nm.textContent = name;
      const b = document.createElement('b'); b.textContent = fmtVal(v, o);
      el.append(sw, nm, b); ol.append(el);
    };
    if (S.showAvg) li('Promedio global', S.out.avg[i], COL.fg);
    for (const [c, v] of rows) li(labelOf(c), v, colorOf(c) || EXTRA, c === S.hover ? 'hov' : '');
    tip.append(ol); tip.hidden = false;
    const fig = tip.parentElement.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = px + 16, y = py + 12;
    if (x + tw > fig.width - geo.R + 40) x = px - tw - 16;
    if (y + th > fig.height - 8) y = Math.max(8, fig.height - th - 8);
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = y + 'px';
  }

  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); pointAt(e.clientX - r.left, e.clientY - r.top); });
  cv.addEventListener('pointerleave', clearHover);
  cv.addEventListener('click', () => { if (S.hover) { togglePin(S.hover); } });
  cv.addEventListener('keydown', (e) => {
    if (!geo || !['ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') return clearHover();
    const cur = S.cursor ?? geo.n - 1;
    const i = Math.max(0, Math.min(cur, (S.hoverIdx ?? cur) + (e.key === 'ArrowRight' ? 1 : -1)));
    S.hoverIdx = i; S.hoverY = null; S.hover = null; showTip(i, geo.X(i), geo.T + 20); draw();
  });
  new ResizeObserver(draw).observe(cv);

  function togglePin(c) { S.pinned.has(c) ? S.pinned.delete(c) : S.pinned.add(c); renderLegend(); draw(); }

  // ── Leyenda: visibilidad, fijar y hover ────────────────────────────────
  $('spLegBody').addEventListener('change', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    const c = tr.dataset.c;
    if (c === '__avg') S.showAvg = e.target.checked; else e.target.checked ? S.hidden.delete(c) : S.hidden.add(c);
    recompute();
  });
  $('spLegBody').addEventListener('click', (e) => { const b = e.target.closest('button[data-act=pin]'); if (b && !b.disabled) togglePin(b.closest('tr').dataset.c); });
  $('spLegBody').addEventListener('pointerover', (e) => { const tr = e.target.closest('tr'); const c = tr && tr.dataset.c; if (c && c !== '__avg' && c !== S.hover) { S.hover = c; draw(); } });
  $('spLegBody').addEventListener('pointerleave', () => { if (S.hoverIdx == null) { S.hover = null; draw(); } });
  $('spAll').addEventListener('change', (e) => { S.hidden = e.target.checked ? new Set() : new Set(S.coins); recompute(); });

  // ── Selector de activos ────────────────────────────────────────────────
  function catalog() {
    if (!S.live) { snap = snap || env.snapshot(); return Object.keys(snap.c).map((c) => ({ real:c, label:c, group:'perp', vol:0, alias:c })); }
    return env.CAT.list;
  }
  function topN(n) {
    const g = S.group, pool = catalog().filter((m) => g === 'all' || m.group === g);
    return pool.slice(0, n).map((m) => m.real);
  }
  function renderCoins() {
    const q = $('spCoinsQ').value.trim().toLowerCase(), g = S.group, sel = new Set(S.coins);
    const list = catalog().filter((m) => (g === 'all' || m.group === g) && (!q || short(m).toLowerCase().includes(q)));
    const ul = $('spCoinsList'); ul.textContent = '';
    for (const m of list.slice(0, 250)) {
      const li = document.createElement('li'), lab = document.createElement('label'), cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = m.real; cb.checked = sel.has(m.real);
      const b = document.createElement('b'); b.textContent = short(m);
      const v = document.createElement('span'); v.textContent = m.vol ? (m.vol >= 1e9 ? nf(m.vol / 1e9, 2) + ' B' : nf(m.vol / 1e6, 1) + ' M') : '';
      lab.append(cb, b, v); li.append(lab); ul.append(li);
    }
    $('spCoinsFoot').textContent = `${S.coins.length} seleccionados · máximo ${MAX_COINS}` + (S.live ? ' · ordenados por volumen 24h' : ' · snapshot del modo demo');
    $('spCoinsLbl').textContent = `${S.coins.length} activos`;
  }
  function setCoins(list) {
    S.coins = [...new Set(list)].slice(0, MAX_COINS);
    for (const c of Object.keys(S.raw)) if (!S.coins.includes(c)) delete S.raw[c];
    S.hidden.forEach((c) => { if (!S.coins.includes(c)) S.hidden.delete(c); });
    renderCoins();
    S.live ? load(true).then(openWs) : loadSnapshot();
  }
  $('spCoinsList').addEventListener('change', (e) => {
    const c = e.target.value;
    setCoins(e.target.checked ? [...S.coins, c] : S.coins.filter((x) => x !== c));
  });
  $('spPreset').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setCoins(topN(+b.dataset.n)); });
  $('spGroup').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.group = b.dataset.g;
    $('spGroup').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderCoins();
  });
  $('spCoinsQ').addEventListener('input', renderCoins);

  // ── Popovers ───────────────────────────────────────────────────────────
  function popover(btn, pop) {
    const set = (open) => { pop.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', () => set(pop.hidden));
    document.addEventListener('mousedown', (e) => { if (!pop.hidden && !btn.parentElement.contains(e.target)) set(false); });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { set(false); btn.focus(); } });
    return set;
  }
  const openCoins = popover($('spCoinsBtn'), $('spCoinsPop'));
  $('spCoinsBtn').addEventListener('click', () => { if (!$('spCoinsPop').hidden) { renderCoins(); $('spCoinsQ').focus(); } });
  popover($('spFxBtn'), $('spFxPop'));

  // ── Controles ──────────────────────────────────────────────────────────
  $('spFxPop').addEventListener('change', recompute);
  $('spLen').addEventListener('input', recompute);
  $('spRef').addEventListener('change', () => {
    if ($('spRef').value === 'BTC' && !S.raw.BTC && S.live) { S.coins.includes('BTC') || S.coins.push('BTC'); load(true); } else recompute();
  });
  ['spTop', 'spBot'].forEach((id) => $(id).addEventListener('change', () => { renderLegend(); draw(); }));
  $('spLegOn').addEventListener('change', () => { $('spBody').classList.toggle('noleg', !$('spLegOn').checked); draw(); });
  $('spSrc').addEventListener('change', () => load(false));
  $('spLb').addEventListener('change', () => { syncTfOptions(); load(false); });
  $('spTf').addEventListener('change', () => load(false));
  $('spReload').addEventListener('click', () => load(false));

  // Replay
  let playT = null;
  function setPlaying(on) {
    S.playing = on; $('spPlay').textContent = on ? '❚❚' : '▶'; $('spPlay').setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
    clearInterval(playT);
    if (!on) return;
    const n = S.out.avg.length; if (S.cursor >= n - 1) S.cursor = Math.min(n - 1, 10);
    playT = setInterval(() => {
      S.cursor = Math.min(n - 1, S.cursor + 1); $('spScrub').value = S.cursor;
      updateText(opt()); renderLegend(); draw();
      if (S.cursor >= n - 1) setPlaying(false);
    }, Math.max(30, Math.min(160, 7000 / n)));
  }
  $('spReplayBtn').addEventListener('click', () => {
    const on = $('spReplay').hidden;
    $('spReplay').hidden = !on; $('spReplayBtn').setAttribute('aria-pressed', String(on));
    if (!on) { setPlaying(false); S.cursor = S.out.avg.length - 1; updateText(opt()); renderLegend(); draw(); }
  });
  $('spPlay').addEventListener('click', () => setPlaying(!S.playing));
  $('spScrub').addEventListener('input', () => { setPlaying(false); S.cursor = +$('spScrub').value; updateText(opt()); renderLegend(); draw(); });

  window.addEventListener('ba:ratewait', (e) => {
    if ($('panel-spag').hidden) return;
    const msg = `Esperando el límite de pedidos de Hyperliquid · ${e.detail} s`;
    if (!$('spVeil').classList.contains('off')) veil(msg); else if (/Cargando/.test($('spNote').textContent)) $('spNote').textContent = msg;
  });
  function veil(txt) { $('spVeil').classList.toggle('off', txt == null); if (txt != null) $('spVeilTxt').textContent = txt; }

  // ── Arranque ───────────────────────────────────────────────────────────
  (async function start() {
    if (!S.live) {
      ['spSrc', 'spLb', 'spTf', 'spReload'].forEach((id) => { $(id).disabled = true; $(id).title = 'Disponible con datos en vivo'; });
      $('spGroup').hidden = true;
      snap = env.snapshot();
      S.coins = Object.keys(snap.c);
      $('spNote').textContent = `Modo demo: snapshot real de Hyperliquid (40 perps con más volumen, velas de 1H) del ${new Date(snap.t0).toLocaleDateString('es-AR', { day:'numeric', month:'short' })} al ${new Date(snap.t0 + (snap.n - 1) * snap.step).toLocaleString('es-AR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}. Abrí el archivo en tu navegador para verlo en vivo.`;
      renderCoins(); loadSnapshot(); return;
    }
    veil('Cargando mercados de Hyperliquid…');
    if (!env.CAT.ready) { try { await env.loadCatalog(); } catch { veil('No se pudo cargar la lista de mercados. Probá con Actualizar.'); return; } }
    syncTfOptions();
    S.coins = topN(30);
    renderCoins();
    $('spNote').textContent = liveNote();
    load(false);
  })();

  return {
    show() { draw(); if (S.live && !ws && Object.keys(S.raw).length) openWs(); },
    hide() { closeWs(); setPlaying(false); clearHover(); }
  };
};
