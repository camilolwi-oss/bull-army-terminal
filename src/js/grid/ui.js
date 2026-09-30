// Grid · screener de varios mercados con velas, Aurora y Hull Suite. Se crea al abrir la sección.
// env: { live, CAT, loadCatalog, hlPost, makePicker, labelOf, openAurora(alias, tf) }
window.createGrid = function createGrid(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const A = window.AuroraMath;
  const WS_URL = 'wss://api.hyperliquid.xyz/ws';
  const IV_MS = { '1m':6e4, '5m':3e5, '15m':9e5, '30m':18e5, '1h':36e5, '4h':144e5, '1d':864e5 };
  const TF_AURORA = { '1m':'1', '5m':'5', '15m':'15', '30m':'30', '1h':'60', '4h':'240', '1d':'1D' };
  const BARS = 300;          // velas por mercado: las primeras ~150 calientan Aurora, se dibujan las últimas
  const SHOW_MAX = 150;
  const ALERT_BARS = 3;      // una señal cuenta como reciente si ocurrió en las últimas 3 velas
  const COL = {
    bg:'#0B0B0C', grid:'#17171A', line:'#25252A', text:'#8E8B84', faint:'#5B5953', fg:'#ECE9E2',
    up:'#7FAF7F', dn:'#C8704F', cyan:'#29E6C9', rose:'#FF4F7B', gold:'#C9A227', hullUp:'#00FF00', hullDn:'#FF0000'
  };
  const SIZES = { '2x2':[2,2], '3x2':[3,2], '3x3':[3,3], '4x3':[4,3], '4x4':[4,4], '5x4':[5,4], '5x5':[5,5] };
  const FILLS = {
    perp:   { label:'Top volumen · Perps',  pick:(l) => l.filter((m) => m.group === 'perp') },
    hip3:   { label:'Top volumen · HIP-3',  pick:(l) => l.filter((m) => m.group === 'hip3') },
    spot:   { label:'Top volumen · Spot',   pick:(l) => l.filter((m) => m.group === 'spot') },
    movers: { label:'Más movidos 24 h',     pick:(l) => l.slice(0, 120).filter((m) => m.prev).sort((a, b) => Math.abs(b.px / b.prev - 1) - Math.abs(a.px / a.prev - 1)) },
    gainers:{ label:'Mayores subas 24 h',   pick:(l) => l.slice(0, 120).filter((m) => m.prev).sort((a, b) => b.px / b.prev - a.px / a.prev) },
    losers: { label:'Mayores bajas 24 h',   pick:(l) => l.slice(0, 120).filter((m) => m.prev).sort((a, b) => a.px / a.prev - b.px / b.prev) }
  };

  // ── Estado (se guarda en este navegador) ─────────────────────────────
  const KEY = 'baGrid';
  let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
  const S = { size:'4x4', tf:'15m', list:[], hull:true, ob:true, osc:true, alert:true, ...(saved || {}) };
  if (!SIZES[S.size]) S.size = '4x4';
  if (!IV_MS[S.tf]) S.tf = '15m';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ size:S.size, tf:S.tf, list:S.list, hull:S.hull, ob:S.ob, osc:S.osc, alert:S.alert })); } catch {} };
  const count = () => SIZES[S.size][0] * SIZES[S.size][1];

  const cache = new Map();   // "alias|tf" → { k:[velas], a:aurora, h:hull, err }
  let cells = [], ws = null, wsTimer = null, wsRetry = 0, subs = new Set(), visible = false, drawQueued = false, editing = -1, token = 0;

  // ── Utilidades ───────────────────────────────────────────────────────
  const market = (alias) => env.CAT.byAlias.get(alias);
  const real = (alias) => env.CAT.realOf.get(alias) || alias;
  const tag = (m) => (m ? ({ perp:'perp', spot:'spot', hip3:'hip-3' })[m.group] : '');
  const nameOf = (alias) => { const m = market(alias); return m ? (m.group === 'perp' ? m.real : m.label) : alias; };
  const decs = (p) => (p > 0 ? Math.min(8, Math.max(0, 4 - Math.floor(Math.log10(p)))) : 2);
  const fmt = (p, d = decs(p)) => (Number.isFinite(p) ? p.toLocaleString('es-AR', { minimumFractionDigits:d, maximumFractionDigits:d }) : '—');
  const toK = (x) => ({ t:+x.t, o:+x.o, h:+x.h, l:+x.l, c:+x.c, v:+x.v });

  function defaults(n) {
    const out = [...S.list];
    for (const m of env.CAT.list) { if (out.length >= n) break; if (m.group === 'perp' && !out.includes(m.alias)) out.push(m.alias); }
    return out;
  }

  // ── Datos ────────────────────────────────────────────────────────────
  function analyze(entry) {
    entry.a = A.compute(entry.k);
    entry.h = A.hull(entry.k.map((x) => x.c), S.hullLen || 55);
    entry.sig = A.latestSignal(entry.a, ALERT_BARS);
  }
  async function load(alias, tf, my) {
    const key = alias + '|' + tf;
    const now = Date.now(), start = now - BARS * IV_MS[tf];
    try {
      const rows = await env.hlPost({ type:'candleSnapshot', req:{ coin: real(alias), interval: tf, startTime: start, endTime: now } });
      if (my !== token) return;
      const entry = { k: (rows || []).map(toK) };
      if (entry.k.length < 30) { cache.set(key, { err:'Sin historial suficiente en esta temporalidad.' }); }
      else { analyze(entry); cache.set(key, entry); }
    } catch {
      if (my === token) cache.set(key, { err:'No se pudo cargar. Probá de nuevo en unos segundos.' });
    }
    paintHead(alias); queueDraw();
  }
  async function loadAll() {
    const my = ++token, todo = [...new Set(cells.map((c) => c.alias))].filter((a) => !cache.has(a + '|' + S.tf));
    let i = 0;
    status();
    await Promise.all(Array.from({ length: 4 }, async () => { while (i < todo.length) { const a = todo[i++]; await load(a, S.tf, my); status(); } }));
  }

  // WebSocket de velas: una sola conexión con una suscripción por mercado visible.
  function wanted() { return new Set(cells.map((c) => real(c.alias))); }
  function sub(coin, on) { try { ws.send(JSON.stringify({ method: on ? 'subscribe' : 'unsubscribe', subscription: { type:'candle', coin, interval:S.tf } })); } catch {} }
  function syncSubs() {
    if (!ws || ws.readyState !== 1) return;
    const want = wanted();
    for (const s of subs) if (!want.has(s)) sub(s, false);
    for (const s of want) if (!subs.has(s)) sub(s, true);
    subs = want;
  }
  function openWs() {
    if (!env.live || ws || !visible) return;
    const w = ws = new WebSocket(WS_URL);
    subs = new Set();
    w.onopen = () => { wsRetry = 0; syncSubs(); wsTimer = setInterval(() => { try { w.send('{"method":"ping"}'); } catch {} }, 50000); };
    w.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.channel !== 'candle' || !m.data) return;
      const d = m.data; if (d.i !== S.tf) return;
      const k = toK(d);
      for (const c of cells) {
        if (real(c.alias) !== d.s) continue;
        const entry = cache.get(c.alias + '|' + S.tf);
        if (!entry || !entry.k) continue;
        const last = entry.k[entry.k.length - 1];
        if (k.t === last.t) entry.k[entry.k.length - 1] = k;
        else if (k.t > last.t) { entry.k.push(k); if (entry.k.length > BARS) entry.k.shift(); }
        else continue;
        entry.stale = true;
      }
      queueDraw();
    };
    w.onclose = () => {
      clearInterval(wsTimer);
      if (ws !== w) return;
      ws = null;
      if (visible) setTimeout(openWs, Math.min(30000, 2000 * 2 ** wsRetry++));
    };
  }
  function closeWs() { const w = ws; ws = null; clearInterval(wsTimer); if (w) try { w.close(); } catch {} }

  // ── Celdas ───────────────────────────────────────────────────────────
  function build() {
    const [cols, rows] = SIZES[S.size], n = cols * rows;
    S.list = defaults(Math.max(n, S.list.length));
    const grid = $('gdGrid');
    grid.style.setProperty('--cols', cols); grid.style.setProperty('--rows', rows);
    grid.dataset.size = S.size;
    grid.textContent = '';
    cells = S.list.slice(0, n).map((alias, i) => {
      const el = document.createElement('article');
      el.className = 'gd-cell'; el.dataset.i = i;
      el.innerHTML = `<header class="gd-head" draggable="true" title="Arrastrá para cambiar de lugar">
          <button type="button" class="gd-name" title="Cambiar de activo"><b></b><span class="caret" aria-hidden="true">▾</span></button><i class="gd-tag"></i>
          <span class="gd-sig" hidden></span><span class="gd-sp"></span>
          <span class="gd-px"></span><span class="gd-ch"></span>
          <button type="button" class="gd-open" title="Abrir en la sección Aurora" aria-label="Abrir en Aurora">↗</button>
        </header><canvas></canvas><p class="gd-msg">Cargando…</p>`;
      grid.append(el);
      const c = { alias, el, cv: el.querySelector('canvas'), hover: null };
      el.querySelector('.gd-name').addEventListener('click', () => editCell(i));
      el.querySelector('.gd-open').addEventListener('click', () => env.openAurora(c.alias, TF_AURORA[S.tf]));
      c.cv.addEventListener('dblclick', () => env.openAurora(c.alias, TF_AURORA[S.tf]));
      c.cv.addEventListener('mousemove', (e) => { const r = c.cv.getBoundingClientRect(); c.hover = e.clientX - r.left; drawCell(c); });
      c.cv.addEventListener('mouseleave', () => { c.hover = null; drawCell(c); });
      const head = el.querySelector('.gd-head');
      head.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
      head.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop'); });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drop'); swap(+e.dataTransfer.getData('text/plain'), i); });
      return c;
    });
    cells.forEach((c) => paintHead(c.alias));
    fit(); save(); syncSubs(); loadAll(); queueDraw();
  }
  function swap(a, b) {
    if (!(a >= 0) || a === b) return;
    [S.list[a], S.list[b]] = [S.list[b], S.list[a]];
    build();
  }
  function setCell(i, alias) {
    const was = S.list.indexOf(alias);
    if (was >= 0 && was !== i) S.list[was] = S.list[i];   // si ya estaba en el grid, intercambian lugares
    S.list[i] = alias;
    build();
  }

  // Un solo buscador que se abre sobre la celda que se edita.
  const picker = env.makePicker('gd', { current: () => (editing >= 0 ? S.list[editing] : ''), onPick: (alias) => { if (editing >= 0) setCell(editing, alias); } });
  function editCell(i) {
    editing = i;
    const wrap = $('gdWrap').getBoundingClientRect(), r = cells[i].el.getBoundingClientRect(), ctl = $('gdSymCtl');
    ctl.style.left = Math.max(0, Math.min(r.left - wrap.left, wrap.width - 560)) + 'px';
    ctl.style.top = (r.top - wrap.top + 30) + 'px';
    picker.open(true);
  }

  function paintHead(alias) {
    for (const c of cells) {
      if (c.alias !== alias) continue;
      const m = market(alias), entry = cache.get(alias + '|' + S.tf), h = c.el;
      h.querySelector('.gd-name b').textContent = nameOf(alias);
      h.querySelector('.gd-tag').textContent = tag(m);
      const msg = h.querySelector('.gd-msg');
      msg.hidden = !!(entry && entry.k); msg.textContent = entry && entry.err ? entry.err : 'Cargando…';
      if (!entry || !entry.k) { h.querySelector('.gd-px').textContent = ''; h.querySelector('.gd-ch').textContent = ''; h.querySelector('.gd-sig').hidden = true; h.classList.remove('sig-up', 'sig-dn'); continue; }
      const last = entry.k[entry.k.length - 1].c;
      h.querySelector('.gd-px').textContent = fmt(last);
      const ch = m && m.prev ? (last / m.prev - 1) * 100 : NaN, chEl = h.querySelector('.gd-ch');
      chEl.textContent = Number.isFinite(ch) ? (ch > 0 ? '+' : '') + fmt(ch, 2) + '%' : '';
      chEl.className = 'gd-ch ' + (ch > 0 ? 'up' : ch < 0 ? 'dn' : '');
      const sig = S.alert ? entry.sig : null, sEl = h.querySelector('.gd-sig');
      sEl.hidden = !sig;
      if (sig) {
        const short = /^Giro/.test(sig.kind) ? 'Giro' : /^Div/.test(sig.kind) ? 'Div.' : 'OB ✓';
        sEl.textContent = (sig.side > 0 ? '▲ ' : '▼ ') + short + (sig.ago ? ` ${sig.ago}v` : '');
        sEl.title = sig.kind + (sig.ago ? ` · hace ${sig.ago} ${sig.ago === 1 ? 'vela' : 'velas'}` : ' · en la vela actual');
        sEl.className = 'gd-sig ' + (sig.side > 0 ? 's-up' : 's-dn');
      }
      h.classList.toggle('sig-up', !!sig && sig.side > 0); h.classList.toggle('sig-dn', !!sig && sig.side < 0);
    }
  }
  function status() {
    const n = cells.length, done = cells.filter((c) => cache.has(c.alias + '|' + S.tf)).length;
    const [cols, rows] = SIZES[S.size];
    $('gdStatus').innerHTML = done < n
      ? `Cargando ${done} de ${n} mercados…`
      : `<b>${cols}×${rows}</b> · ${n} mercados en vivo desde Hyperliquid. Tocá el nombre de una celda para cambiarla, arrastrala por el encabezado para moverla y hacé doble clic en el gráfico para abrirla en Aurora.`;
  }

  // ── Dibujo ───────────────────────────────────────────────────────────
  function queueDraw() {
    if (drawQueued || !visible) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      const touched = new Set();
      for (const [key, e] of cache) if (e.stale) { e.stale = false; analyze(e); touched.add(key.split('|')[0]); }
      touched.forEach(paintHead);
      cells.forEach(drawCell);
    });
  }
  function drawCell(c) {
    const cv = c.cv, dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
    const entry = cache.get(c.alias + '|' + S.tf);
    if (!entry || !entry.k) return;
    const { k, a, h } = entry;
    const AX = 58, TAX = 14, plotW = W - AX;
    const oscH = S.osc ? Math.max(34, Math.round((H - TAX) * 0.3)) : 0;
    const pTop = 4, pBot = H - TAX - oscH - (S.osc ? 4 : 0), oTop = pBot + 4, oBot = H - TAX;
    const n = Math.max(20, Math.min(SHOW_MAX, k.length, Math.floor(plotW / 4))), s0 = k.length - n;
    const bw = plotW / n, x = (i) => (i - s0 + 0.5) * bw;
    // Escala de precio: velas visibles + Hull, sin dejar que un OB lejano aplaste el gráfico.
    let lo = Infinity, hi = -Infinity;
    for (let i = s0; i < k.length; i++) { lo = Math.min(lo, k[i].l); hi = Math.max(hi, k[i].h); }
    const pad = (hi - lo) * 0.08 || hi * 0.001; lo -= pad; hi += pad;
    const y = (p) => pTop + (hi - p) / (hi - lo) * (pBot - pTop);

    // Grilla y eje de precio
    g.font = '10px "IBM Plex Mono", ui-monospace, monospace'; g.textBaseline = 'middle';
    const stepP = niceStep((hi - lo) / 4), d = Math.max(0, -Math.floor(Math.log10(stepP)));
    for (let p = Math.ceil(lo / stepP) * stepP; p < hi; p += stepP) {
      const yy = Math.round(y(p)) + 0.5;
      g.strokeStyle = COL.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yy); g.lineTo(plotW, yy); g.stroke();
      g.fillStyle = COL.faint; g.textAlign = 'left'; g.fillText(fmt(p, Math.min(8, d)), plotW + 6, yy);
    }

    // Order Blocks activos
    if (S.ob) for (const b of a.obs) {
      const x0 = Math.max(0, x(b.from) - bw / 2); if (x0 >= plotW) continue;
      const y0 = y(b.top), y1 = y(b.bot); if (y1 < pTop || y0 > pBot) continue;
      const cl = b.side > 0 ? COL.cyan : COL.rose;
      g.fillStyle = hexA(cl, b.conf ? 0.2 : 0.11); g.fillRect(x0, y0, plotW - x0, Math.max(1, y1 - y0));
      g.strokeStyle = b.conf ? COL.gold : hexA(cl, 0.55); g.lineWidth = b.conf ? 1.5 : 1; g.strokeRect(x0 + 0.5, y0 + 0.5, plotW - x0 - 1, Math.max(1, y1 - y0) - 1);
      if (bw * n > 140 && y1 - y0 > 9) { g.fillStyle = b.conf ? COL.gold : cl; g.textAlign = 'right'; g.fillText(b.conf ? 'OB ✓' : 'OB', plotW - 4, (y0 + y1) / 2); }
    }

    // Volumen tenue en la base del panel de precio
    let vMax = 0; for (let i = s0; i < k.length; i++) vMax = Math.max(vMax, k[i].v);
    const vH = (pBot - pTop) * 0.18;
    for (let i = s0; i < k.length; i++) {
      const v = vMax ? k[i].v / vMax * vH : 0;
      g.fillStyle = hexA(k[i].c >= k[i].o ? COL.up : COL.dn, 0.22);
      g.fillRect(x(i) - bw * 0.35, pBot - v, Math.max(1, bw * 0.7), v);
    }

    // Velas
    const body = Math.max(1, Math.floor(bw * 0.65));
    for (let i = s0; i < k.length; i++) {
      const q = k[i], up = q.c >= q.o, xx = Math.round(x(i)) + 0.5;
      g.strokeStyle = g.fillStyle = up ? COL.up : COL.dn; g.lineWidth = 1;
      g.beginPath(); g.moveTo(xx, y(q.h)); g.lineTo(xx, y(q.l)); g.stroke();
      const yt = y(Math.max(q.o, q.c)), yb = y(Math.min(q.o, q.c));
      g.fillRect(xx - body / 2, yt, body, Math.max(1, yb - yt));
    }

    // Hull Suite: línea del color de su pendiente (sube o baja contra 2 velas atrás)
    if (S.hull) {
      g.lineWidth = 2;
      for (let i = Math.max(s0 + 1, 2); i < k.length; i++) {
        if (!Number.isFinite(h[i]) || !Number.isFinite(h[i - 1])) continue;
        g.strokeStyle = h[i] > h[i - 2] ? COL.hullUp : COL.hullDn;
        g.beginPath(); g.moveTo(x(i - 1), y(h[i - 1])); g.lineTo(x(i), y(h[i])); g.stroke();
      }
    }

    // Precio actual: línea punteada y etiqueta en el eje
    const last = k[k.length - 1], ly = y(last.c), lc = last.c >= last.o ? COL.up : COL.dn;
    g.setLineDash([2, 3]); g.strokeStyle = hexA(lc, 0.7); g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, Math.round(ly) + 0.5); g.lineTo(plotW, Math.round(ly) + 0.5); g.stroke(); g.setLineDash([]);
    g.fillStyle = lc; g.fillRect(plotW + 1, ly - 8, AX - 2, 16);
    g.fillStyle = COL.bg; g.textAlign = 'left'; g.font = '600 10px "IBM Plex Mono", ui-monospace, monospace'; g.fillText(fmt(last.c), plotW + 5, ly);
    g.font = '10px "IBM Plex Mono", ui-monospace, monospace';

    // Mini oscilador de Aurora
    if (S.osc) {
      const oy = (v) => oTop + (100 - Math.max(-100, Math.min(100, v))) / 200 * (oBot - oTop);
      g.strokeStyle = COL.line; g.beginPath(); g.moveTo(0, oTop - 2.5); g.lineTo(W, oTop - 2.5); g.stroke();
      g.setLineDash([2, 3]); g.strokeStyle = COL.faint;
      for (const lv of [50, -50]) { g.beginPath(); g.moveTo(0, Math.round(oy(lv)) + 0.5); g.lineTo(plotW, Math.round(oy(lv)) + 0.5); g.stroke(); }
      g.setLineDash([5, 4]); g.strokeStyle = hexA(COL.text, 0.5); g.beginPath(); g.moveTo(0, Math.round(oy(0)) + 0.5); g.lineTo(plotW, Math.round(oy(0)) + 0.5); g.stroke(); g.setLineDash([]);
      // Divergencias: línea punteada dorada entre pivotes y punto en el segundo
      g.strokeStyle = COL.gold; g.fillStyle = COL.gold; g.lineWidth = 1;
      for (const dv of a.divs) {
        if (dv.to < s0) continue;
        g.setLineDash([2, 2]); g.beginPath(); g.moveTo(x(Math.max(dv.from, s0)), oy(dv.osc0)); g.lineTo(x(dv.to), oy(dv.osc1)); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(x(dv.to), oy(dv.osc1), 2.5, 0, Math.PI * 2); g.fill();
      }
      g.lineWidth = 1.6;
      for (let i = s0 + 1; i < k.length; i++) {
        const v0 = a.osc[i - 1], v1 = a.osc[i]; if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue;
        g.strokeStyle = v1 >= v0 ? COL.cyan : COL.rose;
        g.beginPath(); g.moveTo(x(i - 1), oy(v0)); g.lineTo(x(i), oy(v1)); g.stroke();
      }
      // Giros en zona extrema
      for (let i = s0; i < k.length; i++) {
        if (a.sigDn[i]) tri(g, x(i), oy(a.osc[i - 1]) - 7, -1, COL.rose);
        if (a.sigUp[i]) tri(g, x(i), oy(a.osc[i - 1]) + 7, 1, COL.cyan);
      }
      const ov = a.osc[k.length - 1];
      if (Number.isFinite(ov)) { g.fillStyle = ov >= (a.osc[k.length - 2] ?? ov) ? COL.cyan : COL.rose; g.textAlign = 'left'; g.fillText(fmt(ov, 1), plotW + 6, oy(ov)); }
    }

    // Eje de tiempo
    g.fillStyle = COL.faint; g.textAlign = 'center';
    const daily = IV_MS[S.tf] >= 864e5;
    for (let j = 1; j <= 3; j++) {
      const i = s0 + Math.round(n * j / 4); if (i >= k.length) continue;
      const dt = new Date(k[i].t);
      const txt = daily || dt.getHours() + dt.getMinutes() === 0 ? dt.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' }) : dt.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
      g.fillText(txt, x(i), H - TAX / 2);
    }

    // Cursor: línea vertical y valores de la vela
    if (c.hover != null && c.hover < plotW) {
      const i = Math.min(k.length - 1, Math.max(s0, s0 + Math.floor(c.hover / bw))), xx = Math.round(x(i)) + 0.5;
      g.strokeStyle = hexA(COL.fg, 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, H - TAX); g.stroke();
      const q = k[i], dt = new Date(q.t);
      const when = daily ? dt.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : dt.toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
      const txt = `${when}  C ${fmt(q.c)}  ${(q.c / q.o - 1 >= 0 ? '+' : '')}${fmt((q.c / q.o - 1) * 100, 2)}%` + (Number.isFinite(a.osc[i]) ? `  Aurora ${fmt(a.osc[i], 1)}` : '');
      g.textAlign = 'left'; const tw = g.measureText(txt).width + 10;
      g.fillStyle = hexA(COL.bg, 0.9); g.fillRect(4, 4, tw, 16);
      g.fillStyle = COL.fg; g.fillText(txt, 9, 12);
    }
  }
  function tri(g, x, y, dir, cl) { g.fillStyle = cl; g.beginPath(); g.moveTo(x, y - 4 * dir); g.lineTo(x - 4, y + 3 * dir); g.lineTo(x + 4, y + 3 * dir); g.closePath(); g.fill(); }
  function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  // ── Controles ────────────────────────────────────────────────────────
  const pressed = (seg, attr, val) => $(seg).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[attr] === val)));
  $('gdSize').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.s === S.size) return;
    S.size = b.dataset.s; pressed('gdSize', 's', S.size); build();
  });
  $('gdTf').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.dataset.tf === S.tf) return;
    for (const s of subs) sub(s, false); subs = new Set();
    S.tf = b.dataset.tf; pressed('gdTf', 'tf', S.tf); save();
    cells.forEach((c) => paintHead(c.alias)); syncSubs(); loadAll(); queueDraw();
  });
  for (const [id, key] of [['gdHull', 'hull'], ['gdOB', 'ob'], ['gdOsc', 'osc'], ['gdAlert', 'alert']]) {
    $(id).checked = S[key];
    $(id).addEventListener('change', () => { S[key] = $(id).checked; save(); cells.forEach((c) => paintHead(c.alias)); queueDraw(); });
  }
  // Llenar el grid con una lista automática (con opción de deshacer).
  $('gdFillPop').innerHTML = Object.entries(FILLS).map(([k, f]) => `<button type="button" data-f="${k}">${f.label}</button>`).join('');
  const fillOpen = (on) => { $('gdFillPop').hidden = !on; $('gdFillBtn').setAttribute('aria-expanded', String(on)); };
  $('gdFillBtn').addEventListener('click', () => fillOpen($('gdFillPop').hidden));
  document.addEventListener('mousedown', (e) => { if (!$('gdFillPop').hidden && !$('gdFillCtl').contains(e.target)) fillOpen(false); });
  let undo = null, toastTimer = null;
  $('gdFillPop').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]'); if (!b) return;
    fillOpen(false);
    const f = FILLS[b.dataset.f], picked = f.pick(env.CAT.list).slice(0, 25).map((m) => m.alias);
    if (!picked.length) return;
    undo = [...S.list]; S.list = picked; build();
    $('gdToastTxt').textContent = `Grid llenado con ${f.label}.`;
    $('gdToast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('gdToast').hidden = true; }, 8000);
  });
  $('gdUndo').addEventListener('click', () => { if (undo) { S.list = undo; undo = null; build(); } $('gdToast').hidden = true; });

  // En escritorio el grid ocupa el alto que queda en la ventana, así entran todas las filas.
  function fit() {
    const grid = $('gdGrid');
    if (window.innerWidth <= 1100) { grid.style.height = ''; return; }
    const top = grid.getBoundingClientRect().top + window.scrollY;
    grid.style.height = Math.max(560, window.innerHeight - top - 16) + 'px';
  }
  window.addEventListener('resize', () => visible && fit());
  new ResizeObserver(() => queueDraw()).observe($('gdGrid'));
  // Si la pestaña estuvo oculta más de un minuto, el WebSocket pudo perder velas: se recarga todo.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (visible && env.live && Date.now() - hiddenAt > 60000) { cache.clear(); cells.forEach((c) => paintHead(c.alias)); loadAll(); }
  });

  // ── Arranque ─────────────────────────────────────────────────────────
  let started = null;
  async function start() {
    pressed('gdSize', 's', S.size); pressed('gdTf', 'tf', S.tf);
    if (!env.live) { $('gdStatus').innerHTML = '<b>El Grid necesita conexión en vivo con Hyperliquid.</b> Cuando vuelva la conexión, tocá Reintentar arriba.'; return; }
    $('gdStatus').textContent = 'Cargando la lista de mercados…';
    if (!env.CAT.ready) { try { await env.loadCatalog(); } catch {} }
    if (!env.CAT.ready) { $('gdStatus').textContent = 'No se pudo cargar la lista de mercados de Hyperliquid. Probá recargar.'; return; }
    S.list = S.list.filter((a) => env.CAT.byAlias.has(a));
    build(); openWs();
  }
  return {
    show() {
      visible = true;
      if (!started) started = start();
      else if (env.live) { fit(); openWs(); cache.clear(); cells.forEach((c) => paintHead(c.alias)); loadAll(); queueDraw(); }
      return started;
    },
    hide() { visible = false; closeWs(); }
  };
};
