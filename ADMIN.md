# Administración de accesos

Guía para el Admin de la Bull Army Terminal. No forma parte del GitBook público.

## Entrar al panel

**https://camilolwi-oss.github.io/bull-army-terminal/#admin**

El usuario y la contraseña iniciales del Admin se entregaron aparte (archivo `ACCESO-ADMIN-bull-army.txt`, fuera del repo). Guardalos en un gestor de contraseñas, borrá ese archivo y cambiá la contraseña desde el panel cuando quieras.

## Qué se puede hacer

| Acción | Dónde |
|---|---|
| **Crear un acceso** | "Nuevo acceso": usuario, contraseña (se genera una segura; ↻ genera otra), fecha de vencimiento (por defecto fin de año) y una nota opcional. La contraseña se muestra **una sola vez**: copiala y enviala al usuario. |
| **Revocar / reactivar** | Botón en la fila del usuario. Revocar cierra su sesión en la próxima revisión (al entrar, cada 10 minutos o al volver a la pestaña). |
| **Cambiar el vencimiento** | Campo de fecha en la fila. El acceso vence a las 23:59 (hora de Argentina) de ese día. |
| **Nueva contraseña** | Genera otra y la muestra una sola vez. La anterior deja de funcionar al publicar. |
| **Eliminar** | Borra el acceso. Si solo querés cortarlo, preferí revocar. |
| **Cambiar la contraseña del Admin** | Sección "Contraseña de Admin" (mínimo 12 caracteres). |

Los estados son: **Activo**, **Vence pronto** (menos de 7 días), **Vencido** y **Revocado**.

## Publicar los cambios

Los cambios quedan pendientes (barra dorada arriba) hasta que tocás **Publicar en GitHub**. El panel guarda la lista en `src/access.json` del repo y GitHub Pages la publica: se aplica en **1–2 minutos**.

Para publicar hace falta un **token de GitHub** (una sola vez por navegador):

1. GitHub → tu foto → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Repository access**: *Only select repositories* → `bull-army-terminal`.
3. **Permissions** → **Repository permissions** → **Contents**: *Read and write*.
4. Elegí una fecha de vencimiento del token, generalo y pegalo en el panel (sección "Publicación"). Con "Recordar en este navegador" no hace falta pegarlo de nuevo.

Si no querés usar un token: **Descargar access.json** y subí ese archivo a `src/access.json` del repo desde GitHub (Add file → Upload files).

## Cómo funciona y sus límites

- Las contraseñas se guardan solo como **hash PBKDF2-SHA256 (600.000 iteraciones)** con sal por usuario. Ni el repo ni el panel pueden ver las contraseñas originales.
- Los nombres de usuario del listado van **cifrados (AES-GCM)** con una clave que sale de la contraseña del Admin: en el repo público solo se ven identificadores.
- El control de acceso corre **en el navegador**, sin servidor. Frena el uso casual y compartir el link, pero alguien con conocimientos técnicos puede saltearlo leyendo el código, que además está público en GitHub. Para una protección real hace falta servir la terminal desde un servidor que verifique la sesión (por ejemplo Cloudflare Workers).
- Sin servidor **no se puede limitar la cantidad de dispositivos** por usuario: cada navegador guarda su propia sesión.
- Si perdés la contraseña del Admin no hay forma de recuperarla: hay que regenerar `src/access.json` (y con eso los nombres del listado).
