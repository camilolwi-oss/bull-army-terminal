// Flujo en el gráfico de Aurora: delta, CVD y open interest de Binance Futures, flechas delta/OI,
// divergencias CVD y VWAP anclados, como indicadores nativos de Vela.
// env: { hlPost, CAT, aliasKey }
window.createFlujo = function createFlujo(env) {
  'use strict';
  const F = window.FlujoMath, ok = Number.isFinite;
  const BF = 'https://fapi.binance.com';
  const C = { up: '#1DB978', dn: '#D8344F', cvd: '#C9A227', oi: '#9085E9', txt: '#0B0B0E' };
  const VWAP_COL = { D: '#C9A227', W: '#29E6C9', M: '#9085E9', Q: '#FF4F7B', Y: '#ECE9E2' };
  const VWAP_NAME = { D: 'diario', W: 'semanal', M: 'mensual', Q: 'trimestral', Y: 'anual' };
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  // Temporalidad de Vela → vela de Binance que se agrupa (3D y 1W de Binance no coinciden con las de
  // Hyperliquid, se arman con diarias) y período de las fotos de open interest. En 1m no hay fotos
  // por vela: la línea usa las de 5m y no hay flechas (oiSeries solo da ΔOI con fotos exactas).
  const TF = {
    1: { ms: MIN, k: '1m', km: MIN, oi: '5m', om: 5 * MIN, noBarOi: true },
    5: { ms: 5 * MIN, k: '5m', km: 5 * MIN, oi: '5m', om: 5 * MIN },
    15: { ms: 15 * MIN, k: '15m', km: 15 * MIN, oi: '15m', om: 15 * MIN },
    30: { ms: 30 * MIN, k: '30m', km: 30 * MIN, oi: '30m', om: 30 * MIN },
    60: { ms: HOUR, k: '1h', km: HOUR, oi: '1h', om: HOUR },
    240: { ms: 4 * HOUR, k: '4h', km: 4 * HOUR, oi: '4h', om: 4 * HOUR },
    360: { ms: 6 * HOUR, k: '6h', km: 6 * HOUR, oi: '6h', om: 6 * HOUR },
    '1D': { ms: DAY, k: '1d', km: DAY, oi: '1d', om: DAY },
    '3D': { ms: 3 * DAY, k: '1d', km: DAY, oi: '1d', om: DAY },
    W: { ms: 7 * DAY, k: '1d', km: DAY, oi: '1d', om: DAY },
    M: { ms: 31 * DAY, k: '1M', km: 31 * DAY, oi: '1d', om: DAY }
  };
  const tfOf = (tf) => TF[String(tf).toUpperCase()] || TF[String(tf)];
  const aliasOf = (sym) => env.aliasKey(String(sym).replace(/^hyperliquid:/i, ''));
  const getJSON = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Mercados de Binance ────────────────────────────────────────────────
  let symSet = null;
  function binanceSymbol(alias) {
    const m = env.CAT.byAlias.get(env.aliasKey(alias));
    if (!m || m.group !== 'perp') return null;
    const c = /^k[A-Z]/.test(m.real) ? '1000' + m.real.slice(1) : m.real;
    return c + 'USDT';
  }
  async function supported(alias) {
    const s = binanceSymbol(alias);
    if (!s) return null;
    symSet = symSet || getJSON(BF + '/fapi/v1/ticker/price').then((a) => new Set(a.map((x) => x.symbol))).catch((e) => { symSet = null; throw e; });
    try { return (await symSet).has(s) ? s : null; } catch { return null; }
  }

  // ── Datos de Binance por mercado y temporalidad ────────────────────────
  // Se piden las velas que cubren las del gráfico, las fotos de OI (Binance guarda 30 días) y se
  // actualizan cada pocos segundos mientras haya algún indicador de flujo en el gráfico.
  const MAX_PAGES = 10;
  let ds = null;
  const listeners = new Set();
  const notify = () => { ds && ds.version++; listeners.forEach((fn) => fn()); };

  const toK = (r, now) => ({ t: +r[0], end: +r[6] + 1, v: +r[5], buy: +r[9], final: +r[6] < now });
  async function fetchKlines(d, from, to) {
    for (let p = 0, s = from; p < MAX_PAGES && s < to; p++) {
      const rows = await getJSON(`${BF}/fapi/v1/klines?symbol=${d.sym}&interval=${d.cfg.k}&startTime=${s}&limit=1500`);
      const now = Date.now();
      rows.forEach((r) => d.klines.set(+r[0], toK(r, now)));
      if (rows.length < 1500) break;
      s = +rows[rows.length - 1][0] + 1;
    }
  }
  async function fetchOi(d, from) {
    if (!d.cfg.oi) return;
    const floor = Math.max(from - d.cfg.om, Date.now() - 30 * DAY + d.cfg.om);
    let end = d.oiFrom ? d.oiFrom - 1 : Date.now();
    for (let p = 0; p < 20 && end > floor; p++) {
      const rows = await getJSON(`${BF}/futures/data/openInterestHist?symbol=${d.sym}&period=${d.cfg.oi}&limit=500&endTime=${end}`);
      if (!rows.length) break;
      rows.forEach((r) => d.oi.set(+r.timestamp, +r.sumOpenInterest));
      const first = Math.min(...rows.map((r) => +r.timestamp));
      d.oiFrom = d.oiFrom ? Math.min(d.oiFrom, first) : first;
      if (rows.length < 500) break;
      end = first - 1;
    }
  }
  async function poll(d) {
    try {
      const rows = await getJSON(`${BF}/fapi/v1/klines?symbol=${d.sym}&interval=${d.cfg.k}&limit=3`);
      const now = Date.now();
      rows.forEach((r) => d.klines.set(+r[0], toK(r, now)));
      if (d.cfg.oi && now - d.oiPolled > 30e3) {
        d.oiPolled = now;
        const [h, live] = await Promise.all([
          getJSON(`${BF}/futures/data/openInterestHist?symbol=${d.sym}&period=${d.cfg.oi}&limit=3`),
          getJSON(`${BF}/fapi/v1/openInterest?symbol=${d.sym}`)
        ]);
        h.forEach((r) => d.oi.set(+r.timestamp, +r.sumOpenInterest));
        d.live = { t: +live.time, v: +live.openInterest };
      }
      if (ds === d) notify();
    } catch {}
  }
  function stopPolling() { if (ds && ds.timer) { clearInterval(ds.timer); ds.timer = null; } }
  function startPolling() { if (ds && !ds.timer && ds.ready) ds.timer = setInterval(() => poll(ds), 10e3); }

  // Pide (o extiende hacia atrás) los datos para las velas del gráfico.
  function ensure(alias, tf, bars) {
    const cfg = tfOf(tf);
    if (!cfg || !bars.length) return null;
    const key = alias + '|' + tf;
    if (!ds || ds.key !== key) {
      stopPolling();
      ds = { key, alias, tf, cfg, sym: null, state: 'loading', klines: new Map(), oi: new Map(), oiFrom: 0, oiPolled: 0, live: null, from: Infinity, busy: null, version: 0, timer: null, ready: false };
    }
    const d = ds, first = bars[0].time;
    if (d.state === 'off' || d.busy || first >= d.from) return d;
    d.busy = (async () => {
      try {
        if (!d.sym) d.sym = await supported(alias);
        if (!d.sym) { d.state = 'off'; return; }
        const to = d.from === Infinity ? Date.now() + d.cfg.km : d.from;
        await fetchKlines(d, first, to);
        await fetchOi(d, first);
        if (d.cfg.oi && !d.live) {
          const live = await getJSON(`${BF}/fapi/v1/openInterest?symbol=${d.sym}`).catch(() => null);
          if (live) d.live = { t: +live.time, v: +live.openInterest };
        }
        d.from = first; d.state = 'ready'; d.ready = true;
      } catch { d.state = d.ready ? 'ready' : 'error'; await wait(5000); }
      finally { d.busy = null; }
      if (ds === d) { if (listeners.size) startPolling(); notify(); }
    })();
    return d;
  }

  // Modelo por vela (delta, CVD, OI) para las velas del gráfico; se recalcula solo si cambió algo.
  let memo = { k: '' };
  function model(ctx) {
    const bars = ctx.bars(), alias = aliasOf(ctx.symbol), d = ensure(alias, ctx.timeframe, bars);
    if (!d || d.state !== 'ready') return { d, bars };
    const last = bars[bars.length - 1];
    const k = [d.key, d.version, bars.length, bars[0].time, last.time].join('|');
    if (memo.k === k) return memo.m;
    const times = bars.map((b) => b.time);
    const b = F.bucketize(times, d.cfg.ms, [...d.klines.values()]);
    const oi = d.cfg.oi ? F.oiSeries(times, b.ends, d.oi, d.cfg.om, d.live) : { line: times.map(() => NaN), dOi: times.map(() => NaN) };
    // Velas cerradas: terminó su tiempo y Binance ya la dio por cerrada.
    const now = Date.now();
    let closed = bars.length;
    while (closed > 0 && !(b.ends[closed - 1] <= now && b.complete[closed - 1])) closed--;
    const m = { d, bars, times, b, oi, closed };
    memo = { k, m };
    return m;
  }

  // ── Indicadores nativos de Vela ────────────────────────────────────────
  function base(compute, opts = {}) {
    return class {
      constructor() { this.ctx = null; this.inputs = {}; this.on = () => this.recompute(); }
      start(ctx, inputs) { this.ctx = ctx; this.inputs = inputs; listeners.add(this.on); this.recompute(); startPolling(); }
      onBars() { this.recompute(); }
      onViewport() {}
      setInputs(inputs) { this.inputs = inputs; this.structural = true; this.recompute(); this.structural = false; }
      suspend() { listeners.delete(this.on); if (!listeners.size) stopPolling(); }
      resume() { listeners.add(this.on); this.recompute(); startPolling(); }
      stop() { this.suspend(); }
      recompute() {
        if (!this.ctx) return;
        try {
          const out = compute(this.ctx, this.inputs, this);
          if (out) this.ctx.emit(out);
        } catch (e) { console.error('[flujo]', e); }
      }
    };
  }
  const pts = (m, vals, color) => m.times.map((t, i) => { const v = vals[i]; const p = { time: t, value: ok(v) ? v : null }; if (color && ok(v)) p.color = color(v, i); return p; });
  const empty = (ctx) => { const m = model(ctx); if (m.d) ctx.setStatus(m.d.state === 'loading' ? 'loading' : 'idle'); return m.d && m.d.state === 'ready' ? m : null; };
  const line = (id, title, points, color, kind = 'line', extra = {}) => ({ id, title, paneId: '', kind, points, style: { color, width: kind === 'line' ? 2 : 1, lineStyle: 'solid', ...extra } });

  // Vela monta las series del primer envío y después solo las actualiza: mientras cargan los datos
  // se mandan las mismas series sin valores.
  const blank = (ctx) => ({ times: ctx.bars().map((b) => b.time) });
  const DeltaInd = base((ctx) => {
    const m = empty(ctx);
    if (m) ctx.setStatus('live');
    return { series: [line('ba-delta:h', 'Delta', m ? pts(m, m.b.delta, (v) => (v >= 0 ? C.up : C.dn)) : pts(blank(ctx), []), C.up, 'columns', { base: 0 })] };
  });
  const CvdInd = base((ctx) => {
    const m = empty(ctx);
    if (m) ctx.setStatus('live');
    return { series: [line('ba-cvd:l', 'CVD', m ? pts(m, m.b.cvd) : pts(blank(ctx), []), C.cvd)] };
  });
  const OiInd = base((ctx) => {
    const m = empty(ctx);
    if (m) ctx.setStatus('live');
    return { series: [line('ba-oi:l', 'Open interest', m ? pts(m, m.oi.line) : pts(blank(ctx), []), C.oi)] };
  });

  // Flechas y divergencias en el precio. Solo velas cerradas: lo que se marca no cambia después.
  // Vela solo actualiza las series después del primer dibujo; para sumar marcas nuevas hay que
  // volver a montar el indicador, y eso pasa al cambiar un ajuste (`rev`, oculto).
  let bumpSig = null, bumpQueued = false;
  const queueBump = () => {
    if (bumpQueued || !bumpSig) return;
    bumpQueued = true;
    setTimeout(() => { bumpQueued = false; bumpSig && bumpSig(); }, 0);
  };
  // Vela no resuelve abovebar/belowbar en indicadores nativos: la marca va a un precio calculado
  // (máximo o mínimo de la vela, separado por una fracción del rango promedio).
  const lbl = (id, t, y, style, color, text, tip) => ({ id, paneId: '', xloc: 'bar_time', x: t, y, yloc: 'price', style, color, textColor: style.startsWith('label') ? C.txt : color, text, size: style.startsWith('label') ? 'small' : 'normal', textAlign: 'center', fontFamily: 'default', tooltip: tip, overlay: true });
  const SigInd = base((ctx, inputs, self) => {
    const m = empty(ctx); if (!m) return null;
    const k = [m.d.key, m.bars[0].time, m.closed, m.times[m.closed - 1], inputs.arrows, inputs.divs].join('|');
    if (self.sigK === k && !self.structural) return null;
    const labels = [], hasArrow = new Set();
    const rng = (i) => { let s = 0, n = 0; for (let k = Math.max(0, i - 13); k <= i; k++) { s += m.bars[k].high - m.bars[k].low; n++; } return s / n; };
    const above = (i, f) => m.bars[i].high + f * rng(i), below = (i, f) => m.bars[i].low - f * rng(i);
    if (inputs.arrows) F.arrows(m.b, m.oi.dOi, m.closed).forEach((a) => {
      const t = m.times[a.i];
      hasArrow.add(a.i);
      labels.push(a.side > 0
        ? lbl('ba-ar:' + t, t, below(a.i, 0.55), 'arrowup', C.up, '', 'Delta negativo, OI sube y volumen > 2× el promedio: venta agresiva abriendo shorts que no baja el precio.')
        : lbl('ba-ar:' + t, t, above(a.i, 0.55), 'arrowdown', C.dn, '', 'Delta positivo, OI baja y volumen > 2× el promedio: la compra viene de shorts cerrando, no de longs nuevos.'));
    });
    if (inputs.divs && window.AuroraMath && m.closed > 30) {
      const bars = m.bars.slice(0, m.closed);
      const osc = window.AuroraMath.compute(bars.map((b) => ({ o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume }))).osc;
      F.cvdDivergences(bars.map((b) => b.high), bars.map((b) => b.low), m.b.cvd, osc, m.closed).forEach((v) => {
        const t = m.times[v.i], name = v.kind === 'abs' ? 'Absorción' : 'Agotamiento';
        const tip = v.side < 0
          ? (v.kind === 'abs' ? 'Precio hace un máximo más bajo y el CVD uno más alto: la compra agresiva es absorbida.' : 'Precio hace un máximo más alto y el CVD uno más bajo: la suba pierde compradores.')
          : (v.kind === 'abs' ? 'Precio hace un mínimo más alto y el CVD uno más bajo: la venta agresiva es absorbida.' : 'Precio hace un mínimo más bajo y el CVD uno más alto: la caída pierde vendedores.');
        const gap = hasArrow.has(v.i) ? 1.4 : 0.35;
        labels.push(v.side < 0
          ? lbl('ba-dv:' + t, t, above(v.i, gap), 'label_down', C.dn, name, tip + ' Aurora en sobrecompra.')
          : lbl('ba-dv:' + t, t, below(v.i, gap), 'label_up', C.up, name, tip + ' Aurora en sobreventa.'));
      });
    }
    const sig = JSON.stringify(labels.map((l) => l.id));
    if (self.mounted && !self.structural && sig !== self.sig) { queueBump(); return null; }
    self.sigK = k; self.sig = sig; self.mounted = true;
    ctx.setStatus('live');
    return { labels };
  });

  // VWAP anclados: con las velas del gráfico (Hyperliquid), para cualquier mercado. Para el período
  // que empieza antes de la primera vela se suma lo anterior con velas más grandes.
  const prefixes = new Map();
  const HL_IV = [['1m', MIN], ['5m', 5 * MIN], ['15m', 15 * MIN], ['1h', HOUR], ['4h', 4 * HOUR], ['1d', DAY]];
  function prefixFor(ctx, kind, first, done) {
    const anchor = F.anchorStart(first, kind), key = ctx.symbol + '|' + kind + '|' + first;
    if (anchor >= first) return null;
    if (prefixes.has(key)) return prefixes.get(key);
    prefixes.set(key, null);
    const m = env.CAT.byAlias.get(aliasOf(ctx.symbol));
    if (!m) return null;
    const iv = HL_IV.find(([, ms]) => (first - anchor) / ms <= 4000) || HL_IV[HL_IV.length - 1];
    env.hlPost({ type: 'candleSnapshot', req: { coin: m.real, interval: iv[0], startTime: anchor, endTime: first - 1 } }).then((rows) => {
      let pv = 0, v = 0;
      (rows || []).forEach((k) => { if (+k.t >= anchor && +k.t + iv[1] <= first) { pv += ((+k.h + +k.l + +k.c) / 3) * +k.v; v += +k.v; } });
      prefixes.set(key, { anchor, pv, v });
      done();
    }).catch(() => {});
    return null;
  }
  const VwapInd = base((ctx, inputs, self) => {
    const bars = ctx.bars(), cfg = tfOf(ctx.timeframe);
    if (!bars.length || !cfg) return { series: [] };
    const series = [];
    for (const kind of ['D', 'W', 'M', 'Q', 'Y']) {
      if (!inputs[kind] || !F.vwapApplies(kind, cfg.ms)) continue;
      const pre = prefixFor(ctx, kind, bars[0].time, () => self.recompute());
      const vals = F.vwap(bars, kind, pre);
      series.push({ id: 'ba-vwap:' + kind, title: 'VWAP ' + VWAP_NAME[kind], paneId: '', kind: 'line', overlay: true,
        points: bars.map((b, i) => ({ time: b.time, value: vals[i] })), style: { color: VWAP_COL[kind], width: kind === 'D' ? 1 : 2, lineStyle: 'solid' } });
    }
    return { series };
  });

  const bool = (key, title, defval) => ({ key, title, type: 'bool', defval });
  const DESCS = [
    { type: 'ba-delta', title: 'Delta de volumen (Binance)', shortTitle: 'Delta · Binance', paneHint: 'new', overlay: false, Ind: DeltaInd, inputs: [] },
    { type: 'ba-cvd', title: 'CVD (Binance)', shortTitle: 'CVD · Binance', paneHint: 'new', overlay: false, Ind: CvdInd, inputs: [] },
    { type: 'ba-oi', title: 'Open interest (Binance)', shortTitle: 'OI · Binance', paneHint: 'new', overlay: false, Ind: OiInd, inputs: [] },
    { type: 'ba-flow-sig', title: 'Flechas delta/OI y divergencias CVD', paneHint: 'price', overlay: true, legend: false, Ind: SigInd,
      inputs: [bool('arrows', 'Flechas delta/OI', true), bool('divs', 'Divergencias CVD', true), { key: 'rev', title: 'rev', type: 'int', defval: 0, when: { key: 'rev', equals: -1 } }] },
    { type: 'ba-vwap', title: 'VWAP anclados', shortTitle: 'VWAP', paneHint: 'price', overlay: true, Ind: VwapInd,
      inputs: [bool('D', 'Diario', true), bool('W', 'Semanal', false), bool('M', 'Mensual', false), bool('Q', 'Trimestral', false), bool('Y', 'Anual', false)] }
  ];
  let registered = false;
  function register() {
    if (registered) return;
    registered = true;
    DESCS.forEach((d) => Vela.registerNativeIndicator({
      type: d.type, title: d.title, shortTitle: d.shortTitle, paneHint: d.paneHint, overlay: d.overlay,
      ...(d.legend === false ? { legend: false } : {}),
      inputsSchema: () => d.inputs,
      defaultInputs: () => Object.fromEntries(d.inputs.map((i) => [i.key, i.defval])),
      create: () => new d.Ind()
    }));
  }

  // Estado del flujo para el mercado actual (para la nota debajo del gráfico).
  async function info(alias, tf) {
    const sym = await supported(alias);
    const cfg = tfOf(tf);
    return { sym, oi: !!(cfg && cfg.oi && !cfg.noBarOi) };
  }

  return { register, supported, info, onSigBump(fn) { bumpSig = fn; } };
};
