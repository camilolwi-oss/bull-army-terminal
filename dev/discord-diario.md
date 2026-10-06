# Mensaje diario en Discord

Todos los días a las **8:30 de Argentina** (11:30 UTC), GitHub Actions publica en el canal de análisis técnico del Discord de Bull Army:

- la **captura de la sección Contexto**;
- un **resumen** de BTC (precio, variación de 24 h, ¿long o short?, ¿operar o esperar?), de las alts contra BTC y de la amplitud del mercado;
- las **5 que más suben** y las **5 que más bajan** en 24 h entre los mercados de Hyperliquid (crypto y HIP-3) con más de US$ 2 M de volumen;
- una mención al rol **@bull**.

No depende de ninguna computadora: lo corre GitHub (`.github/workflows/discord-diario.yml` → `scripts/discord-diario.mjs`).

## Configuración (una sola vez)

### 1. Crear el webhook en Discord

1. En el servidor, pasá el mouse por el canal de análisis técnico → ⚙️ **Editar canal**.
2. **Integraciones** → **Webhooks** → **Nuevo webhook**.
3. Ponele nombre (por ejemplo *Bull Army Terminal*) y, si querés, el logo como avatar.
4. **Copiar URL del webhook**.

> **Importante:** esa URL permite publicar en el canal: tratala como una contraseña. No la pegues en el código ni en el chat; va solo en los secretos de GitHub.

### 2. Copiar el ID del rol @bull

1. Discord → **Ajustes de usuario** → **Avanzado** → activá **Modo desarrollador**.
2. **Ajustes del servidor** → **Roles** → clic derecho en **bull** → **Copiar ID del rol**.

### 3. Guardar los dos secretos en GitHub

En el repositorio: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Nombre | Valor |
|---|---|
| `DISCORD_WEBHOOK_URL` | La URL del webhook. |
| `DISCORD_ROLE_ID` | El ID del rol @bull (solo números). |

### 4. Probarlo

**Actions** → **Mensaje diario en Discord** → **Run workflow**. Publica en el momento, sin esperar a las 8:30.

## Cómo funciona

1. Arma la terminal (`npm run build`) en la máquina de GitHub.
2. Crea un **acceso temporal**, válido una hora, en una copia de `dist/`. Esa copia vive solo en esa máquina y nunca se publica, así que no hace falta guardar ninguna contraseña real.
3. Abre la terminal con Chrome sin pantalla, entra con ese acceso y espera a que Contexto termine de cargar.
4. Saca la captura del panel y lee sus veredictos ("Sesgo long", "Operar", "9 de 18"…), así el texto coincide con la imagen.
5. Pide a Hyperliquid los precios de todos los mercados para las ganadoras y perdedoras.
6. Publica el mensaje con la imagen adjunta. La imagen y el texto también quedan guardados 14 días como *artifact* del run, para revisarlos.

**Horario:** la tarea está programada a las 11:00 UTC y espera hasta las 11:30 para publicar, porque GitHub suele arrancar las tareas programadas con algunos minutos de demora. Si GitHub se demora más de media hora (pasa en días de mucha carga o caídas), el mensaje sale más tarde.

**Que no se apague:** GitHub desactiva las tareas programadas de un repositorio público después de 60 días sin actividad. El último paso del workflow las vuelve a habilitar cada día (esta y la de Pages), así ese plazo nunca se cumple.

## En desarrollo

```bash
npm run build
node scripts/discord-diario.mjs --prueba
```

Deja la imagen y el mensaje en `dist/discord/` sin publicar. Para publicar desde tu computadora, definí `DISCORD_WEBHOOK_URL` (y `DISCORD_ROLE_ID`) en el entorno. El navegador se busca solo (Chrome, Chromium o Edge); con `CHROME` podés indicar la ruta.
