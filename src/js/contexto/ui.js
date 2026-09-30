// Contexto de mercado · interfaz y datos. Se crea al abrir la sección.
// env: { live, hlPost, snapBtc() → { h1:[...], h4:[...] } }
window.createContext = function createContext(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CM = window.CtxMath;
  const css = getComputedStyle($('panel-ctx'));
  const C = (n, d) => css.getPropertyValue(n).trim() || d;
  const COL = { fg:C('--fg','#ECE9E2'), muted:C('--muted','#8E8B84'), faint:C('--faint','#5B5953'), line:C('--line','#25252A'), gold:C('--gold','#C9A227'), up:C('--bull','#7FAF7F'), dn:C('--bear','#C8704F'), surface:C('--surface','#121214'), bg:C('--bg','#0B0B0C') };
  const NS = 'http://www.w3.org/2000/svg';
  const D = { range: 7 };

  // ── Formatos ───────────────────────────────────────────────────────────
  const nf = (v, d = 0) => v.toLocaleString('es-AR', { minimumFractionDigits:d, maximumFractionDigits:d });
  const pct = (v, d = 1) => { if (!isFinite(v)) return '—'; const r = +(v * 100).toFixed(d); return (r > 0 ? '+' : r < 0 ? '−' : '') + nf(Math.abs(r), d) + ' %'; };
  const usd = (v, d) => { if (!isFinite(v)) return '—'; const a = Math.abs(v), s = v < 0 ? '−' : ''; return s + '$' + (a >= 1e9 ? nf(a / 1e9, 2) + ' B' : a >= 1e6 ? nf(a / 1e6, 1) + ' M' : nf(a, d ?? (a >= 1000 ? 0 : 2))); };
  const cls = (el, v) => { el.classList.toggle('up', v > 0); el.classList.toggle('dn', v < 0); };
  const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const hm = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  const hh = (h) => String(h).padStart(2, '0') + ':00';

  // ── Datos ──────────────────────────────────────────────────────────────
  const toC = (k) => ({ t:+k.t, o:+k.o, h:+k.h, l:+k.l, c:+k.c, v:+k.v });
  async function candles(coin, interval, start) {
    const r = await env.hlPost({ type:'candleSnapshot', req:{ coin, interval, startTime:start, endTime:Date.now() } });
    return (r || []).map(toC);
  }
  const bin = (path) => fetch('https://fapi.binance.com/futures/data/' + path).then((r) => r.json());
  async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const x = items[i++]; try { await fn(x); } catch {} } })); }
  function aggregate(h, hours) {
    const out = []; let cur = null;
    for (const x of h) {
      const k = Math.floor(x.t / (hours * 36e5)) * hours * 36e5;
      if (!cur || cur.t !== k) { cur = { t:k, o:x.o, h:x.h, l:x.l, c:x.c, v:x.v }; out.push(cur); }
      else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.v += x.v; }
    }
    return out;
  }

  async function loadAll() {
    const now = Date.now();
    const [meta, daily, hourly] = await Promise.all([
      env.hlPost({ type:'metaAndAssetCtxs' }),
      candles('BTC', '1d', Date.UTC(2019, 0, 1)),
      candles('BTC', '1h', now - 62 * 864e5)
    ]);
    D.daily = daily; D.hourly = hourly; D.now = now;
    const assets = meta[0].universe.map((u, i) => ({ coin:u.name, del:u.isDelisted, mark:+meta[1][i].markPx, prev:+meta[1][i].prevDayPx, vol:+meta[1][i].dayNtlVlm, funding:+meta[1][i].funding }))
      .filter((a) => !a.del && a.vol > 0);
    D.assets = assets; D.btcFunding = (assets.find((a) => a.coin === 'BTC') || {}).funding;
    renderBtcSide(); renderBreadth();
    // En paralelo: Binance, ETF y diarios de las 30 monedas con más volumen.
    const top = [...assets].sort((a, b) => b.vol - a.vol).slice(0, 20).map((a) => a.coin);
    if (!top.includes('BTC')) top.push('BTC');
    // Los diarios de las alts cambian poco: se reutilizan hasta una hora.
    let cache = null; try { cache = JSON.parse(localStorage.getItem('baCtxDaily')); } catch {}
    const fresh = cache && now - cache.t < 36e5 && top.every((c) => cache.closes[c]);
    D.closes = fresh ? cache.closes : {};
    await Promise.all([
      Promise.all([bin('openInterestHist?symbol=BTCUSDT&period=1h&limit=25'), bin('globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=25'), bin('takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=25')])
        .then(([oi, ls, tk]) => { D.lev = { oi, ls, tk }; renderLev(); }).catch(() => renderLev(true)),
      fetch('https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ type:'us-btc-spot' }) })
        .then((r) => r.json()).then((j) => { D.etf = j.data.map((x) => ({ date:x.date, t:Date.parse(x.date), net:+x.totalNetInflow })); renderEtf(); }).catch(() => renderEtf(true)),
      (fresh ? Promise.resolve() : pool(top, 3, async (c) => { D.closes[c] = await candles(c, '1d', now - 46 * 864e5); })
        .then(() => { try { localStorage.setItem('baCtxDaily', JSON.stringify({ t: now, closes: D.closes })); } catch {} }))
        .then(() => { D.altsDone = true; renderAlts(); })
    ]);
  }

  // ── SVG ────────────────────────────────────────────────────────────────
  function fit(svg) { const w = svg.clientWidth || 300, h = svg.clientHeight || 100; svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.textContent = ''; return { w, h }; }
  function el(svg, tag, attrs, text) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; svg.appendChild(e); return e; }
  function spark(svg, vals, { color = COL.fg, area = false, mid } = {}) {
    const { w, h } = fit(svg), v = vals.filter(isFinite); if (v.length < 2) return;
    let lo = Math.min(...v), hi = Math.max(...v); if (mid != null) { lo = Math.min(lo, mid); hi = Math.max(hi, mid); }
    const X = (i) => 1 + (i / (vals.length - 1)) * (w - 2), Y = (x) => h - 2 - ((x - lo) / (hi - lo || 1)) * (h - 4);
    if (mid != null) el(svg, 'line', { x1:0, x2:w, y1:Y(mid), y2:Y(mid), stroke:COL.line, 'stroke-dasharray':'2 3' });
    const pts = vals.map((x, i) => isFinite(x) ? `${X(i).toFixed(1)},${Y(x).toFixed(1)}` : null).filter(Boolean);
    if (area) el(svg, 'polygon', { points:`${X(0)},${h} ${pts.join(' ')} ${X(vals.length - 1)},${h}`, fill:color, 'fill-opacity':0.12 });
    el(svg, 'polyline', { points:pts.join(' '), fill:'none', stroke:color, 'stroke-width':1.5, 'stroke-linejoin':'round' });
    return { X, Y };
  }
  function tipAt(tip, x, y, lines) {
    tip.textContent = ''; const ol = document.createElement('ol');
    lines.forEach(([a, b]) => { const li = document.createElement('li'), s = document.createElement('span'), v = document.createElement('b'); li.append(document.createElement('span')); s.textContent = a; v.textContent = b; li.append(s, v); ol.append(li); });
    tip.append(ol); tip.hidden = false;
    const W = tip.parentElement.clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(W - tw - 4, x + 12)) + 'px'; tip.style.top = Math.max(4, y - 30) + 'px';
  }

  // ── Paneles ────────────────────────────────────────────────────────────
  function renderBtcSide() {
    const d = D.daily, now = D.now;
    // Régimen
    const rg = CM.regime(d);
    const big = $('cxRegBig');
    big.textContent = rg.state === 'long' ? 'Sesgo long' : rg.state === 'short' ? 'Sesgo short' : rg.state ? 'Neutral' : '—';
    cls(big, rg.state === 'long' ? 1 : rg.state === 'short' ? -1 : 0);
    const ab = (v, ma) => v > ma ? 'arriba' : 'abajo';
    $('cxRegLead').textContent = isFinite(rg.sma200) ? `Bitcoin está ${ab(rg.price, rg.sma50)} de su media de 50 días (${usd(rg.sma50)}) y ${ab(rg.price, rg.sma200)} de la de 200 días (${usd(rg.sma200)}).` : 'Falta historia para la media de 200 días.';
    if (rg.n >= 30) {
      // La ventaja se mide a favor del sesgo: para long, rendir más que un día cualquiera; para short, rendir menos.
      const diff = (rg.avgFwd - rg.base) * (rg.state === 'short' ? -1 : 1);
      const side = rg.state === 'short' ? ' para los shorts' : rg.state === 'long' ? ' para los longs' : '';
      const edge = rg.state === 'neutral' ? 'Sin sesgo' : diff <= 0.001 ? 'Sin ventaja histórica' : diff < 0.005 ? 'Ventaja leve' + side : 'Ventaja clara' + side;
      $('cxRegSub').textContent = `${edge}: en este estado BTC rindió ${pct(rg.avgFwd)} a 5 días, contra ${pct(rg.base)} de un día cualquiera, y subió el ${nf(rg.pctUp * 100)} % de las veces (${nf(rg.n)} días desde 2019).`;
    } else $('cxRegSub').textContent = '';
    // Precio, 5 días, volatilidad
    const last = D.assets ? (D.assets.find((a) => a.coin === 'BTC') || {}).mark : d[d.length - 1].c;
    $('cxPx').textContent = usd(last || d[d.length - 1].c, 0);
    const c5 = CM.change(d, 5); $('cx5d').textContent = pct(c5); cls($('cx5d'), c5);
    const vr = CM.volRegime(d); $('cxVol').textContent = vr.label;
    renderBtcChart();
    // Operar o esperar
    const act = CM.activity(D.hourly, d, now);
    $('cxTradeBig').textContent = act.verdict; cls($('cxTradeBig'), act.verdict === 'Operar' ? 1 : 0);
    $('cxTradeBig').classList.toggle('gold', act.verdict !== 'Operar');
    $('cxDow').textContent = DOW[act.dow];
    $('cxDowV').textContent = `${nf(act.dowMult, 2)}× lo normal`;
    const mood = act.nowMult < 0.7 ? 'Tranquilo' : act.nowMult > 1.3 ? 'Movido' : 'Normal';
    $('cxNowV').textContent = `${mood} · ${nf(act.nowMult, 2)}×`;
    $('cxPrimeV').textContent = `${hh(act.primeStart)}–${hh((act.primeStart + 4) % 24)} · ${act.inPrime ? 'ahora' : 'en ' + hm(act.untilPrime).replace(/ 0 min$/, '')}`;
    $('cxPrimeV').previousElementSibling.textContent = 'Horario fuerte';
    D.act = act; renderMoves();
    // CME
    const gaps = CM.cmeGaps(D.hourly, now, 8);
    if (gaps.length) {
      const g = gaps[0], cur = D.hourly[D.hourly.length - 1].c;
      $('cxCmeBig').textContent = g.filledAt ? 'Cerrado' : 'Abierto';
      $('cxCmeBig').classList.toggle('gold', !g.filledAt);
      const when = (x) => x.hoursToFill == null ? 'abierto' : x.hoursToFill < 1 ? 'cerrado en <1 h' : `cerrado en ${x.hoursToFill} h`;
      $('cxCmeLead').textContent = g.filledAt ? `El último gap (${pct(g.gap, 2)}) se ${g.hoursToFill < 1 ? 'cerró en la primera hora' : 'cerró en ' + g.hoursToFill + ' h'}. El próximo se forma cuando CME vuelva a cerrar el viernes.`
        : `El gap de ${pct(g.gap, 2)} sigue abierto en ${usd(g.close, 0)}, a ${pct(g.close / cur - 1)} del precio.`;
      const tb = $('cxCmeRows'); tb.textContent = '';
      gaps.slice(0, 3).forEach((x) => {
        const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'), c = document.createElement('td');
        a.textContent = new Date(x.closeT).toLocaleDateString('es-AR', { day:'numeric', month:'short' });
        b.textContent = pct(x.gap, 2); b.className = x.gap > 0 ? 'up' : 'dn'; c.textContent = when(x);
        tr.append(a, b, c); tb.append(tr);
      });
    }
    // ATR
    const ad = CM.atr(d, 14), a = ad[ad.length - 1], today = d[d.length - 1];
    $('cxAtrBig').textContent = usd(a, 0);
    const un = document.createElement('span'); un.className = 'unit'; un.textContent = `${nf((a / today.c) * 100, 2)} %`; $('cxAtrBig').append(un);
    spark($('cxAtrS'), ad.slice(-30), { color:COL.dn });
    const used = (today.h - today.l) / a;
    $('cxAtrBar').style.width = Math.min(100, used * 100) + '%';
    $('cxAtrLead').textContent = `Hoy se usó el ${nf(used * 100)} % de un rango diario normal.`;
    const a4 = CM.atr(aggregate(D.hourly, 4), 14), a1 = CM.atr(D.hourly, 14);
    const px = D.hourly[D.hourly.length - 1].c;
    $('cxAtr4').textContent = `${usd(a4[a4.length - 1], 0)} · ${nf((a4[a4.length - 1] / px) * 100, 2)} %`;
    $('cxAtr1').textContent = `${usd(a1[a1.length - 1], 0)} · ${nf((a1[a1.length - 1] / px) * 100, 2)} %`;
  }

  function renderBtcChart() {
    const r = D.range, src = r <= 30 ? D.hourly.slice(-r * 24) : D.daily.slice(-r);
    const vals = src.map((x) => x.c), svg = $('cxBtcSvg');
    const g = spark(svg, vals, { color:COL.gold, area:true, mid:vals[0] });
    const ch = vals[vals.length - 1] / vals[0] - 1; $('cxRangeChg').textContent = pct(ch); cls($('cxRangeChg'), ch);
    svg.onpointermove = (e) => {
      const rc = svg.getBoundingClientRect(), i = Math.round(((e.clientX - rc.left) / rc.width) * (vals.length - 1));
      const x = src[Math.max(0, Math.min(src.length - 1, i))];
      tipAt($('cxBtcTip'), e.clientX - rc.left, e.clientY - rc.top, [[new Date(x.t).toLocaleString('es-AR', { day:'numeric', month:'short', hour: r <= 30 ? '2-digit' : undefined, minute: r <= 30 ? '2-digit' : undefined, hourCycle:'h23' }), usd(x.c, 0)]]);
    };
    svg.onpointerleave = () => { $('cxBtcTip').hidden = true; };
  }

  function renderMoves() {
    const act = D.act, svg = $('cxMovesSvg'), { w, h } = fit(svg);
    const mx = Math.max(...act.avgHour), bw = w / 24, cur = new Date(D.now).getUTCHours();
    act.avgHour.forEach((v, i) => {
      const prime = ((i - act.primeStart + 24) % 24) < 4, bh = (v / mx) * (h - 20);
      el(svg, 'rect', { x:i * bw + 1, y:h - 18 - bh, width:Math.max(1, bw - 2), height:bh, rx:2, fill: i === cur ? COL.fg : prime ? COL.gold : COL.faint });
    });
    [0, 6, 12, 18].forEach((hr) => el(svg, 'text', { x:hr * bw + 2, y:h - 4, fill:COL.muted, 'font-size':10, 'font-family':'IBM Plex Mono, monospace' }, hh(hr)));
    svg.onpointermove = (e) => {
      const rc = svg.getBoundingClientRect(), i = Math.max(0, Math.min(23, Math.floor(((e.clientX - rc.left) / rc.width) * 24)));
      tipAt($('cxMovesTip'), e.clientX - rc.left, e.clientY - rc.top, [[`${hh(i)} UTC`, nf(act.avgHour[i] * 100, 2) + ' %']]);
    };
    svg.onpointerleave = () => { $('cxMovesTip').hidden = true; };
  }

  function renderBreadth() {
    const b = CM.breadth([...D.assets].sort((x, y) => y.vol - x.vol).slice(0, 60));
    $('cxBrPct').textContent = `${nf(b.pctUp * 100)} % en verde`; cls($('cxBrPct'), b.pctUp - 0.5);
    $('cxBrUp').textContent = b.up; $('cxBrDn').textContent = b.down;
    $('cxBrMed').textContent = pct(b.median); cls($('cxBrMed'), b.median);
    const svg = $('cxBrSvg'), { w, h } = fit(svg), mx = Math.max(...b.list.map((x) => Math.abs(x.ch))), bw = w / b.list.length, mid = h / 2;
    b.list.forEach((x, i) => { const bh = (Math.abs(x.ch) / mx) * (mid - 4); el(svg, 'rect', { x:i * bw + 0.5, y: x.ch >= 0 ? mid - bh : mid, width:Math.max(1, bw - 1.5), height:Math.max(1, bh), fill: x.ch >= 0 ? COL.up : COL.dn }); });
    el(svg, 'line', { x1:0, x2:w, y1:mid, y2:mid, stroke:COL.line });
    svg.onpointermove = (e) => {
      const rc = svg.getBoundingClientRect(), i = Math.max(0, Math.min(b.list.length - 1, Math.floor(((e.clientX - rc.left) / rc.width) * b.list.length)));
      tipAt($('cxBrTip'), e.clientX - rc.left, e.clientY - rc.top, [[b.list[i].coin, pct(b.list[i].ch, 2)]]);
    };
    svg.onpointerleave = () => { $('cxBrTip').hidden = true; };
  }

  function renderAlts() {
    const btc = D.closes.BTC; if (!btc) return;
    const n = btc.length, closes = {};
    for (const c in D.closes) { const a = D.closes[c]; if (a.length === n && a[n - 1].t === btc[n - 1].t) closes[c] = a.map((x) => x.c); }
    const r = CM.relative(closes, btc.map((x) => x.c), 14);
    $('cxAltsBig').textContent = `${r.leading} de ${r.total}`; cls($('cxAltsBig'), r.leading / r.total - 0.5);
    $('cxAltsLead').textContent = r.leading / r.total > 0.5 ? 'Las alts lideran.' : 'Lidera Bitcoin.';
    $('cxAltsBar').style.width = (r.leading / r.total) * 100 + '%';
    $('cxAltsBar').style.background = r.leading / r.total > 0.5 ? COL.up : COL.dn;
    spark($('cxAlts30'), r.series, { color:COL.up, mid:0.5 });
    $('cxEth').textContent = pct(r.ethVsBtc); cls($('cxEth'), r.ethVsBtc);
    $('cxMedBtc').textContent = pct(r.medianVsBtc); cls($('cxMedBtc'), r.medianVsBtc);
    spark($('cxBr30'), r.breadthSeries, { color:COL.up, mid:0.5 });
  }

  function renderLev(failed) {
    if (failed || !D.lev) { ['cxOi', 'cxLs', 'cxTk'].forEach((id) => ($(id).textContent = 'sin datos')); }
    else {
      const oi = D.lev.oi.map((x) => +x.sumOpenInterestValue), ls = D.lev.ls.map((x) => +x.longShortRatio), tk = D.lev.tk.map((x) => +x.buySellRatio);
      const oich = oi[oi.length - 1] / oi[0] - 1;
      $('cxOi').textContent = pct(oich); cls($('cxOi'), oich); spark($('cxOiS'), oi, { color: oich >= 0 ? COL.up : COL.dn });
      $('cxLs').textContent = nf(ls[ls.length - 1], 2); spark($('cxLsS'), ls, { color:COL.up, mid:1 });
      $('cxTk').textContent = nf(tk[tk.length - 1], 2); spark($('cxTkS'), tk, { color:COL.up, mid:1 });
    }
    const f = D.btcFunding; $('cxFund').textContent = isFinite(f) ? pct(f, 4) : '—'; if (isFinite(f)) cls($('cxFund'), f);
  }

  function renderEtf(failed) {
    if (failed || !D.etf) { $('cxEtfBig').textContent = '—'; $('cxEtfLead').textContent = 'No se pudo leer SoSoValue.'; return; }
    const e = CM.etf(D.etf, D.daily);
    $('cxEtfBig').textContent = (e.sum7 > 0 ? '+' : '') + usd(e.sum7); cls($('cxEtfBig'), e.sum7);
    $('cxEtfLead').textContent = `${e.streak} ${e.streak === 1 ? 'día' : 'días'} de ${e.sign > 0 ? 'entradas' : 'salidas'} seguidos · 30 días ${(e.sum30 > 0 ? '+' : '') + usd(e.sum30)}`;
    $('cxEtfSub').textContent = e.n >= 5 ? `Desde ${new Date(D.etf[D.etf.length - 1].t).toLocaleDateString('es-AR', { month:'short', year:'numeric' })}: después de 5 o más días seguidos de entradas, BTC rindió ${pct(e.afterAvg)} a 5 días, contra ${pct(e.baseAvg)} de un día cualquiera (${e.n} casos).` : '';
    const svg = $('cxEtfSvg'), { w, h } = fit(svg), mx = Math.max(...e.last7.map((x) => Math.abs(x.net))), bw = w / 7, mid = (h - 16) / 2;
    e.last7.forEach((x, i) => {
      const bh = (Math.abs(x.net) / mx) * (mid - 2);
      el(svg, 'rect', { x:i * bw + bw * 0.2, y: x.net >= 0 ? mid - bh : mid, width:bw * 0.6, height:Math.max(1, bh), rx:2, fill: x.net >= 0 ? COL.up : COL.dn });
      el(svg, 'text', { x:i * bw + bw / 2, y:h - 2, fill:COL.muted, 'font-size':10, 'text-anchor':'middle', 'font-family':'IBM Plex Mono, monospace' }, new Date(x.t + 12 * 36e5).toLocaleDateString('es-AR', { weekday:'short', timeZone:'UTC' }).replace('.', ''));
    });
  }

  function empty(ids, txt) { ids.forEach((id) => { const c = $(id); if (c.querySelector('.empty')) return; const p = document.createElement('p'); p.className = 'empty'; p.textContent = txt; c.append(p); }); }

  // ── Interacción ────────────────────────────────────────────────────────
  $('panel-ctx').addEventListener('click', (e) => {
    const b = e.target.closest('.help'); if (!b) return;
    const t = $(b.getAttribute('aria-controls')), open = t.hidden;
    t.hidden = !open; b.setAttribute('aria-expanded', String(open));
  });
  $('cxRange').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !D.hourly) return;
    D.range = +b.dataset.r; $('cxRange').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderBtcChart();
  });
  new ResizeObserver(() => { if (!D.hourly) return; renderBtcChart(); renderMoves(); if (D.assets) renderBreadth(); if (D.etf) renderEtf(); if (D.altsDone) renderAlts(); if (D.lev) renderLev(); }).observe($('panel-ctx'));

  // ── Arranque ───────────────────────────────────────────────────────────
  let timer = null;
  (async function start() {
    if (!env.live) {
      const s = env.snapBtc();
      D.hourly = s.h1; D.daily = aggregate(s.h4, 24); D.now = D.hourly[D.hourly.length - 1].t + 36e5;
      renderBtcSide();
      empty(['cxBreadth', 'cxAlts', 'cxLev', 'cxEtf'], 'Necesita conexión en vivo.');
      $('cxCap').textContent = `Datos de muestra de BTC hasta el ${new Date(D.now).toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' })}. Abrí el archivo en tu navegador para verlo en vivo.`;
      return;
    }
    try { await loadAll(); } catch { $('cxCap').textContent = 'No se pudieron cargar los datos de Hyperliquid. Probá recargar.'; return; }
    $('cxCap').textContent = `Actualizado ${new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', hourCycle:'h23' })} · se refresca cada 5 min.`;
    $('cxNote').textContent = 'Fuentes: Hyperliquid (precios, amplitud, funding), Binance Futures (open interest, long/short, compras/ventas agresivas) y SoSoValue (ETF). El gap de CME es una aproximación con precios de Hyperliquid.';
    timer = setInterval(async () => {
      if ($('panel-ctx').hidden) return;
      try { await loadAll(); $('cxCap').textContent = `Actualizado ${new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', hourCycle:'h23' })} · se refresca cada 5 min.`; } catch {}
    }, 5 * 60000);
  })();

  return { show() { if (D.hourly) { renderBtcChart(); renderMoves(); } }, hide() {} };
};
