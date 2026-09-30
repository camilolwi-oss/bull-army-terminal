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
      <div class="ad-bar" id="adBar" ${dirty ? '' : 'hidden'}>
        <span><b>${dirty} ${dirty === 1 ? 'cambio' : 'cambios'} sin publicar.</b> Los usuarios los ven recién después de publicar.</span>
        <button class="btn primary" id="adPublish">Publicar en GitHub</button>
        <button class="btn" id="adDownload">Descargar app.dat</button>
      </div>
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
          <p class="ad-help">Para publicar, el panel necesita un <b>token de GitHub</b> con permiso de escritura solo sobre el repo <code>${REPO}</code>.
          Crealo en GitHub → Settings → Developer settings → Fine-grained tokens, con acceso a ese repo y el permiso <i>Contents: Read and write</i>.</p>
          <label>Token de GitHub <input id="adToken" type="password" autocomplete="off" value="${esc(localStorage.getItem(TOKEN_KEY) || '')}" placeholder="github_pat_…"></label>
          <label class="tog"><input type="checkbox" id="adRemember" ${localStorage.getItem(TOKEN_KEY) ? 'checked' : ''}> Recordar en este navegador</label>
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
  const change = (msg) => { dirty++; render(msg); };
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
    const bar = $('adBar');
    if (!bar.hidden) {
      $('adPublish').addEventListener('click', publish);
      $('adDownload').addEventListener('click', async () => {
        const blob = new Blob([await serialize()], { type: 'application/octet-stream' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'app.dat'; a.click();
      });
    }
  }

  async function serialize() {
    access.roster = { salt: access.roster.salt, ...(await C.seal(roster, key)) };
    access.updated = new Date().toISOString();
    return C.encode(access);
  }
  async function publish() {
    const token = $('adToken').value.trim();
    if (!token) return alert('Pegá el token de GitHub en "Publicación".');
    try { $('adRemember').checked ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch {}
    const btn = $('adPublish'); btn.disabled = true; btn.textContent = 'Publicando…';
    const api = `https://api.github.com/repos/${REPO}/contents/${PATH}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    try {
      const cur = await fetch(`${api}?ref=${BRANCH}`, { headers, cache: 'no-store' });
      if (!cur.ok) throw new Error(cur.status === 401 || cur.status === 403 || cur.status === 404 ? 'El token no es válido o no tiene acceso al repo.' : `GitHub respondió ${cur.status}.`);
      const { sha } = await cur.json();
      const content = btoa(unescape(encodeURIComponent(await serialize())));
      const put = await fetch(api, { method: 'PUT', headers, body: JSON.stringify({ message: 'Accesos: actualización desde el panel de Admin', content, sha, branch: BRANCH }) });
      if (!put.ok) throw new Error(put.status === 409 ? 'El archivo cambió en GitHub mientras editabas. Recargá el panel.' : `GitHub respondió ${put.status} al guardar.`);
      dirty = 0;
      render('Publicado. Los cambios se aplican en 1–2 minutos, cuando termina el deploy.');
    } catch (e) {
      alert('No se pudo publicar: ' + e.message);
      btn.disabled = false; btn.textContent = 'Publicar en GitHub';
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
