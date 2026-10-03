// Niveles · zonas de confluencia Fibonacci ancladas en extremos de Aurora, con línea de corte (lo que
// sabía el sistema en una fecha), señales de pinchazo/limpieza y su contador histórico.
// env: { live, hlPost, CAT, loadCatalog, loadLibs, makeProvider, makePicker, labelOf, aliasKey, THEME, TF_LABEL }
window.createNiveles = function createNiveles(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const N = window.NivelesMath, A = window.AuroraMath;
  const AURORA = $('auroraPine').textContent, HULL = $('hullPine').textContent;
  const TFS = { '1D': '1d', 240: '4h', 60: '1h', 15: '15m', 5: '5m' };
  const IV_MS = { '1d': 864e5, '4h': 144e5, '1h': 36e5, '15m': 9e5, '5m': 3e5 };
  const C = { sup: '#29E6C9', res: '#FF4F7B', gold: '#C9A227', grey: '#5B5953', up: '#1DB978', dn: '#D8344F', fg: '#ECE9E2', txt: '#0B0B0E' };
  const STATE = { 'sin tocar': 'Sin tocar', tocada: 'Tocada', 'reaccionó': 'Reaccionó', trabajada: 'Trabajada' };

  const store = {
    get() { try { return JSON.parse(localStorage.getItem('baNiveles')) || {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem('baNiveles', JSON.stringify(v)); } catch {} }
  };
  const st = { symbol: 'BTC', tf: '60', minPts: 10, hideWorked: true, mtf: true, sigs: true, aurora: true, hull: true, ...store.get() };
  if (!TFS[st.tf]) st.tf = '60';
  const save = () => store.set({ symbol: st.symbol, tf: st.tf, minPts: st.minPts, hideWorked: st.hideWorked, mtf: st.mtf, sigs: st.sigs, aurora: st.aurora, hull: st.hull });

  let chart = null, hNat = null, hAur = null, hHull = null, started = null, visible = false, rev = 0;
  let data = { key: '', k: [], osc: [], d1: null }, cut = null, model = null, ws = null, wsTimer = null, loadTok = 0;
  const iv = () => TFS[st.tf];
  const real = (alias) => env.CAT.realOf.get(alias) || alias;
  const decs = (p) => (p > 0 ? Math.min(8, Math.max(0, 4 - Math.floor(Math.log10(p)))) : 2);
  const fmt = (p) => (Number.isFinite(p) ? p.toLocaleString('es-AR', { minimumFractionDigits: decs(p), maximumFractionDigits: decs(p) }) : '—');
  const fmtD = (t) => new Date(t).toLocaleString('es-AR', iv() === '1d' ? { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' } : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });   // las velas diarias abren 00:00 UTC
  const pct = (v, d = 2) => (v > 0 ? '+' : '') + v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
  const strength = (p) => (p >= 12 ? 'Alta' : p >= 8 ? 'Media' : 'Baja');
  const veil = (txt, err) => {
    if (txt == null) { $('nvVeil').classList.add('off'); return; }
    $('nvVeil').classList.remove('off'); $('nvVeilTxt').textContent = txt; $('nvVeilTxt').className = err ? 'err' : '';
  };

  // ── Datos: hasta 5000 velas cerradas de Hyperliquid (y 1D para las zonas diarias) ──
  const toK = (x) => ({ t: +x.t, o: +x.o, h: +x.h, l: +x.l, c: +x.c, v: +x.v });
  async function history(coin, interval) {
    const now = Date.now();
    const rows = await env.hlPost({ type: 'candleSnapshot', req: { coin, interval, startTime: now - 5000 * IV_MS[interval], endTime: now } });
    return (rows || []).map(toK);
  }
  const closed = (k, ms) => { let n = k.length; const now = Date.now(); while (n && k[n - 1].t + ms > now) n--; return k.slice(0, n); };
  async function load() {
    const my = ++loadTok, key = st.symbol + '|' + st.tf, coin = real(st.symbol);
    data = { key, k: [], osc: [], d1: null, raw: [] }; model = null; render();
    try {
      const raw = await history(coin, iv());
      if (my !== loadTok) return;
      data.raw = raw;
      if (iv() !== '1d') { try { const d = await history(coin, '1d'); if (my === loadTok) data.d1 = d; } catch {} }
      recompute(true);
      openWs(coin);
    } catch { if (my === loadTok) { $('nvNote').textContent = 'No se pudieron cargar las velas de ' + env.labelOf(st.symbol) + '. Probá de nuevo en unos segundos.'; } }
  }
  // Velas en vivo: cuando cierra una vela se recalculan las zonas (puede confirmarse un impulso nuevo).
  function openWs(coin) {
    closeWs();
    const w = new WebSocket('wss://api.hyperliquid.xyz/ws'), key = data.key; ws = w;
    w.onopen = () => {
      w.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'candle', coin, interval: iv() } }));
      wsTimer = setInterval(() => { try { w.send('{"method":"ping"}'); } catch {} }, 50000);
    };
    w.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.channel !== 'candle' || !m.data || data.key !== key) return;
      const c = toK(m.data), r = data.raw, last = r[r.length - 1];
      if (!last) return;
      if (c.t === last.t) r[r.length - 1] = c;
      else if (c.t > last.t) { r.push(c); if (r.length > 5200) r.shift(); recompute(); }
    };
    w.onclose = () => { if (ws === w) { ws = null; clearInterval(wsTimer); setTimeout(() => ws === null && data.key === key && visible && openWs(coin), 5000); } };
  }
  function closeWs() { const w = ws; ws = null; clearInterval(wsTimer); if (w) try { w.close(); } catch {} }

  // ── Cálculo ────────────────────────────────────────────────────────────
  function recompute(fresh) {
    const k = closed(data.raw, IV_MS[iv()]);
    if (k.length < 120) { model = null; $('nvNote').textContent = 'Este mercado no tiene historia suficiente en esta temporalidad.'; render(); return; }
    if (fresh || k.length !== data.k.length) { data.k = k; data.osc = A.compute(k).osc; data.hull = A.hull(k.map((x) => x.c), 55, 'Hma'); }
    const at = cut == null ? k.length - 1 : Math.min(cut, k.length - 1);
    // Las señales siempre respetan la tendencia del Hull Suite (HMA 55, la misma que se dibuja).
    const opt = { minPts: st.minPts, hideWorked: st.hideWorked, hull: data.hull };
    const r = N.analyze(k, data.osc, iv(), at, opt);
    // Zonas diarias al mismo corte (solo las que ya existían en esa fecha).
    let d1 = null;
    if (st.mtf && data.d1) {
      const dk = closed(data.d1, IV_MS['1d']), t = k[at].t;
      let j = dk.length - 1; while (j >= 0 && dk[j].t + IV_MS['1d'] > t + IV_MS[iv()]) j--;
      if (j > 120) d1 = N.analyze(dk, A.compute(dk).osc, '1d', j, { minPts: Math.max(st.minPts, 10), hideWorked: st.hideWorked }).zones;
    }
    model = { alias: st.symbol, k, at, r, d1 };
    render();
  }

  // ── Dibujo en el gráfico (indicador nativo de Vela) ────────────────────
  // Vela solo actualiza series después del primer dibujo: para redibujar zonas y marcas se cambia un
  // ajuste oculto (`rev`) y el indicador se vuelve a montar.
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  function output(ctx) {
    const sym = env.aliasKey(String(ctx.symbol).replace(/^hyperliquid:/i, ''));
    if (!model || model.alias !== sym || TFS[String(ctx.timeframe)] !== iv()) return { boxes: [], labels: [], lines: [] };
    const { k, at, r } = model, t0 = k[at].t, tEnd = k[k.length - 1].t + IV_MS[iv()] * 40;
    const boxes = [], labels = [], lines = [];
    // En el gráfico solo las zonas cerca del rango reciente (las lejanas aplastan la escala; están en la tabla).
    let rlo = Infinity, rhi = -Infinity;
    for (let i = Math.max(0, at - 300); i < k.length; i++) { rlo = Math.min(rlo, k[i].l); rhi = Math.max(rhi, k[i].h); }
    const pad = (rhi - rlo) * 0.15, near = (z) => z.hi >= rlo - pad && z.lo <= rhi + pad;
    // Con el corte en hoy, las zonas se dibujan desde 100 velas atrás para que se vean;
    // con el corte en el pasado, desde el corte: lo que sabía el sistema en esa fecha.
    const live = cut == null, from = () => (live ? k[Math.max(0, at - 100)].t : t0);
    for (const z of r.zones.filter(near)) {
      const col = z.state === 'trabajada' ? C.grey : z.sup ? C.sup : C.res;
      boxes.push({ id: 'nv:z:' + z.id, paneId: '', xloc: 'bar_time', left: from(), right: tEnd, top: z.hi, bottom: z.lo, extend: 'right',
        bgColor: hexA(col, Math.min(0.42, 0.1 + z.pts * 0.018)), borderColor: hexA(col, 0.75), borderWidth: 1, borderStyle: 'solid',
        text: `${fmt(z.mid)} · ${z.pts} pts${z.block ? ' · Σ ' + z.block : ''}`, textColor: C.fg, textSize: 'small', hAlign: 'right', vAlign: 'center',
        wrap: false, fontFamily: 'monospace', bold: true, italic: false, overlay: true });
    }
    if (model.d1) for (const z of model.d1.filter(near)) {
      boxes.push({ id: 'nv:d:' + z.id, paneId: '', xloc: 'bar_time', left: from(), right: tEnd, top: z.hi, bottom: z.lo, extend: 'right',
        bgColor: undefined, borderColor: hexA(C.gold, 0.8), borderWidth: 1, borderStyle: 'dashed',
        text: `1D · ${z.pts} pts`, textColor: C.gold, textSize: 'small', hAlign: 'left', vAlign: 'top', wrap: false, fontFamily: 'monospace', bold: false, italic: false, overlay: true });
    }
    // Línea de corte (vertical; se extiende sola, sus puntos no deben estirar la escala)
    lines.push({ id: 'nv:cut', paneId: '', xloc: 'bar_time', x1: t0, y1: k[at].l, x2: t0, y2: k[at].h, extend: 'both', color: C.gold, invisible: false, width: 1, style: 'dashed', arrowLeft: false, arrowRight: false, overlay: true });
    if (st.sigs) {
      const rng = (i) => { let s = 0, n = 0; for (let q = Math.max(0, i - 13); q <= i; q++) { s += k[q].h - k[q].l; n++; } return s / n; };
      for (const s of r.sigs) {
        const col = s.long ? '#22F07A' : '#FF3B5C', b = k[s.i];   // corona verde (compra) o roja (venta), bien visibles sobre las zonas
        const tip = `${s.kind === 'pinchazo' ? 'Pinchazo' : 'Limpieza'} ${s.long ? 'alcista' : 'bajista'} · entrada ${fmt(s.entry)} · stop ${fmt(s.stop)} · objetivo ${fmt(s.target)} (${s.rr.toFixed(1)}R) · ` +
          (s.res === 'objetivo' ? `llegó al objetivo (+${s.r.toFixed(1)}R)` : s.res === 'stop' ? `tocó el stop (llegó a ${s.best.toFixed(1)}R a favor)` : `abierta (${s.r >= 0 ? '+' : ''}${s.r.toFixed(1)}R)`);
        labels.push({ id: 'nv:s:' + s.i + (s.long ? 'l' : 's'), paneId: '', xloc: 'bar_time', x: s.t, y: s.long ? b.l - rng(s.i) * 1.2 : b.h + rng(s.i) * 1.2, yloc: 'price',
          style: 'none', noFill: true, color: col, textColor: col, text: '♛', size: 'huge', bold: true, textAlign: 'center', fontFamily: 'default', tooltip: tip, overlay: true });
        if (s.res === 'abierta') {
          const t2 = s.t + IV_MS[iv()] * 30;
          [[s.entry, C.fg], [s.stop, C.dn], [s.target, C.up]].forEach(([y, c2], q) => lines.push({ id: `nv:o:${s.i}:${q}`, paneId: '', xloc: 'bar_time', x1: s.t, y1: y, x2: t2, y2: y, extend: 'none', color: c2, invisible: false, width: 1, style: q ? 'dashed' : 'solid', arrowLeft: false, arrowRight: false, overlay: true }));
        }
      }
    }
    return { boxes, labels, lines };
  }
  let registered = false;
  function register() {
    if (registered || Vela.getNativeIndicator?.('ba-niveles')) { registered = true; return; }
    registered = true;
    Vela.registerNativeIndicator({
      type: 'ba-niveles', title: 'Niveles', paneHint: 'price', overlay: true, legend: false,
      inputsSchema: () => [{ key: 'rev', title: 'rev', type: 'int', defval: 0, when: { key: 'rev', equals: -1 } }],
      defaultInputs: () => ({ rev: 0 }),
      create: () => {
        let ctx = null;
        const emit = () => { if (ctx) try { ctx.emit(output(ctx)); } catch (e) { console.error('[niveles]', e); } };
        return { start(c) { ctx = c; emit(); }, onBars() {}, onViewport() {}, setInputs() { emit(); }, suspend() {}, resume() { emit(); }, stop() { ctx = null; } };
      }
    });
  }
  const redraw = () => { if (hNat) hNat.setInputs({ rev: ++rev }); };

  // ── Paneles de abajo ───────────────────────────────────────────────────
  function render() {
    redraw();
    const nv = model && model.r, k = model && model.k;
    if (!nv) { ['nvActive', 'nvReact', 'nvStats'].forEach((id) => { $(id).innerHTML = '<p class="nv-empty">Cargando…</p>'; }); $('nvZones').innerHTML = ''; $('nvSigs').innerHTML = ''; return; }
    const at = model.at, px = k[at].c, live = cut == null;
    $('nvCut').innerHTML = live ? `Corte: <b>hoy</b> (${fmtD(k[at].t)})` : `Corte: <b>${fmtD(k[at].t)}</b> · el sistema solo ve lo anterior`;
    $('nvToday').disabled = live;
    $('nvNote').innerHTML = `<b>${env.labelOf(st.symbol)} · ${env.TF_LABEL[st.tf]}</b> · ${k.length} velas · ZigZag ${nv.P.zz.toFixed(2)}% · ${nv.known.length} impulsos anclados en extremos de Aurora · ${nv.zones.length} zonas de ${st.minPts}+ puntos. Clic en el gráfico para mover el corte.`;
    // Nivel activo: la zona más cercana al precio del corte
    const near = nv.zones.slice().sort((a, b) => Math.abs(a.mid - px) - Math.abs(b.mid - px))[0];
    if (!near) {
      $('nvActive').innerHTML = '<p class="nv-empty">Sin zonas con ese mínimo de puntos. Bajá el filtro.</p>'; $('nvReact').innerHTML = '';
    } else {
      $('nvActive').innerHTML = `<span class="nv-k">Nivel activo</span>
        <b class="${near.sup ? 'sup' : 'res'}">● ${near.sup ? 'Soporte' : 'Resistencia'} ${fmt(near.lo)} – ${fmt(near.hi)}</b>
        <span class="nv-chips"><i class="s-${strength(near.pts).toLowerCase()}">${strength(near.pts)}</i><i>${near.pts} pts</i>${near.block ? `<i>Σ ${near.block} con las pegadas</i>` : ''}<i>${STATE[near.state]}</i></span>`;
      const inside = px >= near.lo && px <= near.hi;
      let txt;
      if (inside) txt = '<b>Dentro de la zona</b><span>esperá el pinchazo o la limpieza</span>';
      else if (near.touch != null && near.state !== 'sin tocar') {
        let ext = near.sup ? -Infinity : Infinity;
        for (let i = near.touch; i <= at; i++) ext = near.sup ? Math.max(ext, k[i].h) : Math.min(ext, k[i].l);
        const ref = near.sup ? near.hi : near.lo, rv = (ext / ref - 1) * 100;
        txt = `<b class="${near.sup ? 'sup' : 'res'}">${near.sup ? '↑' : '↓'} ${pct(rv)}</b><span>reacción máxima desde que la tocó</span>`;
      } else txt = `<b>${pct((near.mid / px - 1) * 100)}</b><span>distancia a la zona</span>`;
      $('nvReact').innerHTML = `<span class="nv-k">Reacción</span>${txt}`;
    }
    const s = nv.stats;
    $('nvStats').innerHTML = `<span class="nv-k">Contador histórico · señales antes del corte</span>` + (s.n
      ? `<div class="nv-stat"><span><b>${s.n}</b>señales</span><span><b>${s.r1}%</b>llegó a 1R</span><span><b>${s.r3}%</b>llegó a 3R</span><span><b class="up">${s.tp}%</b>objetivo</span><span><b class="dn">${s.stop}%</b>stop</span><span><b class="${s.exp >= 0 ? 'up' : 'dn'}">${s.exp >= 0 ? '+' : ''}${s.exp.toFixed(2)}R</b>promedio</span></div>`
      : '<p class="nv-empty">Todavía no hay señales cerradas con estos filtros.</p>');
    $('nvZones').innerHTML = nv.zones.slice().sort((a, b) => b.mid - a.mid).map((z) => `<tr>
      <td><span class="nv-tag ${z.sup ? 'sup' : 'res'}">${z.sup ? 'Soporte' : 'Resistencia'}</span></td>
      <td>${fmt(z.lo)} – ${fmt(z.hi)}</td><td><b>${z.pts}</b>${z.block ? ` <span class="dim">Σ${z.block}</span>` : ''}</td>
      <td class="${z.dom === 0.618 || z.dom === 1.618 ? 'gold' : ''}">${z.dom}</td><td>${STATE[z.state]}</td>
      <td class="${z.mid >= px ? 'up' : 'dn'}">${pct((z.mid / px - 1) * 100, 1)}</td></tr>`).join('') || '<tr><td colspan="6" class="dim">Sin zonas con ese mínimo de puntos.</td></tr>';
    const sigs = nv.sigs.filter((x) => x.i <= at).slice(-12).reverse();
    $('nvSigs').innerHTML = sigs.map((x) => `<tr>
      <td>${fmtD(x.t)}</td><td class="${x.long ? 'up' : 'dn'}">${x.long ? '▲' : '▼'} ${x.kind === 'pinchazo' ? 'Pinchazo' : 'Limpieza'}</td>
      <td>${fmt(x.entry)}</td><td>${fmt(x.stop)}</td><td>${fmt(x.target)}</td><td>${x.rr.toFixed(1)}R</td>
      <td class="${x.res === 'objetivo' ? 'up' : x.res === 'stop' ? 'dn' : 'gold'}">${x.res === 'objetivo' ? 'Objetivo +' + x.r.toFixed(1) + 'R' : x.res === 'stop' ? 'Stop (máx ' + x.best.toFixed(1) + 'R)' : 'Abierta'}</td></tr>`).join('') || '<tr><td colspan="7" class="dim">Sin señales todavía.</td></tr>';
  }

  // ── Gráfico ────────────────────────────────────────────────────────────
  async function syncAurora() {
    if (!chart) return;
    if (st.aurora && !hAur) {
      const a = await chart.runIndicator(AURORA, { inputs: { showTbl: false, showOB: false, showGlow: false } });
      if (a.ok) hAur = chart.indicators().find((x) => x.source === AURORA) || null;
    } else if (!st.aurora && hAur) { const h = hAur; hAur = null; h.remove(); }
  }
  async function syncHull() {
    if (!chart) return;
    if (st.hull && !hHull) {
      const h = await chart.runIndicator(HULL, { inputs: {} });
      if (h.ok) hHull = chart.indicators().find((x) => x.source === HULL) || null;
    } else if (!st.hull && hHull) { const h = hHull; hHull = null; h.remove(); }
  }
  async function switchMarket() {
    cut = null; syncTf();
    veil('Cargando ' + env.labelOf(st.symbol) + ' ' + env.TF_LABEL[st.tf] + '…');
    try { await chart.setMarket({ symbol: 'hyperliquid:' + st.symbol, timeframe: st.tf }); veil(null); }
    catch { veil('No se pudo cargar ' + env.labelOf(st.symbol) + '. Elegí otro mercado.', true); }
    load();
  }
  const picker = env.makePicker('nv', { current: () => st.symbol, onPick: (alias) => { st.symbol = alias; save(); switchMarket(); } });
  function syncTf() {
    document.querySelectorAll('#nvTf button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tf === st.tf)));
    $('nvMin').value = String(st.minPts);
    $('nvHide').checked = st.hideWorked; $('nvMtf').checked = st.mtf; $('nvSig').checked = st.sigs; $('nvAur').checked = st.aurora; $('nvHull').checked = st.hull;
    $('nvMtf').disabled = iv() === '1d';
  }
  async function build() {
    veil('Cargando el gráfico…');
    try { await env.loadLibs(); } catch { started = null; veil('No se pudieron cargar las librerías del gráfico. Revisá la conexión.', true); return; }
    if (!env.CAT.ready) { try { await env.loadCatalog(); } catch {} }
    if (env.CAT.ready && !env.CAT.byAlias.has(env.aliasKey(st.symbol))) st.symbol = 'BTC';
    st.symbol = env.aliasKey(st.symbol);
    chart = new Vela.Vela('#nvChart', { theme: env.THEME, upColor: env.THEME.upColor, downColor: env.THEME.downColor, animations: { intro: false },
      drawings: window.innerWidth < 700 ? { toolbar: false } : undefined, symbol: 'hyperliquid:' + st.symbol, timeframe: st.tf, live: true });
    chart.data.registerProvider('hyperliquid', env.makeProvider());
    chart.registerEngine('pine', new VelaPinets.PineWorkerEngine());
    register();
    picker.render(); syncTf();
    try {
      await chart.ready();
      hNat = chart.addNativeIndicator('ba-niveles');
      // Clic en el gráfico: mueve el corte a esa vela.
      chart.renderer.onClick((e) => {
        if (!model || e.time == null) return;
        const k = model.k; let j = k.length - 1; while (j > 0 && k[j].t > e.time) j--;
        cut = j >= k.length - 1 ? null : Math.max(120, j); recompute();
      });
      veil(null);
      await syncHull();
      syncAurora();
    } catch (e) { veil('No se pudo iniciar el gráfico: ' + (e && e.message || e), true); }
    load();
    window.__NIVELES_READY = true;
  }

  // ── Controles ──────────────────────────────────────────────────────────
  $('nvTf').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.dataset.tf === st.tf) return; st.tf = b.dataset.tf; save(); switchMarket(); });
  $('nvMin').addEventListener('change', () => { st.minPts = +$('nvMin').value; save(); recompute(); });
  $('nvHide').addEventListener('change', () => { st.hideWorked = $('nvHide').checked; save(); recompute(); });
  $('nvMtf').addEventListener('change', () => { st.mtf = $('nvMtf').checked; save(); recompute(); });
  $('nvSig').addEventListener('change', () => { st.sigs = $('nvSig').checked; save(); redraw(); });
  $('nvAur').addEventListener('change', () => { st.aurora = $('nvAur').checked; save(); syncAurora(); });
  $('nvHull').addEventListener('change', () => { st.hull = $('nvHull').checked; save(); syncHull(); });
  $('nvToday').addEventListener('click', () => { cut = null; recompute(); });
  // ← → mueven el corte una vela (con Shift, diez) mientras se ve la sección.
  window.addEventListener('keydown', (e) => {
    if (!visible || !model || /input|select|textarea/i.test((e.target && e.target.tagName) || '')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const n = model.k.length, cur = cut == null ? n - 1 : cut, step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
    const nx = Math.max(120, Math.min(n - 1, cur + step)); cut = nx >= n - 1 ? null : nx; recompute(); e.preventDefault();
  });
  window.addEventListener('resize', () => chart && visible && chart.resize());

  return {
    show() {
      visible = true;
      if (!env.live) { veil('Niveles necesita datos en vivo de Hyperliquid.', true); return; }
      if (!started) started = build(); else { chart && chart.resize(); if (!ws && data.key) openWs(real(st.symbol)); }
      return started;
    },
    hide() { visible = false; closeWs(); }
  };
};
