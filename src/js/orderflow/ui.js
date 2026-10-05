// Orderflow · perfiles por sesión sobre el gráfico de Vela: Volume Profile o TPO (letras), POC, área de valor,
// Initial Balance, single prints y niveles naked. Se dibuja en una capa propia de Vela, así sigue el zoom y el paneo.
// env: { live, hlPost, CAT, loadCatalog, loadLibs, makeProvider, makePicker, labelOf, aliasKey, THEME, TF_LABEL }
window.createOrderflow = function createOrderflow(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const O = window.OrderflowMath;
  const TF_OK = ['5', '15', '30', '60', '240', '1D'];
  const C = { gold: '#C9A227', va: 'rgba(201,162,39,.50)', out: 'rgba(142,139,132,.30)', poc: '#FFD54A', vah: '#29E6C9', val: '#FF4F7B', fg: '#ECE9E2', muted: '#8E8B84', sep: 'rgba(142,139,132,.25)', single: 'rgba(41,230,201,.28)' };
  const store = { get() { try { return JSON.parse(localStorage.getItem('baOrderflow2')) || {}; } catch { return {}; } }, set(v) { try { localStorage.setItem('baOrderflow2', JSON.stringify(v)); } catch {} } };
  const st = { symbol: 'BTC', tf: '15', sess: 'day', mode: 'vp', va: true, naked: true, nva: true, ib: true, singles: true, ...store.get() };
  if (!TF_OK.includes(st.tf)) st.tf = '15';
  if (!O.SESS[st.sess]) st.sess = 'day';
  const save = () => store.set({ symbol: st.symbol, tf: st.tf, sess: st.sess, mode: st.mode, va: st.va, naked: st.naked, nva: st.nva, ib: st.ib, singles: st.singles });

  let chart = null, started = null, visible = false, nat = null, model = null, data = { key: '', k: [] }, ws = null, wsTimer = null, tok = 0, calcT = null;
  const real = (alias) => env.CAT.realOf.get(alias) || alias;
  const decs = (p) => (p > 0 ? Math.min(8, Math.max(0, 4 - Math.floor(Math.log10(p)))) : 2);
  const fmt = (p) => (Number.isFinite(p) ? p.toLocaleString('es-AR', { minimumFractionDigits: decs(p), maximumFractionDigits: decs(p) }) : '—');
  const pct = (v) => (v > 0 ? '+' : '') + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const veil = (txt, err) => { if (txt == null) { $('ofVeil').classList.add('off'); return; } $('ofVeil').classList.remove('off'); $('ofVeilTxt').textContent = txt; $('ofVeilTxt').className = err ? 'err' : ''; };

  // ── Capa de dibujo en Vela ─────────────────────────────────────────────
  // Vela le da a la capa su canvas y su sistema de coordenadas (tiempo y precio → píxeles), y la repinta
  // con cada zoom, paneo o vela nueva. Los datos le llegan con pushData desde el indicador nativo.
  function paint(cv, a) {
    const g = cv.getContext('2d'), co = a.coords, dpr = co.dpr || 1;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = a.data; if (!m || !m.sessions) return;
    const Y = (p) => co.priceToY(p, a.scale, a.bounds), X = (t) => co.timeToX(t);
    const top = a.bounds.top, bot = a.bounds.top + a.bounds.height, W = co.width;
    const vr = co.visibleTimeRange();
    g.save(); g.beginPath(); g.rect(0, top, W, bot - top); g.clip();
    g.textBaseline = 'middle';
    for (const s of m.sessions) {
      if (s.t1 < vr.from || s.t0 > vr.to) continue;
      // Si el comienzo de la sesión quedó fuera de pantalla, el perfil se ancla al borde visible.
      const xs = X(s.t0), x0 = Math.max(xs, 2), sw = X(s.t1) - x0; if (!(sw > 2)) continue;
      const P = s[m.mode];
      // separador de sesión
      if (xs >= 0) { g.strokeStyle = C.sep; g.setLineDash([2, 4]); g.lineWidth = 1; g.beginPath(); g.moveTo(Math.round(xs) + 0.5, top); g.lineTo(Math.round(xs) + 0.5, bot); g.stroke(); g.setLineDash([]); }
      const maxW = sw * 0.82;
      if (m.mode === 'vp') {
        for (let r = 0; r < s.rows.length; r++) {
          const row = s.rows[r]; if (!row.vol) continue;
          const y0 = Y(row.p1), y1 = Y(row.p0), h = y1 - y0, w = (row.vol / P.max) * maxW;
          const inVa = m.va && r >= P.vaLo && r <= P.vaHi;
          g.fillStyle = r === P.pocRow ? C.poc : inVa ? C.va : C.out;
          g.fillRect(x0, y0 + (h > 3 ? 0.5 : 0), w, Math.max(1, h - (h > 3 ? 1 : 0)));
        }
      } else {
        const cw = Math.min(8, maxW / Math.max(1, P.max)), per = Math.max(1, s.periods);
        const rowH = Math.abs(Y(s.rows[0].p1) - Y(s.rows[0].p0)), letters = cw >= 6 && rowH >= 9;
        g.font = `600 ${Math.max(8, Math.min(11, Math.floor(rowH - 1)))}px "IBM Plex Mono", ui-monospace, monospace`; g.textAlign = 'center';
        for (let r = 0; r < s.rows.length; r++) {
          const row = s.rows[r]; if (!row.tpo) continue;
          const y0 = Y(row.p1), y1 = Y(row.p0), ym = (y0 + y1) / 2, inVa = m.va && r >= P.vaLo && r <= P.vaHi;
          if (m.singles && s.singles.includes(r)) { g.fillStyle = C.single; g.fillRect(x0, y0, cw * row.tpo + 2, y1 - y0); }
          row.letters.forEach((pi, j) => {
            const f = pi / per, col = r === P.pocRow ? C.poc : `hsl(${172 - f * 160},${inVa ? 78 : 35}%,${inVa ? 60 : 48}%)`;
            if (letters) { g.fillStyle = col; g.fillText(O.LETTERS[pi % O.LETTERS.length], x0 + (j + 0.5) * cw, ym); }
            else { g.fillStyle = col; g.fillRect(x0 + j * cw, y0 + 0.5, Math.max(1, cw - (cw > 2 ? 1 : 0)), Math.max(1, y1 - y0 - 1)); }
          });
        }
        if (m.ib && s.ib) { const y0 = Y(s.ib.hi), y1 = Y(s.ib.lo); g.fillStyle = C.gold; g.fillRect(x0 - 3, y0, 2, y1 - y0); }
      }
      // POC y área de valor de la sesión
      const xe = x0 + Math.min(sw, maxW + 20);
      g.strokeStyle = C.poc; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, Y(P.poc)); g.lineTo(xe, Y(P.poc)); g.stroke();
      if (m.va) { g.lineWidth = 1; g.setLineDash([3, 3]); g.strokeStyle = C.vah; g.beginPath(); g.moveTo(x0, Y(P.vah)); g.lineTo(xe, Y(P.vah)); g.stroke(); g.strokeStyle = C.val; g.beginPath(); g.moveTo(x0, Y(P.val)); g.lineTo(xe, Y(P.val)); g.stroke(); g.setLineDash([]); }
    }
    // Niveles naked: desde el fin de su sesión hasta el borde derecho.
    g.font = '600 10px "IBM Plex Mono", ui-monospace, monospace'; g.textAlign = 'right';
    const used = [];
    for (const n of m.nakeds) {
      if (n.kind === 'poc' ? !m.naked : !m.nva) continue;
      const y = Y(n.price); if (y < top || y > bot) continue;
      const x = Math.max(0, X(n.from)), col = n.kind === 'poc' ? C.poc : n.kind === 'vah' ? C.vah : C.val;
      g.strokeStyle = col; g.lineWidth = n.kind === 'poc' ? 1.5 : 1; g.setLineDash(n.kind === 'poc' ? [] : [6, 4]);
      g.beginPath(); g.moveTo(x, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); g.stroke(); g.setLineDash([]);
      if (used.some((u) => Math.abs(u - y) < 12)) continue;
      used.push(y);
      const txt = `n${n.kind.toUpperCase()} ${fmt(n.price)}`, tw = g.measureText(txt).width + 8;
      g.fillStyle = 'rgba(11,11,12,.85)'; g.fillRect(W - tw - 4, y - 8, tw, 16); g.fillStyle = col; g.fillText(txt, W - 8, y);
    }
    g.restore();
  }
  let registered = false;
  function register() {
    if (registered) return;
    registered = true;
    Vela.registerRendererLayer({ id: 'ba-orderflow', placement: 'above-data', create: () => { let cv = null; return { mount(c) { cv = c; }, render(a) { if (cv) paint(cv, a); }, destroy() { cv = null; } }; } });
    Vela.registerNativeIndicator({
      type: 'ba-orderflow', title: 'Orderflow', paneHint: 'price', overlay: true, legend: false,
      inputsSchema: () => [], defaultInputs: () => ({}),
      create: () => {
        const self = { ctx: null, push() { if (self.ctx) self.ctx.pushData(model && model.alias === sym(self.ctx) ? model.layer : null); } };
        nat = self;
        return { start(c) { self.ctx = c; nat = self; c.emit({}); self.push(); }, onBars() {}, onViewport() {}, setInputs() { self.push(); }, suspend() {}, resume() { self.push(); }, stop() { self.ctx = null; } };
      }
    });
  }
  const sym = (ctx) => env.aliasKey(String(ctx.symbol).replace(/^hyperliquid:/i, ''));
  const push = () => { if (nat) nat.push(); };

  // ── Datos: velas finas de Hyperliquid según la sesión (5m diaria/NY, 1h semanal, 4h mensual) ──
  const toK = (x) => ({ t: +x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v });
  async function load() {
    const my = ++tok, S = O.SESS[st.sess], key = st.symbol + '|' + st.sess;
    data = { key, k: [] }; model = null; push(); panels();
    try {
      const now = Date.now();
      const rows = await env.hlPost({ type: 'candleSnapshot', req: { coin: real(st.symbol), interval: S.src, startTime: now - 5000 * S.srcMs, endTime: now } });
      if (my !== tok) return;
      data.k = (rows || []).map(toK);
      compute(); openWs();
    } catch { if (my === tok) $('ofNote').textContent = 'No se pudieron cargar las velas de ' + env.labelOf(st.symbol) + '. Probá de nuevo en unos segundos.'; }
  }
  function openWs() {
    closeWs();
    const S = O.SESS[st.sess], key = data.key, w = new WebSocket('wss://api.hyperliquid.xyz/ws'); ws = w;
    w.onopen = () => { w.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'candle', coin: real(st.symbol), interval: S.src } })); wsTimer = setInterval(() => { try { w.send('{"method":"ping"}'); } catch {} }, 50000); };
    w.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.channel !== 'candle' || !m.data || data.key !== key) return;
      const c = toK(m.data), k = data.k, last = k[k.length - 1]; if (!last) return;
      if (c.t === last.t) k[k.length - 1] = c; else if (c.t > last.t) { k.push(c); if (k.length > 5200) k.shift(); }
      clearTimeout(calcT); calcT = setTimeout(compute, 3000);   // la sesión en curso se actualiza en vivo
    };
    w.onclose = () => { if (ws === w) { ws = null; clearInterval(wsTimer); setTimeout(() => ws === null && data.key === key && visible && openWs(), 5000); } };
  }
  function closeWs() { const w = ws; ws = null; clearInterval(wsTimer); if (w) try { w.close(); } catch {} }
  function compute() {
    if (data.k.length < 50) { model = null; push(); panels(); return; }
    const r = O.build(data.k, st.sess, { rows: 40 });
    const nk = O.nakeds(data.k, r.sessions, st.mode);
    model = { alias: st.symbol, r, nakeds: nk, layer: { sessions: r.sessions, nakeds: nk, mode: st.mode, va: st.va, naked: st.naked, nva: st.nva, ib: st.ib, singles: st.singles } };
    push(); panels();
  }

  // ── Paneles ────────────────────────────────────────────────────────────
  function panels() {
    const S = O.SESS[st.sess];
    if (!model) { $('ofCur').innerHTML = '<p class="nv-empty">Cargando…</p>'; $('ofNaked').innerHTML = ''; return; }
    const ss = model.r.sessions, cur = ss[ss.length - 1], prev = ss.filter((s) => s.done).slice(-1)[0], px = data.k[data.k.length - 1].c;
    const P = (s) => s[st.mode];
    const card = (s, title) => !s ? '' : `<div class="of-sess"><span class="nv-k">${title}</span>
      <dl><div><dt>POC</dt><dd class="gold">${fmt(P(s).poc)}</dd></div><div><dt>VAH</dt><dd class="sup">${fmt(P(s).vah)}</dd></div><div><dt>VAL</dt><dd class="res">${fmt(P(s).val)}</dd></div>
      ${s.ib ? `<div><dt>Initial Balance</dt><dd>${fmt(s.ib.lo)} – ${fmt(s.ib.hi)}</dd></div>` : ''}
      <div><dt>Forma</dt><dd>${s.shape === 'P' ? 'P (compradores arriba)' : s.shape === 'b' ? 'b (vendedores abajo)' : 'D (equilibrio)'}</dd></div>
      <div><dt>Single prints</dt><dd>${s.singles.length}</dd></div>
      ${s.poorHigh || s.poorLow ? `<div><dt>Extremos débiles</dt><dd>${[s.poorHigh ? 'máximo' : '', s.poorLow ? 'mínimo' : ''].filter(Boolean).join(' y ')}</dd></div>` : ''}</dl></div>`;
    $('ofCur').innerHTML = card(cur, `Sesión en curso · ${S.label}`) + card(prev, 'Sesión anterior');
    const near = model.nakeds.slice().sort((a, b) => Math.abs(a.price - px) - Math.abs(b.price - px)).slice(0, 10);
    $('ofNaked').innerHTML = near.map((n) => `<tr><td class="${n.kind === 'poc' ? 'gold' : n.kind === 'vah' ? 'sup' : 'res'}">n${n.kind.toUpperCase()}</td><td>${fmt(n.price)}</td><td class="${n.price >= px ? 'up' : 'dn'}">${pct((n.price / px - 1) * 100)}</td><td>${new Date(n.session).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</td></tr>`).join('') || '<tr><td colspan="4" class="dim">Sin niveles naked.</td></tr>';
    $('ofNote').innerHTML = `<b>${env.labelOf(st.symbol)}</b> · sesión ${S.label.toLowerCase()} armada con velas de ${S.src} de Hyperliquid (${model.r.sessions.length} sesiones) · nivel de ${model.r.step.toLocaleString('es-AR', { maximumFractionDigits: 8 })} · TPO de ${S.tpoMs >= 864e5 ? '1 día' : S.tpoMs / 36e5 >= 1 ? S.tpoMs / 36e5 + ' h' : S.tpoMs / 6e4 + ' min'} por letra · ${model.nakeds.length} niveles naked.`;
  }

  // ── Gráfico y controles ────────────────────────────────────────────────
  function sync() {
    document.querySelectorAll('#ofTf button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === st.tf)));
    document.querySelectorAll('#ofSess button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === st.sess)));
    document.querySelectorAll('#ofMode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === st.mode)));
    [['ofVa', 'va'], ['ofNk', 'naked'], ['ofNva', 'nva'], ['ofIb', 'ib'], ['ofSg', 'singles']].forEach(([id, k]) => { $(id).checked = st[k]; });
    $('ofIb').disabled = $('ofSg').disabled = st.mode !== 'tp';
  }
  async function switchMarket() {
    sync(); veil('Cargando ' + env.labelOf(st.symbol) + '…');
    try { await chart.setMarket({ symbol: 'hyperliquid:' + st.symbol, timeframe: st.tf }); veil(null); }
    catch { veil('No se pudo cargar ' + env.labelOf(st.symbol) + '. Elegí otro mercado.', true); }
    load();
  }
  const picker = env.makePicker('of', { current: () => st.symbol, onPick: (alias) => { st.symbol = alias; save(); switchMarket(); } });
  async function build() {
    veil('Cargando el gráfico…');
    try { await env.loadLibs(); } catch { started = null; veil('No se pudieron cargar las librerías del gráfico. Revisá la conexión.', true); return; }
    if (!env.CAT.ready) { try { await env.loadCatalog(); } catch {} }
    if (env.CAT.ready && !env.CAT.byAlias.has(env.aliasKey(st.symbol))) st.symbol = 'BTC';
    st.symbol = env.aliasKey(st.symbol);
    register();
    chart = new Vela.Vela('#ofChart', { theme: env.THEME, upColor: env.THEME.upColor, downColor: env.THEME.downColor, animations: { intro: false },
      drawings: window.innerWidth < 700 ? { toolbar: false } : undefined, symbol: 'hyperliquid:' + st.symbol, timeframe: st.tf, live: true });
    chart.data.registerProvider('hyperliquid', env.makeProvider());
    picker.render(); sync();
    try { await chart.ready(); chart.addNativeIndicator('ba-orderflow'); veil(null); }
    catch (e) { veil('No se pudo iniciar el gráfico: ' + (e && e.message || e), true); }
    load();
    window.__ORDERFLOW_READY = true;
  }
  const redraw = () => { if (model) { model.layer = { ...model.layer, va: st.va, naked: st.naked, nva: st.nva, ib: st.ib, singles: st.singles }; push(); } };
  $('ofTf').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.tf === st.tf) return; st.tf = b.dataset.tf; save(); sync(); chart && chart.setMarket({ symbol: 'hyperliquid:' + st.symbol, timeframe: st.tf }).then(push).catch(() => {}); });
  $('ofSess').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.s === st.sess) return; st.sess = b.dataset.s; save(); sync(); load(); });
  $('ofMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.m === st.mode) return; st.mode = b.dataset.m; save(); sync(); compute(); });
  [['ofVa', 'va'], ['ofNk', 'naked'], ['ofNva', 'nva'], ['ofIb', 'ib'], ['ofSg', 'singles']].forEach(([id, k]) => $(id).addEventListener('change', () => { st[k] = $(id).checked; save(); redraw(); }));
  window.addEventListener('resize', () => chart && visible && chart.resize());

  return {
    show() {
      visible = true;
      if (!env.live) { veil('Orderflow necesita datos en vivo de Hyperliquid.', true); return; }
      if (!started) started = build(); else { chart && chart.resize(); if (!ws && data.key) openWs(); }
      return started;
    },
    hide() { visible = false; closeWs(); }
  };
};
