// Noticias (Tree News) y calendario macro (servidor propio). Se crea al abrir la sección.
// env: { settings() → { treeKey, calUrl }, openSettings() }
window.createNews = function createNews(env) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const REST = 'https://news.treeofalpha.com/api/news?limit=200', WS = 'wss://news.treeofalpha.com/ws';
  const S = { items: [], ids: new Set(), filter: 'all', q: '', ws: null, retry: 0, fresh: new Set() };
  const nf = (v, d = 0) => v.toLocaleString('es-AR', { minimumFractionDigits:d, maximumFractionDigits:d });
  const hm = (t) => new Date(t).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`; };
  const status = (s, t) => { $('nwStatus').dataset.s = s; $('nwStatusTxt').textContent = t; };

  // ── Normalización de Tree News ─────────────────────────────────────────
  function parse(x) {
    if (!x || !x.title || !x.time) return null;
    let src = x.sourceName || x.source || '', title = x.title, text = x.body || '';
    const tw = /^(.+?)\s*\(@([\w]+)\):\s*([\s\S]*)$/.exec(title);
    if (x.source === 'Twitter' || tw) {
      if (tw) { src = tw[1]; title = tw[3]; }
    } else if (x.sourceName && title.toUpperCase().startsWith(x.sourceName.toUpperCase() + ':')) {
      title = title.slice(x.sourceName.length + 1).trim();
    }
    if (text && text === title) text = '';
    const coins = new Set();
    (x.symbols || []).forEach((s) => coins.add(String(s).split(/[_-]/)[0]));
    (x.suggestions || []).forEach((s) => s.coin && coins.add(s.coin));
    return { id: x._id || x.time + title.slice(0, 20), t: +x.time, src: src.trim(), title: title.trim(), text: text.trim(), url: x.url || x.link || '', coins: [...coins].slice(0, 4), kind: x.source === 'Twitter' || tw ? 'tw' : 'media' };
  }
  function add(list, isNew) {
    let added = 0;
    for (const raw of list) {
      const it = parse(raw); if (!it || S.ids.has(it.id)) continue;
      S.ids.add(it.id); S.items.push(it); added++;
      if (isNew) S.fresh.add(it.id);
    }
    S.items.sort((a, b) => b.t - a.t);
    if (S.items.length > 400) S.items.splice(400).forEach((x) => S.ids.delete(x.id));
    return added;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function render() {
    const q = S.q.toLowerCase(), f = S.filter;
    const list = S.items.filter((x) => (f === 'all' || (f === 'coins' ? x.coins.length : x.kind === f)) && (!q || (x.title + ' ' + x.src + ' ' + x.coins.join(' ')).toLowerCase().includes(q)));
    const feed = $('nwFeed'); feed.textContent = ''; feed.setAttribute('aria-busy', 'false');
    if (!list.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = S.items.length ? 'Ninguna noticia coincide con el filtro.' : 'Todavía no hay noticias.'; feed.append(p); return; }
    const now = Date.now(), today = new Date(); today.setHours(0, 0, 0, 0);
    const bucket = (t) => now - t < 36e5 ? 'Última hora' : t >= +today ? 'Antes hoy' : t >= +today - 864e5 ? 'Ayer' : 'Más viejas';
    let cur = null, count = 0, head = null;
    const close = () => { if (head) head.querySelector('span').textContent = count; };
    for (const x of list.slice(0, 200)) {
      const b = bucket(x.t);
      if (b !== cur) { close(); cur = b; count = 0; head = document.createElement('h2'); head.className = 'nw-group'; head.textContent = b; head.append(document.createElement('span')); feed.append(head); }
      count++;
      const art = document.createElement('article'); art.className = 'nw-item' + (S.fresh.has(x.id) ? ' fresh' : '');
      const tm = document.createElement('time'); tm.dateTime = new Date(x.t).toISOString(); tm.textContent = hm(x.t);
      const sm = document.createElement('small'); sm.textContent = ago(x.t); tm.append(sm);
      const body = document.createElement('div'); body.className = 'nw-body';
      const top = document.createElement('div'); top.className = 'nw-top';
      const src = document.createElement('span'); src.className = 'nw-src'; src.textContent = x.src;
      const coins = document.createElement('div'); coins.className = 'nw-coins';
      x.coins.forEach((c) => { const s = document.createElement('span'); s.textContent = c; coins.append(s); });
      top.append(src, coins);
      const a = document.createElement(x.url ? 'a' : 'span'); a.className = 'nw-title'; a.textContent = x.title;
      if (x.url && /^https?:\/\//.test(x.url)) { a.href = x.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      body.append(top, a);
      if (x.text) { const p = document.createElement('p'); p.className = 'nw-text'; p.textContent = x.text; body.append(p); }
      art.append(tm, body); feed.append(art);
    }
    close();
    S.fresh.clear();
  }
  let rq = false; const schedule = () => { if (!rq) { rq = true; requestAnimationFrame(() => { rq = false; render(); }); } };

  // ── Conexión ───────────────────────────────────────────────────────────
  async function history() {
    try { const j = await (await fetch(REST)).json(); add(j, false); render(); return true; }
    catch { return false; }
  }
  function connect() {
    if (S.ws) { try { S.ws.close(); } catch {} }
    const key = env.settings().treeKey;
    let ws;
    try { ws = new WebSocket(WS); } catch { status('off', 'Sin conexión'); return; }
    S.ws = ws;
    ws.onopen = () => {
      S.retry = 0;
      if (key) { ws.send('login ' + key); status('live', 'En vivo'); }
      else status('delayed', 'Demorado · cargá tu key en Ajustes');
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { if (/invalid|error|denied/i.test(String(e.data))) status('delayed', 'Key inválida · revisá Ajustes'); return; }
      const arr = Array.isArray(m) ? m : [m];
      if (add(arr, true)) schedule();
    };
    ws.onclose = () => {
      if (S.ws !== ws) return;
      status('off', 'Reconectando…');
      setTimeout(connect, Math.min(30000, 2000 * 2 ** S.retry++));
    };
  }

  // ── Calendario macro ───────────────────────────────────────────────────
  const CAL = { events: [], t: 0 };
  async function loadCal() {
    const url = env.settings().calUrl, box = $('nwMacro');
    if (!url) {
      box.textContent = '';
      const d = document.createElement('div'); d.className = 'mc-setup';
      const p = document.createElement('p'); p.textContent = 'El calendario sale de tu servidor propio (Cloudflare Worker). Cuando lo tengas publicado, pegá su dirección en Ajustes.';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Abrir Ajustes'; b.addEventListener('click', env.openSettings);
      d.append(p, b); box.append(d); return;
    }
    try {
      const j = await (await fetch(url, { cache:'no-store' })).json();
      CAL.events = (j.events || []).map((e) => ({ ...e, t: +new Date(e.date) })).filter((e) => isFinite(e.t)).sort((a, b) => a.t - b.t);
      CAL.t = Date.now(); renderCal();
    } catch { box.textContent = ''; const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No se pudo leer el servidor del calendario. Revisá la dirección en Ajustes.'; box.append(p); }
  }
  const until = (ms) => { const m = Math.max(0, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60; return d ? `${d} d ${h} h` : h ? `${h} h ${mm} min` : `${mm} min`; };
  function renderCal() {
    const box = $('nwMacro'), now = Date.now(); box.textContent = '';
    const usd = CAL.events.filter((e) => e.country === 'USD' && (e.impact === 'High' || e.impact === 'Medium'));
    const up = usd.filter((e) => e.t >= now - 30 * 60000);
    const next = up.find((e) => e.impact === 'High' && e.t >= now);
    if (next) {
      const d = document.createElement('div'); d.className = 'mc-next';
      const l = document.createElement('span'); l.className = 'lbl'; l.textContent = 'Próximo dato fuerte de EE.UU.';
      const cd = document.createElement('span'); cd.className = 'cd'; cd.textContent = until(next.t - now);
      const b = document.createElement('b'); b.textContent = next.title;
      const w = document.createElement('span'); w.className = 'sub'; w.textContent = new Date(next.t).toLocaleString('es-AR', { weekday:'long', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
      const fp = document.createElement('div'); fp.className = 'fp';
      [['Pronóstico', next.forecast], ['Anterior', next.previous]].forEach(([k, v]) => { const s = document.createElement('span'), sm = document.createElement('small'); sm.textContent = k; s.append(sm, document.createTextNode(v || '—')); fp.append(s); });
      d.append(l, cd, b, w, fp); box.append(d);
    }
    let day = null, ul = null;
    for (const e of up) {
      const k = new Date(e.t).toDateString();
      if (k !== day) {
        day = k; const h = document.createElement('h3'); h.className = 'mc-day';
        const a = document.createElement('span'), dd = new Date(e.t), t0 = new Date(); t0.setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(dd).setHours(0, 0, 0, 0) - t0) / 864e5);
        a.textContent = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : dd.toLocaleDateString('es-AR', { weekday:'long' });
        const b = document.createElement('span'); b.textContent = dd.toLocaleDateString('es-AR', { day:'numeric', month:'short' });
        h.append(a, b); box.append(h); ul = document.createElement('ul'); ul.className = 'mc-list'; box.append(ul);
      }
      const li = document.createElement('li');
      const tm = document.createElement('time'); tm.textContent = new Date(e.t).toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
      const ev = document.createElement('span'); ev.className = 'ev' + (e.impact === 'High' ? ' hi' : ''); ev.textContent = e.title;
      if (e.forecast || e.previous) { const sm = document.createElement('small'); sm.textContent = `P ${e.forecast || '—'} · A ${e.previous || '—'}`; ev.append(sm); }
      const inn = document.createElement('span'); inn.className = 'in' + (e.t - now < 3 * 36e5 && e.t > now ? ' soon' : '');
      inn.textContent = e.t > now ? 'en ' + until(e.t - now) : 'publicado';
      li.append(tm, ev, inn); ul.append(li);
    }
    if (!up.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No quedan datos de EE.UU. de impacto medio o alto esta semana.'; box.append(p); }
    const n = document.createElement('p'); n.className = 'sub'; n.textContent = 'Horas locales · P pronóstico · A anterior · Fuente: ForexFactory vía tu servidor.'; box.append(n);
  }

  // ── Controles ──────────────────────────────────────────────────────────
  $('nwFilter').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S.filter = b.dataset.f; $('nwFilter').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render();
  });
  $('nwQ').addEventListener('input', () => { S.q = $('nwQ').value.trim(); render(); });

  (async function start() {
    const ok = await history();
    if (!ok) { status('off', 'Sin conexión'); const f = $('nwFeed'); f.textContent = ''; const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No se pudo conectar con Tree News. Abrí el archivo en tu navegador para ver las noticias.'; f.append(p); }
    else connect();
    loadCal();
  })();
  setInterval(() => { if (!$('panel-news').hidden) { render(); if (CAL.events.length) renderCal(); } }, 60000);
  setInterval(() => { if (env.settings().calUrl) loadCal(); }, 30 * 60000);

  return { show() { render(); }, hide() {}, reconnect() { connect(); loadCal(); } };
};
