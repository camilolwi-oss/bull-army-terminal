// Aurora · velas con el oscilador Aurora y el Hull Suite. Se crea recién cuando se abre la pestaña.
// env: { live, hlPost, CAT, loadCatalog, loadLibs, makeProvider, makePicker, labelOf, aliasKey, THEME, TF_LABEL, snapBars, hasSnap(tf), fmtDate }
window.createAurora = function createAurora(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const AURORA = $('auroraPine').textContent, HULL = $('hullPine').textContent;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} }
  };
  const state = { symbol: store.get('baAuroraSym') || 'BTC', tf: store.get('baAuroraTf') || '30' };
  // En demo solo hay velas de muestra de BTC en algunas temporalidades.
  if (!env.live && !env.hasSnap(state.tf)) state.tf = '60';
  let chart = null, hAur = null, hHull = null, started = null;
  const flujo = window.createFlujo({ hlPost: env.hlPost, CAT: env.CAT, aliasKey: env.aliasKey });
  const FLOW_IDS = { delta: 'auDelta', cvd: 'auCvd', oi: 'auOi', arrows: 'auArrows', divs: 'auCvdDiv' };
  const vwapBoxes = () => [...document.querySelectorAll('#auVwap input')];
  try {
    const saved = JSON.parse(store.get('baAuroraFlow') || 'null');
    if (saved) {
      Object.entries(FLOW_IDS).forEach(([k, id]) => { if (typeof saved[k] === 'boolean') $(id).checked = saved[k]; });
      if (Array.isArray(saved.vwap)) vwapBoxes().forEach((b) => { b.checked = saved.vwap.includes(b.value); });
    }
  } catch {}
  const saveFlow = () => store.set('baAuroraFlow', JSON.stringify({
    ...Object.fromEntries(Object.entries(FLOW_IDS).map(([k, id]) => [k, $(id).checked])),
    vwap: vwapBoxes().filter((b) => b.checked).map((b) => b.value)
  }));
  const flowH = { delta: null, cvd: null, oi: null, sig: null, vwap: null };

  const veil = (txt, isErr) => {
    if (txt == null) { $('auVeil').classList.add('off'); return; }
    $('auVeil').classList.remove('off');
    $('auVeilTxt').textContent = txt; $('auVeilTxt').className = isErr ? 'err' : '';
  };

  // Los nombres coinciden con las variables de input de src/pine/aurora.pine y src/pine/hull-suite.pine.
  const auroraInputs = () => ({
    showFlow: $('auFlow').checked, showVol: $('auVol').checked, showStrips: $('auStrips').checked,
    showSig: $('auSig').checked, showDiv: $('auDiv').checked, divOnChart: $('auDiv').checked && $('auDivPx').checked,
    showOB: $('auOB').checked, obOnlyConf: $('auOBConf').checked, showGlow: $('auGlow').checked, showTbl: $('auTbl').checked
  });
  const hullInputs = () => ({
    showHull: $('auHull').checked,
    hullMode: document.querySelector('#auHullMode [aria-pressed="true"]').dataset.v,
    hullLen: +$('auHullLen').value,
    colorBars: $('auBars').checked
  });

  function syncTfButtons() {
    document.querySelectorAll('#auTf button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tf === state.tf));
      b.disabled = !env.live && !env.hasSnap(b.dataset.tf);
      b.title = b.disabled ? 'Disponible con datos en vivo' : '';
    });
  }
  function updateNote() {
    const tf = env.TF_LABEL[state.tf];
    if (env.live) {
      $('auNote').innerHTML = `<b>${env.labelOf(state.symbol)} · ${tf}</b> en vivo desde Hyperliquid. Las divergencias y los Order Blocks se confirman unas velas después del pivote.<span id="auFlowNote"></span>`;
    } else {
      const last = env.snapBars(state.tf).slice(-1)[0];
      $('auNote').innerHTML = `<b>Modo demo:</b> BTC ${tf} histórico hasta el ${env.fmtDate(last.time)}. Con conexión en vivo podés elegir cualquier mercado y temporalidad.<span id="auFlowNote"> Delta, CVD y open interest: solo con datos en vivo.</span>`;
    }
  }

  // Aurora va en su panel debajo del precio; el Hull Suite, sobre las velas.
  async function runScripts() {
    veil('Ejecutando Aurora y el Hull Suite…');
    const a = await chart.runIndicator(AURORA, { inputs: auroraInputs() });
    if (!a.ok) { veil('Error en Aurora: ' + (a.error && (a.error.message || a.error)), true); return; }
    const h = await chart.runIndicator(HULL, { inputs: hullInputs() });
    if (!h.ok) { veil('Error en el Hull Suite: ' + (h.error && (h.error.message || h.error)), true); return; }
    const mine = (src) => chart.indicators().find((x) => x.source === src) || null;
    hAur = mine(AURORA); hHull = mine(HULL);
    veil(null);
  }

  // Delta, CVD y OI de Binance (solo mercados que también cotizan ahí) y VWAP anclados.
  let flowSeq = 0;
  async function syncFlow() {
    if (!chart) return;
    const seq = ++flowSeq;
    const inf = env.live ? await flujo.info(state.symbol, state.tf) : { sym: null, oi: false };
    if (seq !== flowSeq) return;
    const on = (k) => $(FLOW_IDS[k]).checked;
    const set = (k, want, type, inputs) => {
      if (want && !flowH[k]) flowH[k] = chart.addNativeIndicator(type, inputs ? { inputs } : undefined);
      else if (!want && flowH[k]) { const h = flowH[k]; flowH[k] = null; h.remove(); }
      else if (want && inputs) flowH[k].setInputs(inputs);
    };
    const vw = Object.fromEntries(vwapBoxes().map((b) => [b.value, b.checked]));
    set('vwap', Object.values(vw).some(Boolean), 'ba-vwap', vw);
    set('delta', on('delta') && !!inf.sym, 'ba-delta');
    set('cvd', on('cvd') && !!inf.sym, 'ba-cvd');
    set('oi', on('oi') && !!inf.sym, 'ba-oi');
    set('sig', (on('arrows') || on('divs')) && !!inf.sym, 'ba-flow-sig', { arrows: on('arrows'), divs: on('divs') });
    const panes = ['delta', 'cvd', 'oi'].filter((k) => flowH[k]).length;
    $('auChart').classList.toggle('flow', panes >= 2); chart.resize();
    const note = $('auFlowNote');
    if (note && env.live) {
      note.innerHTML = inf.sym
        ? ` Delta, CVD y open interest de <b>Binance ${inf.sym}</b>; flechas y divergencias solo con velas cerradas.` + (inf.oi ? '' : ' En 1m Binance no da open interest por vela: no hay flechas.')
        : ` Delta, CVD y open interest: <b>${env.labelOf(state.symbol)}</b> no cotiza en Binance Futures.`;
    }
  }

  async function switchMarket() {
    syncTfButtons(); updateNote();
    veil('Cargando ' + (env.live ? env.labelOf(state.symbol) : 'BTC') + ' ' + env.TF_LABEL[state.tf] + '…');
    try {
      if (env.live) await chart.setMarket({ symbol: 'hyperliquid:' + state.symbol, timeframe: state.tf });
      else await chart.setMarket({ symbol: 'BTCUSDC', timeframe: state.tf, data: env.snapBars(state.tf) });
      veil(null);
      syncFlow();
    } catch {
      veil('No se pudo cargar ' + env.labelOf(state.symbol) + '. Elegí otro mercado del buscador.', true);
    }
  }

  const picker = env.makePicker('au', { current: () => state.symbol, onPick: (alias) => {
    state.symbol = alias; store.set('baAuroraSym', alias); switchMarket();
  } });

  async function build() {
    veil('Cargando el gráfico…');
    try { await env.loadLibs(); }
    catch { started = null; veil('No se pudieron cargar las librerías del gráfico. Revisá la conexión y probá de nuevo.', true); return; }
    if (env.live && !env.CAT.ready) { try { await env.loadCatalog(); } catch {} }
    const opts = { theme: env.THEME, upColor: env.THEME.upColor, downColor: env.THEME.downColor, animations: { intro: false }, drawings: window.innerWidth < 700 ? { toolbar: false } : undefined };
    if (env.live) {
      if (env.CAT.ready && !env.CAT.byAlias.has(env.aliasKey(state.symbol))) state.symbol = 'BTC';
      state.symbol = env.aliasKey(state.symbol);
      chart = new Vela.Vela('#auChart', { ...opts, symbol: 'hyperliquid:' + state.symbol, timeframe: state.tf, live: true });
      chart.data.registerProvider('hyperliquid', env.makeProvider());
      picker.render();
    } else {
      chart = new Vela.Vela('#auChart', { ...opts, symbol: 'BTCUSDC', timeframe: state.tf, data: env.snapBars(state.tf), live: false });
      $('auSymBtn').disabled = true; $('auSymLbl').textContent = 'BTC (demo)';
      $('auSymCtl').title = 'Disponible con datos en vivo';
    }
    chart.registerEngine('pine', new VelaPinets.PineWorkerEngine());
    flujo.register();
    let rev = 0;
    flujo.onSigBump(() => flowH.sig && flowH.sig.setInputs({ arrows: $('auArrows').checked, divs: $('auCvdDiv').checked, rev: ++rev }));
    // Si se quita un indicador de flujo desde su leyenda, se apaga también su control.
    chart.on('indicator:removed', ({ id }) => {
      Object.keys(flowH).forEach((k) => {
        if (!flowH[k] || flowH[k].id !== id) return;
        flowH[k] = null;
        if (k === 'vwap') vwapBoxes().forEach((b) => { b.checked = false; });
        else if (FLOW_IDS[k]) $(FLOW_IDS[k]).checked = false;
        saveFlow(); syncFlow();
      });
    });
    syncTfButtons(); updateNote();
    try { await chart.ready(); await runScripts(); await syncFlow(); }
    catch (e) { veil('No se pudo iniciar el gráfico: ' + (e && e.message || e), true); }
    window.__AURORA_READY = true;
  }

  // ── Controles ──────────────────────────────────────────────────────────
  $('auTf').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled || b.dataset.tf === state.tf) return;
    state.tf = b.dataset.tf; store.set('baAuroraTf', state.tf); switchMarket();
  });
  ['auFlow', 'auVol', 'auStrips', 'auSig', 'auDiv', 'auDivPx', 'auOB', 'auOBConf', 'auGlow', 'auTbl'].forEach((id) =>
    $(id).addEventListener('change', () => {
      $('auDivPx').disabled = !$('auDiv').checked; $('auOBConf').disabled = !$('auOB').checked;
      hAur && hAur.setInputs(auroraInputs());
    }));
  const syncHull = () => {
    const on = $('auHull').checked;
    $('auHullMode').querySelectorAll('button').forEach((b) => { b.disabled = !on; });
    $('auHullLen').disabled = !on; $('auBars').disabled = !on;
    hHull && hHull.setInputs(hullInputs());
  };
  ['auHull', 'auHullLen', 'auBars'].forEach((id) => $(id).addEventListener('change', syncHull));
  $('auHullMode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    $('auHullMode').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    syncHull();
  });
  [...Object.values(FLOW_IDS).map((id) => $(id)), ...vwapBoxes()].forEach((el) => el.addEventListener('change', () => { saveFlow(); syncFlow(); }));
  window.addEventListener('resize', () => chart && !$('panel-aur').hidden && chart.resize());

  return {
    show() { if (!started) started = build(); else chart && chart.resize(); return started; },
    hide() {},
    // Desde el Grid: abre un mercado y temporalidad puntuales.
    open(alias, tf) {
      state.symbol = alias; state.tf = tf; store.set('baAuroraSym', alias); store.set('baAuroraTf', tf);
      $('auSymLbl').textContent = env.labelOf(alias);
      if (chart) switchMarket();
    }
  };
};
