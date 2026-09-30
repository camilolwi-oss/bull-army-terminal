# Publicar

## En la web (GitHub Pages)

La terminal se publica sola en:

**https://camilolwi-oss.github.io/bull-army-terminal/**

Cada `git push` a la rama `main` dispara la acción **Publicar en GitHub Pages** (`.github/workflows/pages.yml`), que:

1. Ejecuta `npm run build`.
2. Publica el archivo único como `index.html`.

Tarda uno o dos minutos. El progreso se ve en la pestaña **Actions** del repositorio.

### Activarlo por primera vez

Solo se hace una vez, y lo tiene que hacer el dueño del repositorio:

1. En GitHub, entrá al repositorio → **Settings** → **Pages**.
2. En **Build and deployment** → **Source**, elegí **GitHub Actions**.
3. En la pestaña **Actions**, abrí **Publicar en GitHub Pages** y tocá **Run workflow** (o hacé cualquier push).

## Como archivo

```bash
npm run build
```

Compartí `dist/bull-army-extremos.html`. Se abre con doble clic en cualquier navegador actual.

## En otro hosting

El archivo único funciona en cualquier hosting de páginas estáticas (Netlify, Cloudflare Pages, Vercel, un servidor propio). Subilo renombrado como `index.html`.

## La documentación (GitBook)

Esta documentación vive en la carpeta `docs/` del repositorio y se publica con **GitBook**, sincronizada con GitHub:

- El índice es `docs/SUMMARY.md`; cada página es un archivo `.md`.
- Las imágenes van en `docs/.gitbook/assets/`.
- Al hacer push, GitBook actualiza el sitio solo. Si editás en GitBook, los cambios vuelven al repositorio como commits.
