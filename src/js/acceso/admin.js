// Acceso · panel de Admin (se abre con #admin). Crea, revoca, reactiva y vence accesos.
// Los cambios se guardan en src/app.dat del repo (codificado): el panel los publica con un token de GitHub
// (guardado solo en este navegador) y el deploy los aplica en 1–2 minutos.
window.BAAdmin = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const C = window.BACripto;
  const REPO = 'camilolwi-oss/bull-army-terminal', PATH = 'src/app.dat', BRANCH = 'main';
  const TOKEN_KEY = 'baGhToken';
  const TZ = '-03:00';                                  // los vencimientos cierran a las 23:59 de Argentina
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
  const dateOf = (iso) => iso.slice(0, 10);
  const expIso = (date) => `${date}T23:59:59${TZ}`;
  const endOfYear = () => `${new Date().getFullYear()}-12-31`;

  let access = null, key = null, roster = [], dirty = 0;

  // ── Estructura ────────────────────────────────────────────────────────
  function shell() {
    const v = $('adminView');
    v.innerHTML = `
      <header class="ad-top">
        <div class="ad-brand"><span class="mark">BA</span><div><b>Accesos</b><small>Bull Army Terminal · Admin</small></div></div>
        <a class="btn" href="./">Abrir la terminal</a>
      </header>
      <main class="ad-main" id="adMain"></main>`;
    v.hidden = false;
  }
  function loginForm(msg) {
    $('adMain').innerHTML = `
      <form class="ad-card ad-login" id="adLogin">
        <h1>Panel de Admin</h1>
        <label>Usuario <input id="adUser" autocomplete="username" required></label>
        <label>Contraseña <input id="adPass" type="password" autocomplete="current-password" required></label>
        <p class="gate-err" id="adErr" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
        <button class="gate-btn" id="adBtn">Entrar</button>
      </form>`;
    $('adUser').focus();
    $('adLogin').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('adBtn'); btn.disabled = true; btn.textContent = 'Verificando…';
      try { await login($('adUser').value.trim(), $('adPass').value); }
      catch (er) { $('adErr').textContent = er.message; $('adErr').hidden = false; btn.disabled = false; btn.textContent = 'Entrar'; }
    });
  }
  async function login(user, pass) {
    try { access = await window.BAGate.loadAccess(); } catch { throw new Error('No se pudo leer la lista de accesos. Recargá la página con Ctrl+F5 (puede haber quedado una versión vieja en caché) y revisá la conexión.'); }
    const iter = access.kdf.iter;
    const ok = (await C.idOf(user)) === access.admin.id && C.same(await C.check(await C.proof(pass, access.admin.salt, iter)), access.admin.check);
    if (!ok) throw new Error('Usuario o contraseña de Admin incorrectos.');
    key = await C.aesKey(pass, access.roster.salt, iter);
    roster = await C.open(access.roster, key);
    dirty = 0;
    render();
  }

  // ── Listado ───────────────────────────────────────────────────────────
  function state(r) {
    const left = Date.parse(r.exp) - Date.now();
    if (r.revoked) return ['Revocado', 'rev'];
    if (left <= 0) return ['Vencido', 'exp'];
    if (left < 7 * 864e5) return ['Vence pronto', 'soon'];
    return ['Activo', 'ok'];
  }
  function render(flash) {
    const rows = [...roster].sort((a, b) => a.user.localeCompare(b.user));
    const n = (k) => roster.filter((r) => state(r)[1] === k).length;
    $('adMain').innerHTML = `
      <section class="ad-stats">
        <div><b>${n('ok') + n('soon')}</b><span>Activos</span></div>
        <div><b>${n('soon')}</b><span>Vencen en 7 días</span></div>
        <div><b>${n('exp')}</b><span>Vencidos</span></div>
        <div><b>${n('rev')}</b><span>Revocados</span></div>
      </section>
      ${pubBar()}
      ${flash ? `<div class="ad-flash">${flash}</div>` : ''}
      <section class="ad-card">
        <h2>Nuevo acceso</h2>
        <form class="ad-new" id="adNew">
          <label>Usuario <input id="nwUser" required autocomplete="off" spellcheck="false"></label>
          <label>Contraseña <span class="pw"><input id="nwPass" required autocomplete="off" spellcheck="false"><button type="button" class="btn" id="nwGen" title="Generar otra">↻</button></span></label>
          <label>Vence <input id="nwExp" type="date" required value="${endOfYear()}"></label>
          <label>Nota <input id="nwNote" placeholder="Opcional (ej. plan anual)"></label>
          <button class="btn primary" id="nwBtn">Agregar</button>
        </form>
      </section>
      <section class="ad-card">
        <h2>Usuarios <small>${roster.length}</small></h2>
        <div class="ad-tablewrap"><table class="ad-table">
          <thead><tr><th>Usuario</th><th>Estado</th><th>Vence</th><th>Alta</th><th>Nota</th><th></th></tr></thead>
          <tbody>${rows.map((r) => { const [txt, cls] = state(r); return `
            <tr data-id="${r.id}" class="${cls}">
              <td><b>${esc(r.user)}</b></td>
              <td><span class="ad-st ${cls}">${txt}</span></td>
              <td><input type="date" class="ad-exp" value="${dateOf(r.exp)}" aria-label="Vencimiento de ${esc(r.user)}"></td>
              <td>${esc(r.created ? fmt(r.created) : '—')}</td>
              <td class="ad-note">${esc(r.note || '')}</td>
              <td class="ad-acts">
                <button class="btn" data-a="${r.revoked ? 'reactivate' : 'revoke'}">${r.revoked ? 'Reactivar' : 'Revocar'}</button>
                <button class="btn" data-a="reset">Nueva contraseña</button>
                <button class="btn danger" data-a="delete" title="Eliminar">✕</button>
              </td>
            </tr>`; }).join('') || '<tr><td colspan="6" class="ad-empty">Todavía no hay accesos.</td></tr>'}</tbody>
        </table></div>
      </section>
      <section class="ad-card ad-cols">
        <div>
          <h2>Publicación</h2>
          ${savedToken()
            ? `<p class="ad-help">✅ Token de GitHub guardado en este navegador: <b>cada cambio se publica solo</b> y se aplica en 1–2 minutos.</p>
               <button type="button" class="btn" id="adForget">Olvidar el token</button>`
            : `<p class="ad-help">Sin token guardado, los cambios quedan pendientes hasta que los publiques desde la barra de arriba.</p>`}
          ${tokenHelp()}
        </div>
        <form id="adPw">
          <h2>Contraseña de Admin</h2>
          <label>Nueva contraseña <input id="adNewPw" type="password" autocomplete="new-password" minlength="12" required></label>
          <label>Repetir <input id="adNewPw2" type="password" autocomplete="new-password" minlength="12" required></label>
          <button class="btn">Cambiar</button>
          <p class="ad-help">Mínimo 12 caracteres. Se aplica al publicar.</p>
        </form>
      </section>`;
    $('nwPass').value = C.genPassword();
    wire();
  }

  // ── Acciones ──────────────────────────────────────────────────────────
  const userOf = (id) => access.users.find((u) => u.id === id);
  const savedToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
  // flash: último aviso (por ejemplo la contraseña recién creada); sigue visible mientras se publica.
  // pub.state: idle · publishing · waiting (publicado, esperando el deploy) · live · slow · error
  let flash = '', pub = { state: 'idle', msg: '' }, pubTimer = null;
  const change = (msg) => {
    dirty++; flash = msg; pub = { state: 'idle', msg: '' };
    render(flash);
    if (savedToken()) { clearTimeout(pubTimer); pubTimer = setTimeout(() => publish(savedToken()), 600); }
  };
  function tokenHelp() {
    return `<details class="ad-help"><summary>¿Cómo creo el token de GitHub?</summary><ol>
      <li>Abrí <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → nuevo token (fine-grained)</a> con tu cuenta.</li>
      <li><b>Repository access</b>: <i>Only select repositories</i> → <code>${REPO.split('/')[1]}</code>.</li>
      <li><b>Permissions</b> → <b>Contents</b>: <i>Read and write</i>.</li>
      <li>Elegí un vencimiento, tocá <b>Generate token</b>, copialo y pegalo acá.</li></ol></details>`;
  }
  function pubBar() {
    const n = `${dirty} ${dirty === 1 ? 'cambio' : 'cambios'}`;
    if (pub.state === 'publishing') return `<div class="ad-bar">⏳ <b>Publicando ${n}…</b></div>`;
    if (pub.state === 'error') return `<div class="ad-bar warn"><span>❌ <b>No se pudo publicar:</b> ${esc(pub.msg)} Los cambios <b>todavía no se aplican</b>.</span>
      <button class="btn primary" id="adRetry">Reintentar</button><button class="btn" id="adForget2">Cambiar token</button></div>`;
    if (dirty && savedToken()) return `<div class="ad-bar">⏳ <b>Publicando ${n}…</b></div>`;
    if (dirty) return `<div class="ad-bar warn" id="adBar">
        <span><b>⚠ ${n} sin publicar: todavía no se aplican.</b> Un acceso nuevo <b>no funciona</b> hasta que lo publiques.</span>
        <label class="ad-tok">Token de GitHub <input id="adToken" type="password" autocomplete="off" placeholder="github_pat_…"></label>
        <label class="tog"><input type="checkbox" id="adRemember" checked> Recordar y publicar solo de ahora en más</label>
        <button class="btn primary" id="adPublish">Publicar ahora</button>
        <button class="btn" id="adDownload">Descargar app.dat</button>
        ${tokenHelp()}
      </div>`;
    if (pub.state === 'waiting') return `<div class="ad-bar">⏳ <b>Publicado.</b> Esperando que se aplique en la terminal (1–2 minutos)…</div>`;
    if (pub.state === 'live') return `<div class="ad-bar ok">✅ <b>Ya activo:</b> los cambios están en línea y los usuarios ya pueden usarlos.</div>`;
    if (pub.state === 'slow') return `<div class="ad-bar warn">El cambio se publicó pero todavía no aparece en la terminal. Revisá la pestaña <b>Actions</b> del repo en GitHub.</div>`;
    return '';
  }
  function wire() {
    $('nwGen').addEventListener('click', () => { $('nwPass').value = C.genPassword(); });
    $('adNew').addEventListener('submit', async (e) => {
      e.preventDefault();
      const user = $('nwUser').value.trim(), pass = $('nwPass').value, exp = expIso($('nwExp').value), note = $('nwNote').value.trim();
      if (pass.length < 10) return alert('La contraseña tiene que tener al menos 10 caracteres.');
      const id = await C.idOf(user);
      if (userOf(id)) return alert(`Ya existe un acceso para "${user}".`);
      $('nwBtn').disabled = true; $('nwBtn').textContent = 'Creando…';
      const salt = C.salt();
      access.users.push({ id, salt, check: await C.check(await C.proof(pass, salt, access.kdf.iter)), exp, revoked: false });
      roster.push({ id, user, exp, created: new Date().toISOString(), revoked: false, note });
      change(`Acceso creado para <b>${esc(user)}</b> hasta el ${fmt(exp)}. Contraseña: <code class="ad-secret">${esc(pass)}</code> <button class="btn" data-copy="${esc(pass)}">Copiar</button> — anotala ahora: después no se puede ver.`);
    });
    document.querySelectorAll('.ad-table tr[data-id]').forEach((tr) => {
      const id = tr.dataset.id, r = roster.find((x) => x.id === id), u = userOf(id);
      tr.querySelector('.ad-exp').addEventListener('change', (e) => {
        if (!e.target.value) return;
        r.exp = u.exp = expIso(e.target.value);
        change(`Vencimiento de <b>${esc(r.user)}</b> cambiado al ${fmt(r.exp)}.`);
      });
      tr.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', async () => {
        const a = b.dataset.a;
        if (a === 'revoke' || a === 'reactivate') {
          r.revoked = u.revoked = a === 'revoke';
          change(`${esc(r.user)}: acceso ${a === 'revoke' ? 'revocado' : 'reactivado'}.`);
        } else if (a === 'reset') {
          if (!confirm(`¿Generar una contraseña nueva para ${r.user}? La anterior deja de funcionar al publicar.`)) return;
          const pass = C.genPassword(); u.salt = C.salt(); u.check = await C.check(await C.proof(pass, u.salt, access.kdf.iter));
          change(`Nueva contraseña para <b>${esc(r.user)}</b>: <code class="ad-secret">${esc(pass)}</code> <button class="btn" data-copy="${esc(pass)}">Copiar</button> — anotala ahora.`);
        } else if (a === 'delete') {
          if (!confirm(`¿Eliminar el acceso de ${r.user}? No se puede deshacer (podés revocarlo en su lugar).`)) return;
          access.users = access.users.filter((x) => x.id !== id); roster = roster.filter((x) => x.id !== id);
          change(`Acceso de ${esc(r.user)} eliminado.`);
        }
      }));
    });
    document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => { navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copiada'; }));
    $('adPw').addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = $('adNewPw').value, p2 = $('adNewPw2').value;
      if (p1 !== p2) return alert('Las contraseñas no coinciden.');
      access.admin.salt = C.salt(); access.admin.check = await C.check(await C.proof(p1, access.admin.salt, access.kdf.iter));
      access.roster.salt = C.salt(); key = await C.aesKey(p1, access.roster.salt, access.kdf.iter);
      change('Contraseña de Admin cambiada. Publicá para aplicarla (la anterior deja de funcionar).');
    });
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('adPublish', () => {
      const token = $('adToken').value.trim();
      if (!token) { $('adToken').focus(); return alert('Pegá el token de GitHub para publicar.'); }
      if ($('adRemember').checked) { try { localStorage.setItem(TOKEN_KEY, token); } catch {} }
      publish(token);
    });
    // Enter en el campo del token también publica.
    const tok = $('adToken');
    if (tok) tok.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('adPublish').click(); } });
    on('adDownload', async () => {
      const blob = new Blob([await serialize()], { type: 'application/octet-stream' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'app.dat'; a.click();
    });
    on('adRetry', () => publish(savedToken() || ($('adToken') && $('adToken').value.trim())));
    const forget = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} pub = { state: 'idle', msg: '' }; render(flash); };
    on('adForget', forget); on('adForget2', forget);
  }

  async function serialize() {
    access.roster = { salt: access.roster.salt, ...(await C.seal(roster, key)) };
    access.updated = new Date().toISOString();
    return C.encode(access);
  }
  let publishing = false, again = false;
  async function publish(token) {
    if (publishing) { again = true; return; }                  // un cambio mientras se publica: se publica de nuevo al terminar
    if (!token) { pub = { state: 'error', msg: 'Falta el token de GitHub.' }; return render(flash); }
    publishing = true; pub = { state: 'publishing', msg: '' }; render(flash);
    const sent = dirty;
    const api = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    try {
      const cur = await fetch(`${api}?ref=${BRANCH}`, { headers, cache: 'no-store' });
      if (!cur.ok) throw new Error(cur.status === 401 || cur.status === 403 || cur.status === 404 ? 'el token no es válido, venció o no tiene acceso al repo.' : `GitHub respondió ${cur.status}.`);
      const { sha } = await cur.json();
      const content = btoa(unescape(encodeURIComponent(await serialize())));
      const expected = access.updated;
      const put = await fetch(api, { method: 'PUT', headers, body: JSON.stringify({ message: 'Accesos: actualización desde el panel de Admin', content, sha, branch: BRANCH }) });
      if (!put.ok) throw new Error(put.status === 409 ? 'el archivo cambió en GitHub mientras editabas; recargá el panel.'
        : put.status === 403 || put.status === 404 ? 'el token puede leer el repo pero no escribir en él: en GitHub, editá el token y poné Contents en "Read and write" (o elegí el repo bull-army-terminal en Repository access).'
        : `GitHub respondió ${put.status} al guardar.`);
      dirty = Math.max(0, dirty - sent);
      pub = { state: 'waiting', msg: '' }; publishing = false; render(flash);
      if (again || dirty) { again = false; return publish(token); }
      waitLive(expected);
    } catch (e) {
      publishing = false; again = false;
      pub = { state: 'error', msg: e.message }; render(flash);
    }
  }
  // Después de publicar: se relee la lista de la terminal hasta que aparece la versión nueva.
  async function waitLive(expected) {
    const t0 = Date.now();
    while (pub.state === 'waiting') {
      await new Promise((r) => setTimeout(r, 10000));
      if (pub.state !== 'waiting') return;
      try { if ((await window.BAGate.loadAccess()).updated >= expected) { pub = { state: 'live', msg: '' }; return render(flash); } } catch {}
      if (Date.now() - t0 > 5 * 60000) { pub = { state: 'slow', msg: '' }; return render(flash); }
    }
  }

  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  return {
    open() {
      document.body.classList.add('locked', 'admin-mode');
      document.title = 'Accesos · Bull Army Terminal';
      shell(); loginForm();
    }
  };
})();
