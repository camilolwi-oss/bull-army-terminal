(() => {
  const $ = (id) => document.getElementById(id);
  const PINE = $('pine').textContent;
  let SNAP_ = null;
  const SNAP = new Proxy({}, { get: (_, k) => (SNAP_ = SNAP_ || JSON.parse($('snap').textContent))[k] });
  const THEME = { background:'#0B0B0C', textColor:'#8E8B84', gridColor:'#17171A', borderColor:'#25252A', upColor:'#7FAF7F', downColor:'#C8704F', fontFamily:'"IBM Plex Mono", ui-monospace, monospace' };
  const TF_LABEL = { '1':'1m', '5':'5m', '15':'15m', '30':'30m', '60':'1H', '240':'4H', '360':'6H', '1D':'1D', '3D':'3D', 'W':'1W', 'M':'1M' };
  // PineTS no resuelve request.security() en 6H ni 3D: ahí el script corre sin pedidos a otra temporalidad.
  const NO_SEC = new Set(['360', '3D']);
  const PINE_NOSEC = PINE.replace(/request\.security\([^\n]*\)$/gm, 'float(na)');
  // El script completo solo corre si hace falta: régimen diario activo y temporalidad compatible.
  const scriptFor = (tf) => ($('htf').checked && !NO_SEC.has(tf)) ? PINE : PINE_NOSEC;
  let runningSrc = null;
  const state = { live:false, symbol:'BTC', tf:'60' };
  try { const s = localStorage.getItem('baExtremosSym'); if (s) state.symbol = s; } catch {}

  // ── Catálogo de Hyperliquid: perps, spot y HIP-3 ─────────────────────
  // Vela pasa el ticker a mayúsculas y no conoce los spot "@N" ni los HIP-3 "dex:COIN".
  // Cada mercado recibe un alias que sobrevive a eso y se traduce al nombre real
  // justo antes de pedir velas o abrir el WebSocket.
  const HL = 'https://api.hyperliquid.xyz/info';
  // Límite compartido por toda la página: Hyperliquid permite 1200 de peso por minuto por IP.
  // Se usa hasta 1100 y ante un 429 se espera y se reintenta.
  const HL_SPENT = [];
  // Peso según la documentación: velas = 20 + 1 cada 60 velas devueltas; estado de cuenta = 2; el resto = 20.
  const IV_MS_ALL = { '1m':6e4, '3m':18e4, '5m':3e5, '15m':9e5, '30m':18e5, '1h':36e5, '2h':72e5, '4h':144e5, '8h':288e5, '12h':432e5, '1d':864e5, '3d':2592e5, '1w':6048e5, '1M':2592e6 };
  const hlWeight = (b) => {
    if (b.type === 'clearinghouseState') return 2;
    if (b.type !== 'candleSnapshot') return 20;
    const q = b.req || {}, n = Math.min(5000, ((q.endTime || Date.now()) - q.startTime) / (IV_MS_ALL[q.interval] || 36e5));
    return 20 + Math.ceil(Math.max(0, n) / 60);
  };
  async function hlTake(w) {
    for (;;) {
      const now = Date.now();
      while (HL_SPENT.length && now - HL_SPENT[0].t > 60000) HL_SPENT.shift();
      if (HL_SPENT.reduce((a, x) => a + x.w, 0) + w <= 1100) { HL_SPENT.push({ t: now, w }); return; }
      const wait = Math.max(200, 60000 - (now - HL_SPENT[0].t) + 50);
      window.dispatchEvent(new CustomEvent('ba:ratewait', { detail: Math.ceil(wait / 1000) }));
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  async function hlPost(body) {
    for (let attempt = 0; ; attempt++) {
      await hlTake(hlWeight(body));
      const r = await fetch(HL, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) });
      if (r.status === 429 && attempt < 4) { await new Promise((z) => setTimeout(z, 2000 * (attempt + 1))); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }
  }
  const CAT = { list:[], byAlias:new Map(), realOf:new Map(), ready:false };
  const aliasKey = (a) => a.includes('/') ? a.trim() : a.trim().toUpperCase();
  function addMarket(m) {
    let a = m.alias, n = 2;
    while (CAT.byAlias.has(aliasKey(a))) a = m.alias + '_' + (n++);
    m.alias = aliasKey(a);
    CAT.byAlias.set(m.alias, m); CAT.realOf.set(m.alias, m.real); CAT.list.push(m);
  }
  async function loadCatalog() {
    const [perp, spot, dexs] = await Promise.all([
      hlPost({ type:'metaAndAssetCtxs' }),
      hlPost({ type:'spotMetaAndAssetCtxs' }).catch(() => null),
      hlPost({ type:'perpDexs' }).catch(() => [])
    ]);
    const addPerps = (meta, ctxs, group, dex) => meta.universe.forEach((u, i) => {
      if (u.isDelisted) return; const c = ctxs[i] || {};
      addMarket({ real:u.name, alias: dex ? u.name.replace(':', '_') : u.name, label: dex ? u.name : u.name + '-PERP', group, dex: dex || '',
        px:+c.markPx || +c.midPx || 0, prev:+c.prevDayPx || 0, vol:+c.dayNtlVlm || 0, szDec:u.szDecimals ?? 2, maxDec:6, type:'futures' });
    });
    addPerps(perp[0], perp[1], 'perp');
    if (spot) {
      const tok = spot[0].tokens || [], ctx = new Map((spot[1] || []).map(c => [c.coin, c]));
      spot[0].universe.forEach(u => {
        const b = tok[u.tokens?.[0]], q = tok[u.tokens?.[1]], c = ctx.get(u.name) || {};
        const nice = (b && q) ? b.name + '/' + q.name : u.name;
        addMarket({ real:u.name, alias: nice.includes('/') ? nice : u.name, label: nice, group:'spot', dex:'',
          px:+c.markPx || +c.midPx || 0, prev:+c.prevDayPx || 0, vol:+c.dayNtlVlm || 0, szDec:b?.szDecimals ?? 2, maxDec:8, type:'crypto' });
      });
    }
    const dexNames = (dexs || []).filter(Boolean).map(d => d.name).filter(Boolean);
    const hip = await Promise.all(dexNames.map(d => hlPost({ type:'metaAndAssetCtxs', dex:d }).then(r => [d, r]).catch(() => null)));
    hip.filter(Boolean).forEach(([d, r]) => addPerps(r[0], r[1], 'hip3', d));
    CAT.list.sort((a, b) => b.vol - a.vol);
    CAT.ready = true;
  }
  function makeProvider() {
    const Base = Vela.HyperliquidProvider;
    return new (class extends Base {
      candleSnapshot(coin, interval, s, e) { return super.candleSnapshot(CAT.realOf.get(coin) || coin, interval, s, e); }
      streamCandles(ticker, tf, coin, interval, onBar) { return super.streamCandles(ticker, tf, CAT.realOf.get(coin) || coin, interval, onBar); }
      async getSymbolInfo(ticker) {
        const m = CAT.byAlias.get(aliasKey(ticker));
        if (!m) return super.getSymbolInfo(ticker);
        const mintick = Math.pow(10, -Math.max(0, m.maxDec - m.szDec));
        const [base, quote] = m.group === 'spot' ? m.label.split('/') : [m.real, 'USD'];
        return { ticker, tickerid:'HYPERLIQUID:' + ticker, prefix:'HYPERLIQUID', description:m.label, type:m.type,
                 basecurrency:base, currency:quote || 'USDC', mintick, pricescale:Math.round(1 / mintick), timezone:'Etc/UTC', session:'24x7' };
      }
      // 3D existe en Hyperliquid ("3d") pero no en el proveedor de Vela.
      info() { const i = super.info(); return { ...i, supportedTimeframes:[...i.supportedTimeframes, '3D'] }; }
      async getBars(ticker, tf, range) {
        if (String(tf).toUpperCase() !== '3D') return super.getBars(ticker, tf, range);
        const coin = ticker.includes('/') ? ticker.trim() : ticker.trim().toUpperCase();
        const rows = await this.fetchCandles(coin, '3d', 3 * 864e5, range);
        const seen = new Map();
        rows.forEach(k => seen.set(+k.t, { time:+k.t, open:+k.o, high:+k.h, low:+k.l, close:+k.c, volume:+k.v }));
        return [...seen.values()].sort((a, b) => a.time - b.time);
      }
      subscribe(ticker, tf, onBar) {
        if (String(tf).toUpperCase() !== '3D') return super.subscribe(ticker, tf, onBar);
        const coin = ticker.includes('/') ? ticker.trim() : ticker.trim().toUpperCase();
        return this.streamCandles(ticker, tf, coin, '3d', onBar);
      }
      async listSymbols() {
        if (!CAT.ready) return super.listSymbols();
        return CAT.list.map(m => ({ ticker:m.alias, description:m.label, type:m.type }));
      }
    })();
  }
  const labelOf = (alias) => (CAT.byAlias.get(aliasKey(alias)) || {}).label || (alias.includes('/') ? alias : alias + '-PERP');
  let chart = null, handle = null;

  const setMode = (s, txt) => { $('mode').dataset.state = s; $('modeTxt').textContent = txt; };
  const veil = (txt, isErr) => {
    if (txt == null) { $('veil').classList.add('off'); return; }
    $('veil').classList.remove('off');
    $('veilTxt').textContent = txt; $('veilTxt').className = isErr ? 'err' : '';
  };
  const snapBars = (tf) => { const s = SNAP[tf]; return s.rows.map(r => ({ time:s.t0 + r[0]*s.step, open:r[1], high:r[2], low:r[3], close:r[4], volume:r[5] })); };
  const fmtDate = (ms) => new Date(ms).toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' });

  let probeWhy = '';
  async function probeHyperliquid() {
    probeWhy = '';
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
      const now = Date.now();
      const r = await fetch('https://api.hyperliquid.xyz/info', {
        method:'POST', headers:{ 'Content-Type':'application/json' }, signal:ctl.signal, cache:'no-store',
        body: JSON.stringify({ type:'candleSnapshot', req:{ coin:'BTC', interval:'1d', startTime: now - 3*864e5, endTime: now } })
      });
      clearTimeout(t);
      if (!r.ok) { probeWhy = 'Hyperliquid respondió con error ' + r.status + '.'; return false; }
      const j = await r.json();
      if (!(Array.isArray(j) && j.length > 0)) { probeWhy = 'Hyperliquid respondió sin velas.'; return false; }
      return true;
    } catch (e) {
      probeWhy = (e && e.name === 'AbortError') ? 'Hyperliquid no respondió en 4 segundos.' : 'El navegador bloqueó la conexión a Hyperliquid.';
      return false;
    }
  }

  const inputValues = () => ({
    useFade: $('fade').checked,
    reqRoom: $('room').checked,
    useHTF:  $('htf').checked && !NO_SEC.has(state.tf),
    showDiv: $('divR').checked,
    showHull: $('hullS').checked,
    hullFilter: $('hullF').checked,
    trailHull: $('trail').checked,
    showObv: $('divO').checked,
    lvMode:  document.querySelector('#lv [aria-pressed="true"]').dataset.v
  });

  function syncTfButtons() {
    document.querySelectorAll('#tf button').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.tf === state.tf));
      b.disabled = !state.live && !SNAP[b.dataset.tf];
      b.title = b.disabled ? 'Disponible con datos en vivo' : '';
    });
  }

  function updateNote() {
    if (state.live) {
      $('note').innerHTML = `<b>${labelOf(state.symbol)} · ${TF_LABEL[state.tf]}</b> en vivo desde Hyperliquid. Las señales se confirman al cierre de cada vela. Hyperliquid sirve las últimas ~5000 velas por temporalidad.`;
    } else {
      const s = SNAP[state.tf], last = s.t0 + (s.rows.length - 1) * s.step;
      $('note').innerHTML = `<b>Modo demo:</b> BTC ${TF_LABEL[state.tf]} histórico hasta el ${fmtDate(last)}. Esta vista no puede conectarse a Hyperliquid; abrí el archivo HTML en tu navegador o subilo a tu web para ver cualquier perpetuo en tiempo real.`;
    }
  }

  async function runScript() {
    veil('Ejecutando el Pine Script…');
    runningSrc = scriptFor(state.tf);
    const res = await chart.runIndicator(runningSrc, { inputs: inputValues() });
    if (!res.ok) { veil('Error del script: ' + (res.error && (res.error.message || res.error)), true); return; }
    handle = chart.indicators().find(h => !h.nativeType && /Extremos/.test(h.title)) || null;
    veil(null);
  }

  function syncHtf() {
    const off = NO_SEC.has(state.tf);
    $('htf').disabled = off;
    $('htf').closest('label').title = off ? 'No disponible en 6H ni 3D en la web' : '';
  }

  async function switchMarket() {
    syncTfButtons(); updateNote(); syncHtf();
    // Si cambia la variante del script, se saca antes de cambiar de mercado y se vuelve a
    // cargar después: así el código con request.security() nunca corre en 6H ni 3D.
    const swap = !!handle && scriptFor(state.tf) !== runningSrc;
    if (swap) { handle.remove(); handle = null; }
    veil('Cargando ' + (state.live ? labelOf(state.symbol) : 'BTC') + ' ' + TF_LABEL[state.tf] + '…');
    try {
      if (state.live) await chart.setMarket({ symbol:'hyperliquid:' + state.symbol, timeframe:state.tf });
      else await chart.setMarket({ symbol:'BTCUSDC', timeframe:state.tf, data:snapBars(state.tf) });
      if (swap) await runScript(); else veil(null);
    } catch (e) {
      veil('No se pudo cargar ' + labelOf(state.symbol) + '. Elegí otro mercado del buscador.', true);
    }
  }

  function showWarn() {
    const s = SNAP[state.tf] || SNAP['60'], last = s.t0 + (s.rows.length - 1) * s.step;
    let inPreview = false; try { inPreview = window.self !== window.top; } catch { inPreview = true; }
    $('warnTitle').textContent = 'Sin conexión a Hyperliquid: estás viendo datos de muestra, no en vivo.';
    $('warnBody').textContent = inPreview
      ? 'Esta vista previa bloquea las conexiones externas, así que no puede hablar con Hyperliquid. Descargá el archivo y abrilo directo en Chrome, Safari o Firefox, o subilo a tu web.'
      : (probeWhy || 'No se pudo conectar a Hyperliquid.') + ' Revisá tu conexión, una VPN o un bloqueador de anuncios, y reintentá.';
    $('warn').hidden = false;
  }

  async function boot() {
    state.live = await probeHyperliquid();
    liveKnown();
    if (state.live) setMode('live', 'En vivo · Hyperliquid');
    else { setMode('demo', 'Demo · datos de muestra'); showWarn(); }
    window.__EXTREMOS_READY = true;
  }

  const LIBS = ['https://cdn.jsdelivr.net/npm/@luxalgo/vela@0.8.0/dist/vela.global.min.js', 'https://cdn.jsdelivr.net/npm/@luxalgo/vela-pinets@0.2.14/dist/vela-pinets.global.min.js'];
  const loadScript = (u) => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = ko; document.head.append(s); });
  // Vela y PineTS se descargan una sola vez y las comparten Indicador y Aurora.
  let libsP = null;
  const loadLibs = () => libsP = libsP || (async () => { for (const u of LIBS) await loadScript(u); })().catch((e) => { libsP = null; throw e; });
  let indStart = null;
  function startIndicator() {
    return indStart = indStart || (async () => {
      veil('Cargando el gráfico…');
      try { await loadLibs(); }
      catch { indStart = null; veil('No se pudieron cargar las librerías del gráfico. Revisá la conexión y probá de nuevo.', true); return; }
      await liveReady;
      if (state.live && !CAT.ready) { try { await loadCatalog(); } catch {} }
      await buildChart();
      window.__IND_READY = true;
    })();
  }

  async function buildChart() {
    const opts = { theme:THEME, upColor:THEME.upColor, downColor:THEME.downColor, animations:{ intro:false }, drawings: window.innerWidth < 700 ? { toolbar:false } : undefined };
    if (state.live) {
      if (CAT.ready && !CAT.byAlias.has(aliasKey(state.symbol))) state.symbol = 'BTC';
      state.symbol = aliasKey(state.symbol);
      chart = new Vela.Vela('#chart', { ...opts, symbol:'hyperliquid:' + state.symbol, timeframe:state.tf, live:true });
      chart.data.registerProvider('hyperliquid', makeProvider());
      picker.render();
    } else {
      chart = new Vela.Vela('#chart', { ...opts, symbol:'BTCUSDC', timeframe:state.tf, data:snapBars(state.tf), live:false });
      $('symBtn').disabled = true; $('symLbl').textContent = 'BTC (demo)';
      $('symCtl').title = 'Disponible con datos en vivo';
    }
    chart.registerEngine('pine', new VelaPinets.PineWorkerEngine());
    syncTfButtons(); updateNote();
    try { await chart.ready(); await runScript(); }
    catch (e) { veil('No se pudo iniciar el gráfico: ' + (e && e.message || e), true); }
  }

  $('retry').addEventListener('click', async () => {
    $('retry').disabled = true; $('retry').textContent = 'Probando…';
    const ok = await probeHyperliquid();
    if (ok) { location.reload(); return; }
    showWarn(); $('retry').disabled = false; $('retry').textContent = 'Reintentar conexión';
  });

  // Controles
  $('tf').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled || b.dataset.tf === state.tf) return;
    state.tf = b.dataset.tf; switchMarket();
  });
  $('lv').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#lv button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    handle && handle.setInputs(inputValues());
  });
  ['fade','room','divR','divO','hullS','hullF','trail'].forEach(id => $(id).addEventListener('change', () => handle && handle.setInputs(inputValues())));
  $('htf').addEventListener('change', async () => {
    if (!handle) return;
    if (scriptFor(state.tf) !== runningSrc) { handle.remove(); handle = null; await runScript(); }
    else handle.setInputs(inputValues());
  });
  // ── Buscador de mercados (Indicador y Aurora) ─────────────────────────
  const nf = (v, o) => v.toLocaleString('es-AR', o);
  const fmtPx = (v) => !v ? '—' : v >= 1000 ? nf(v, { maximumFractionDigits:1 }) : v >= 1 ? nf(v, { maximumFractionDigits:4 }) : nf(v, { maximumSignificantDigits:4 });
  const fmtVol = (v) => !v ? '—' : v >= 1e9 ? nf(v / 1e9, { maximumFractionDigits:2 }) + ' B' : v >= 1e6 ? nf(v / 1e6, { maximumFractionDigits:1 }) + ' M' : v >= 1e3 ? nf(v / 1e3, { maximumFractionDigits:0 }) + ' K' : nf(v, { maximumFractionDigits:0 });
  const GTAG = { perp:'perp', spot:'spot', hip3:'hip-3' };
  // prefix elige los elementos: '' → symBtn, pop, symQ…; 'au' → auSymBtn, auPop, auSymQ…
  function makePicker(prefix, { current, onPick }) {
    const el = (id) => $(prefix ? prefix + id[0].toUpperCase() + id.slice(1) : id);
    const pk = { group:'all', q:'', items:[], sel:0 };
    function render() {
      el('symLbl').textContent = labelOf(current());
      if (!CAT.ready) { el('symCount').textContent = 'No se pudo cargar el catálogo; se muestran los mercados principales.'; return; }
      const q = pk.q.trim().toLowerCase(), cur = current();
      pk.items = CAT.list.filter(m => (pk.group === 'all' || m.group === pk.group) && (!q || m.label.toLowerCase().includes(q) || m.real.toLowerCase().includes(q)));
      if (q) pk.items.sort((a, b) => (b.label.toLowerCase().startsWith(q) - a.label.toLowerCase().startsWith(q)) || b.vol - a.vol);
      pk.sel = Math.min(pk.sel, Math.max(0, pk.items.length - 1));
      const shown = pk.items.slice(0, 300);
      el('symList').innerHTML = shown.map((m, i) => {
        const ch = m.prev ? (m.px / m.prev - 1) * 100 : 0;
        return `<li role="option" data-a="${m.alias}" aria-selected="${i === pk.sel}" class="${m.alias === cur ? 'cur' : ''}"><span><b>${m.label}</b><i>${GTAG[m.group]}</i></span><span>${fmtPx(m.px)}</span><span class="${ch > 0 ? 'up' : ch < 0 ? 'dn' : ''}">${m.prev ? (ch > 0 ? '+' : '') + nf(ch, { minimumFractionDigits:2, maximumFractionDigits:2 }) + '%' : '—'}</span><span>${fmtVol(m.vol)}</span></li>`;
      }).join('') || '<li aria-disabled="true"><span>Sin resultados</span></li>';
      const n = { perp:0, spot:0, hip3:0 }; CAT.list.forEach(m => n[m.group]++);
      el('symCount').textContent = `${pk.items.length} de ${CAT.list.length} mercados · ${n.perp} perps · ${n.spot} spot · ${n.hip3} HIP-3 · ordenados por volumen 24h` + (pk.items.length > 300 ? ' · escribí para ver el resto' : '');
    }
    function open(on) {
      el('pop').hidden = !on; el('symBtn').setAttribute('aria-expanded', String(on));
      if (on) { pk.sel = 0; pk.q = ''; el('symQ').value = ''; render(); setTimeout(() => el('symQ').focus(), 0); }
    }
    function pick(alias) {
      if (!alias) return;
      open(false);
      if (alias === current()) return;
      el('symLbl').textContent = labelOf(alias);
      onPick(alias);
    }
    el('symBtn').addEventListener('click', () => open(el('pop').hidden));
    el('symQ').addEventListener('input', () => { pk.q = el('symQ').value; pk.sel = 0; render(); });
    el('symQ').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); pk.sel = Math.max(0, Math.min(Math.min(pk.items.length, 300) - 1, pk.sel + (e.key === 'ArrowDown' ? 1 : -1)));
        render(); const s = el('symList').querySelector('[aria-selected="true"]'); s && s.scrollIntoView({ block:'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); pick(pk.items[pk.sel]?.alias); }
      else if (e.key === 'Escape') { open(false); el('symBtn').focus(); }
    });
    el('symF').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      pk.group = b.dataset.g; pk.sel = 0;
      el('symF').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      render(); el('symQ').focus();
    });
    el('symList').addEventListener('click', (e) => { const li = e.target.closest('li[data-a]'); li && pick(li.dataset.a); });
    document.addEventListener('mousedown', (e) => { if (!el('pop').hidden && !el('symCtl').contains(e.target)) open(false); });
    return { render, open };
  }
  const picker = makePicker('', { current: () => state.symbol, onPick: (alias) => {
    state.symbol = alias; try { localStorage.setItem('baExtremosSym', alias); } catch {}
    switchMarket();
  } });
  window.addEventListener('resize', () => chart && chart.resize());

  // ── Ajustes (solo en este navegador) ───────────────────────────────────
  const store = { get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} } };
  const settings = () => ({ treeKey: store.get('baTreeKey') });
  function openSettings() {
    $('setTree').value = settings().treeKey;
    try { $('settings').showModal(); } catch { $('settings').setAttribute('open', ''); }
  }
  $('openSettings').addEventListener('click', openSettings);
  $('setCancel').addEventListener('click', () => $('settings').close());
  $('setForm').addEventListener('submit', () => {
    store.set('baTreeKey', $('setTree').value.trim());
    mods.news && mods.news.reconnect();
  });

  // ── Menú lateral ───────────────────────────────────────────────────────
  const app = $('app');
  const setCollapsed = (on) => {
    app.classList.toggle('collapsed', on); $('collapse').setAttribute('aria-expanded', String(!on));
    $('collapse').title = on ? 'Expandir menú' : 'Contraer menú'; $('collapse').querySelector('.lab').textContent = on ? 'Expandir menú' : 'Contraer menú';
    store.set('baSide', on ? '1' : ''); setTimeout(() => { chart && chart.resize(); window.dispatchEvent(new Event('resize')); }, 220);
  };
  setCollapsed(store.get('baSide') === '1');
  $('collapse').addEventListener('click', () => setCollapsed(!app.classList.contains('collapsed')));
  const drawer = (open) => { app.classList.toggle('drawer', open); $('menuBtn').setAttribute('aria-expanded', String(open)); if (open) document.querySelector('.side-item[aria-current=page]')?.focus(); };
  $('menuBtn').addEventListener('click', () => drawer(!app.classList.contains('drawer')));
  $('backdrop').addEventListener('click', () => drawer(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.classList.contains('drawer')) { drawer(false); $('menuBtn').focus(); } });

  // ── Secciones ──────────────────────────────────────────────────────────
  let liveKnown; const liveReady = new Promise((r) => (liveKnown = r));
  const VIEWS = { ctx:'#contexto', ind:'#indicador', aur:'#aurora', grid:'#grid', scan:'#scanner', niv:'#niveles', of:'#orderflow', spag:'#spaghetti', liq:'#liquidaciones', news:'#noticias' };
  const mods = {};
  const snapBtc = () => { const m = (b) => ({ t:b.time, o:b.open, h:b.high, l:b.low, c:b.close, v:b.volume }); return { h1: snapBars('60').map(m), h4: snapBars('240').map(m) }; };
  // El Grid abre una celda en la sección Aurora con su mercado y temporalidad.
  const openAurora = (alias, tf) => {
    try { localStorage.setItem('baAuroraSym', alias); localStorage.setItem('baAuroraTf', tf); } catch {}
    mods.aur && mods.aur.open(alias, tf);
    location.hash = '#aurora';
  };
  const fromHash = () => Object.keys(VIEWS).find((k) => VIEWS[k] === location.hash) || 'ctx';
  async function showView(id) {
    for (const v in VIEWS) {
      $('panel-' + v).hidden = v !== id;
      const a = document.querySelector(`.side-item[data-v="${v}"]`);
      v === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    }
    drawer(false);
    for (const k in mods) if (k !== id && mods[k].hide) mods[k].hide();
    if (id === 'ind') { await startIndicator(); chart && chart.resize(); return; }
    await liveReady;
    if (!mods[id]) {
      if (id === 'ctx') mods.ctx = window.createContext({ live: state.live, hlPost, snapBtc });
      if (id === 'grid') mods.grid = window.createGrid({ live: state.live, CAT, loadCatalog, hlPost, makePicker, labelOf, openAurora });
      if (id === 'scan') mods.scan = window.createScanner({ live: state.live, CAT, loadCatalog, hlPost, labelOf, openAurora });
      if (id === 'of') mods.of = window.createOrderflow({ live: state.live, hlPost, CAT, loadCatalog, loadLibs, makeProvider, makePicker, labelOf, aliasKey, THEME, TF_LABEL });
      if (id === 'niv') mods.niv = window.createNiveles({ live: state.live, hlPost, CAT, loadCatalog, loadLibs, makeProvider, makePicker, labelOf, aliasKey, THEME, TF_LABEL });
      if (id === 'aur') mods.aur = window.createAurora({ live: state.live, hlPost, CAT, loadCatalog, loadLibs, makeProvider, makePicker, labelOf, aliasKey, THEME, TF_LABEL, snapBars, hasSnap: (tf) => !!SNAP[tf], fmtDate });
      if (id === 'spag') mods.spag = window.createSpaghetti({ live: state.live, CAT, loadCatalog, hlPost, snapshot: () => JSON.parse($('spagSnap').textContent) });
      if (id === 'liq') mods.liq = window.createLiqMap({ live: state.live, hlPost, snapshot: () => JSON.parse($('liqSnap').textContent) });
      if (id === 'news') mods.news = window.createNews({ settings, openSettings });
    }
    mods[id].show();
  }
  window.addEventListener('hashchange', () => showView(fromHash()));
  showView(fromHash());

  boot();
})();
