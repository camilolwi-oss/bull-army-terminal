// Captura del gráfico que se está viendo: botón 📷 en el encabezado de cada sección con un menú como el de
// TradingView (descargar, copiar, abrir en una pestaña, compartir y publicar en X). La imagen lleva una franja
// con la marca, el mercado, la fecha y el enlace a la terminal.
// Cada sección se registra con: BACapture.register(id, { name: () => 'Aurora · BTC-PERP · 1H', canvas: async () => canvas })
window.BACapture = (() => {
  'use strict';
  const WEB = 'https://camilolwi-oss.github.io/bull-army-terminal/';
  const BG = '#0B0B0C', GOLD = '#C9A227', FG = '#ECE9E2', MUTED = '#8E8B84', LINE = '#25252A';
  const reg = new Map();
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.6"/></svg>';

  // ── Imagen final: el gráfico + una franja de marca abajo ──
  async function compose(id) {
    const r = reg.get(id); if (!r) throw new Error('Sección sin captura');
    const src = await r.canvas();
    if (!src || !src.width) throw new Error('El gráfico todavía no está listo');
    const scale = Math.max(1, Math.round(src.width / Math.max(1, src.clientWidth || src.width / (window.devicePixelRatio || 1)))) || 1;
    const bar = 40 * scale, out = document.createElement('canvas');
    out.width = src.width; out.height = src.height + bar;
    const g = out.getContext('2d');
    g.fillStyle = BG; g.fillRect(0, 0, out.width, out.height);
    g.drawImage(src, 0, 0);
    // franja
    const y = src.height;
    g.fillStyle = BG; g.fillRect(0, y, out.width, bar);
    g.fillStyle = LINE; g.fillRect(0, y, out.width, Math.max(1, scale));
    const s = (px) => px * scale, mid = y + bar / 2;
    g.fillStyle = GOLD; g.beginPath(); g.roundRect ? g.roundRect(s(12), mid - s(11), s(22), s(22), s(4)) : g.rect(s(12), mid - s(11), s(22), s(22)); g.fill();
    g.fillStyle = BG; g.font = `700 ${s(10)}px "IBM Plex Mono", ui-monospace, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BA', s(23), mid + s(0.5));
    g.textAlign = 'left'; g.fillStyle = FG; g.font = `700 ${s(13)}px system-ui, sans-serif`; g.fillText('Bull Army Terminal', s(42), mid);
    const w1 = g.measureText('Bull Army Terminal').width;
    g.fillStyle = MUTED; g.font = `500 ${s(12)}px "IBM Plex Mono", ui-monospace, monospace`; g.fillText('·  ' + (r.name() || ''), s(50) + w1, mid);
    const when = new Date().toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    g.textAlign = 'right'; g.fillText(`${when}  ·  ${WEB.replace('https://', '')}`, out.width - s(14), mid);
    return out;
  }
  const toBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo armar la imagen'))), 'image/png'));
  const fileName = (id) => {
    const r = reg.get(id), d = new Date(), p = (n) => String(n).padStart(2, '0');
    const base = (r.name() || id).replace(/[·/:\\]+/g, ' ').replace(/[^\w\s.-]+/g, '').trim().replace(/\s+/g, '_');
    return `BullArmy_${base}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.png`;
  };

  // ── Acciones ──
  async function download(id) {
    const blob = await toBlob(await compose(id)), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fileName(id); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Imagen descargada');
  }
  // El portapapeles se pide dentro del clic (Safari exige la promesa en el mismo gesto).
  async function copy(id, quiet) {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('Este navegador no permite copiar imágenes; usá Descargar.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': compose(id).then(toBlob) })]);
    if (!quiet) toast('Imagen copiada · pegala con Ctrl+V');
  }
  async function openTab(id, win) {
    const url = URL.createObjectURL(await toBlob(await compose(id)));
    if (win) win.location.href = url; else window.open(url, '_blank');
    toast('Imagen abierta en una pestaña nueva');
  }
  async function share(id) {
    const file = new File([await toBlob(await compose(id))], fileName(id), { type: 'image/png' });
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) throw new Error('Tu navegador no permite compartir archivos; usá Copiar o Descargar.');
    await navigator.share({ files: [file], title: 'Bull Army Terminal', text: (reg.get(id).name() || '') + ' · ' + WEB });
  }
  // X no permite adjuntar una imagen desde un enlace: se copia al portapapeles (antes de abrir la pestaña, mientras
  // la página tiene el foco) y se abre el post para pegarla.
  async function postX(id) {
    const copying = copy(id, true);
    const text = `${reg.get(id).name() || 'Bull Army Terminal'} · Bull Army Terminal`;
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(WEB)}`, '_blank', 'noopener');
    let copied = true; try { await copying; } catch { copied = false; }
    toast(copied ? 'Imagen copiada: pegala en el post con Ctrl+V' : 'Se abrió X; descargá la imagen para adjuntarla');
  }
  const canShare = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })); } catch { return false; } };

  // ── Interfaz: botón + menú en el encabezado de la sección ──
  let tEl = null, tTimer = null;
  function toast(msg, err) {
    if (!tEl) { tEl = document.createElement('div'); tEl.className = 'cap-toast'; tEl.setAttribute('role', 'status'); document.body.append(tEl); }
    tEl.textContent = msg; tEl.classList.toggle('err', !!err); tEl.classList.add('on');
    clearTimeout(tTimer); tTimer = setTimeout(() => tEl.classList.remove('on'), 3200);
  }
  const ITEMS = [
    ['download', 'Descargar imagen', 'Ctrl + Alt + S'],
    ['copy', 'Copiar imagen', 'Ctrl + Shift + S'],
    ['open', 'Abrir en una pestaña nueva', ''],
    ['share', 'Compartir…', ''],
    ['x', 'Publicar en X', '']
  ];
  async function run(id, act) {
    // Las pestañas nuevas se abren dentro del clic para que el navegador no las bloquee.
    const win = act === 'open' ? window.open('', '_blank') : null;
    try {
      if (act === 'download') await download(id);
      else if (act === 'copy') await copy(id);
      else if (act === 'open') await openTab(id, win);
      else if (act === 'share') await share(id);
      else if (act === 'x') await postX(id);
    } catch (e) {
      if (win) win.close();
      if (e && e.name === 'AbortError') return;
      toast((e && e.message) || 'No se pudo sacar la captura', true);
    }
  }
  function mount(id) {
    const head = document.querySelector(`#panel-${id} .view-head`);
    if (!head || head.querySelector('.cap')) return;
    const box = document.createElement('div'); box.className = 'cap';
    box.innerHTML = `<button type="button" class="cap-btn" aria-haspopup="menu" aria-expanded="false" title="Captura del gráfico">${ICON}<span>Captura</span></button>
      <div class="cap-menu" role="menu" hidden><p class="cap-h">Imagen del gráfico</p>${ITEMS.filter(([a]) => a !== 'share' || canShare()).map(([a, label, key]) => `<button type="button" role="menuitem" data-act="${a}"><span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`).join('')}</div>`;
    head.classList.add('has-cap'); head.append(box);
    const btn = box.querySelector('.cap-btn'), menu = box.querySelector('.cap-menu');
    const open = (on) => { menu.hidden = !on; btn.setAttribute('aria-expanded', String(on)); };
    btn.addEventListener('click', () => open(menu.hidden));
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (!b) return; open(false); run(id, b.dataset.act); });
    document.addEventListener('mousedown', (e) => { if (!menu.hidden && !box.contains(e.target)) open(false); });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { open(false); btn.focus(); } });
  }
  // Atajos de TradingView sobre la sección visible.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || !(e.altKey || e.shiftKey)) return;
    const vis = [...reg.keys()].find((id) => { const p = document.getElementById('panel-' + id); return p && !p.hidden; });
    if (!vis) return;
    e.preventDefault(); run(vis, e.altKey ? 'download' : 'copy');
  });

  return {
    register(id, r) { reg.set(id, r); mount(id); },
    compose,   // la imagen final de una sección (canvas), por ejemplo para pruebas
    // Canvas de un gráfico Vela (velas, indicadores, dibujos y capas propias).
    vela: (chart) => async () => (chart() && chart().renderer && chart().renderer.screenshotCanvas ? chart().renderer.screenshotCanvas() : null),
    // Un canvas propio de la terminal, con su fondo.
    plain: (el) => async () => { const c = typeof el === 'function' ? el() : el; if (!c || !c.width) return null; const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const g = o.getContext('2d'); g.fillStyle = BG; g.fillRect(0, 0, o.width, o.height); g.drawImage(c, 0, 0); return o; },
    // Un bloque de la página (tarjetas con texto y SVG): lo dibuja el propio navegador con html-to-image, que se
    // carga recién la primera vez que se usa (respeta todo el CSS moderno de la terminal).
    dom: (el) => async () => {
      const node = typeof el === 'function' ? el() : el; if (!node) return null;
      if (!window.htmlToImage) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js'; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar el capturador; revisá la conexión.')); document.head.append(s); });
      return window.htmlToImage.toCanvas(node, { backgroundColor: BG, pixelRatio: Math.min(2, window.devicePixelRatio || 1), cacheBust: false });
    },
    toast
  };
})();
