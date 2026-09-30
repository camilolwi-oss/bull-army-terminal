// Acceso · pantalla de login. La terminal recién arranca cuando BAGate.ready() se resuelve.
// La lista de accesos (access.json) se vuelve a leer al entrar, cada 10 minutos y al volver a la pestaña:
// si el Admin revoca o vence un acceso, la sesión se cierra sola.
// Aviso: sin servidor, este control vive en el navegador. Frena el acceso casual, no a alguien que lea el código.
window.BAGate = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const C = window.BACripto;
  const KEY = 'baSesion', MSG = 'baGateMsg', RECHECK = 10 * 60000;
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
    del() { try { localStorage.removeItem(KEY); } catch {} }
  };
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const status = (e, now = Date.now()) => (!e ? 'none' : e.revoked ? 'revoked' : Date.parse(e.exp) <= now ? 'expired' : 'ok');
  const why = (st, e) => st === 'expired' ? `Tu acceso venció el ${fmtDate(e.exp)}. Contactá a Bull Army para renovarlo.`
    : st === 'revoked' ? 'Tu acceso fue dado de baja. Contactá a Bull Army si creés que es un error.'
    : 'Usuario o contraseña incorrectos.';

  async function loadAccess() {
    // El parámetro evita la caché del CDN de GitHub Pages: una revocación se ve apenas termina el deploy.
    const r = await fetch('access.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ── Pantalla de login ─────────────────────────────────────────────────
  let onLogin = null, fails = 0, waitUntil = 0;
  function showLogin(msg) {
    document.body.classList.add('locked');
    $('gate').hidden = false;
    const m = msg || sessionStorage.getItem(MSG);
    sessionStorage.removeItem(MSG);
    $('gateErr').hidden = !m; $('gateErr').textContent = m || '';
    setTimeout(() => $('gateUser').focus(), 0);
  }
  $('gateShow').addEventListener('click', () => {
    const p = $('gatePass'), show = p.type === 'password';
    p.type = show ? 'text' : 'password'; $('gateShow').textContent = show ? 'Ocultar' : 'Ver';
  });
  $('gateForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = (t) => { $('gateErr').textContent = t; $('gateErr').hidden = false; };
    if (Date.now() < waitUntil) return err(`Demasiados intentos. Esperá ${Math.ceil((waitUntil - Date.now()) / 1000)} segundos.`);
    const user = $('gateUser').value.trim(), pass = $('gatePass').value;
    if (!user || !pass) return err('Completá usuario y contraseña.');
    const btn = $('gateBtn'); btn.disabled = true; btn.textContent = 'Verificando…'; $('gateErr').hidden = true;
    try {
      const access = await loadAccess();
      const id = await C.idOf(user), e = access.users.find((u) => u.id === id);
      const good = !!e && C.same(await C.hash(pass, e.salt, access.kdf.iter), e.hash);
      const st = good ? status(e) : 'none';
      if (st !== 'ok') {
        if (++fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; }
        return err(why(st, e));
      }
      fails = 0;
      const sess = { id, user, exp: e.exp, at: Date.now() };
      store.set(sess);
      $('gatePass').value = '';
      onLogin && onLogin(sess);
    } catch {
      err('No se pudo verificar el acceso. Revisá tu conexión y probá de nuevo.');
    } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
  });

  // ── Sesión activa ─────────────────────────────────────────────────────
  function logout(msg) {
    store.del();
    if (msg) sessionStorage.setItem(MSG, msg);
    location.hash = '';
    location.reload();
  }
  function unlock(sess) {
    $('gate').hidden = true;
    document.body.classList.remove('locked');
    $('sessUser').textContent = sess.user;
    $('logout').title = `Acceso hasta el ${fmtDate(sess.exp)} · Cerrar sesión`;
    $('logout').addEventListener('click', () => logout());
  }
  let watching = false;
  function watch() {
    if (watching) return; watching = true;
    const check = async () => {
      const sess = store.get(); if (!sess) return logout();
      let access; try { access = await loadAccess(); } catch { return; }   // sin conexión: se revisa la próxima vez
      const e = access.users.find((u) => u.id === sess.id), st = status(e);
      if (st !== 'ok') logout(why(st === 'none' ? 'revoked' : st, e));
    };
    setInterval(check, RECHECK);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }

  async function ready() {
    registerSW();
    // #admin abre el panel de accesos en lugar de la terminal.
    if (location.hash === '#admin') {
      window.addEventListener('hashchange', () => location.reload());
      window.BAAdmin.open();
      return new Promise(() => {});
    }
    let access = null; try { access = await loadAccess(); } catch {}
    const sess = store.get();
    if (sess) {
      if (access) {
        const e = access.users.find((u) => u.id === sess.id), st = status(e);
        if (st === 'ok') { sess.exp = e.exp; store.set(sess); unlock(sess); watch(); return; }
        store.del(); showLogin(why(st === 'none' ? 'revoked' : st, e));
      } else if (Date.parse(sess.exp) > Date.now()) {
        unlock(sess); watch(); return;            // sin conexión: vale la sesión guardada hasta su vencimiento
      } else showLogin(why('expired', sess));
    } else showLogin(access ? '' : 'No se pudo verificar el acceso. Revisá tu conexión y recargá la página.');
    return new Promise((resolve) => { onLogin = (s) => { unlock(s); watch(); resolve(); }; });
  }

  return { ready, loadAccess, status };
})();
