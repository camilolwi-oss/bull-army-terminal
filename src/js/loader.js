// Cargador para desarrollo: completa los <script data-src> (datos y Pine Script) y después
// ejecuta los <script data-app> en orden. El build (scripts/build.mjs) incrusta todo y quita este archivo.
(async () => {
  const fail = (msg) => {
    const $ = (id) => document.getElementById(id);
    $('warnTitle').textContent = 'No se pudo iniciar el panel.';
    $('warnBody').textContent = msg;
    $('retry').hidden = true;
    $('warn').hidden = false;
    console.error(msg);
  };
  if (location.protocol === 'file:') {
    return fail('Abrí el panel con "npm run dev" o usá el archivo de dist/: el navegador no deja leer los datos desde file://.');
  }
  try {
    await Promise.all([...document.querySelectorAll('script[data-src]')].map(async (s) => {
      const r = await fetch(s.dataset.src);
      if (!r.ok) throw new Error(`${s.dataset.src}: HTTP ${r.status}`);
      s.textContent = await r.text();
    }));
    for (const holder of document.querySelectorAll('script[data-app]')) {
      await new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = holder.dataset.app;
        s.onload = ok;
        s.onerror = () => ko(new Error(`No se pudo cargar ${holder.dataset.app}`));
        holder.replaceWith(s);
      });
    }
  } catch (e) {
    fail(`Error al cargar el panel: ${e.message}`);
  }
})();
