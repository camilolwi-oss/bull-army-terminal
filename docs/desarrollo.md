# Desarrollo

Cómo está armado el panel y cómo modificarlo.

## Principios

- **Sin dependencias ni framework.** HTML, CSS y JavaScript plano. Node solo se usa para el servidor local y el build.
- **Todo corre en el navegador.** El panel consulta las APIs públicas directamente; no hay backend propio (salvo el calendario opcional).
- **Un archivo para distribuir.** El build incrusta todo en `dist/bull-army-extremos.html`, que se abre con doble clic o se publica en cualquier hosting.

## Cómo se carga la página

En desarrollo (`npm run dev`), `src/index.html` tiene dos tipos de marcadores al final:

```html
<!-- Datos: el contenido se lee de data-src -->
<script type="application/json" id="snap" data-src="data/indicador.json"></script>

<!-- Scripts: se ejecutan en este orden -->
<script type="text/plain" data-app="js/app.js"></script>

<script src="js/loader.js"></script>
```

`js/loader.js` descarga los datos, los pone dentro de su `<script>` y después ejecuta los scripts de la app **en orden**. Así el código de la app lee todo con `document.getElementById(...)` y funciona igual en desarrollo y en el archivo único.

En el build (`scripts/build.mjs`), cada marcador se reemplaza por su contenido real y `loader.js` desaparece.

> Por eso `src/index.html` no se puede abrir con doble clic: el navegador no deja leer archivos desde `file://`. Usá `npm run dev` o el archivo de `dist/`.

## Módulos

Cada sección se divide en **cálculo puro** (`calc.js`, sin DOM, fácil de probar) e **interfaz** (`ui.js`). Las interfaces se crean recién cuando se abre su pestaña.

| Archivo | Expone | Responsabilidad |
|---|---|---|
| `js/app.js` | — | Arranque, detección en vivo/demo, navegación por `#hash`, ajustes y la sección Indicador (PineTS + Vela). |
| `js/contexto/calc.js` | funciones de cálculo | Medias, regímenes, volatilidad, amplitud, ATR, gaps, estadísticas. |
| `js/contexto/ui.js` | `window.createContext(env)` | Tarjetas del tablero Contexto. |
| `js/spaghetti/calc.js` | funciones de cálculo | Fórmulas y métricas de las series. |
| `js/spaghetti/ui.js` | `window.createSpaghetti(env)` | Gráfico en canvas, leyenda y replay. |
| `js/liquidaciones/calc.js` | funciones de cálculo | Precio de liquidación (fórmula de Hyperliquid) y agrupación en niveles. |
| `js/liquidaciones/source.js` | `window.createLiqSource(env)` | De dónde salen las posiciones (fuente intercambiable). |
| `js/liquidaciones/ui.js` | `window.createLiqMap(env)` | Mapa, filtros y tablas de clusters. |
| `js/noticias/ui.js` | `window.createNews(env)` | Feed de Tree News y calendario macro. |

El orden de los `data-app` en `src/index.html` importa: los `calc.js` van antes que sus `ui.js`, y `app.js` al final.

### Agregar un archivo JS nuevo

1. Crealo en `src/js/<sección>/`.
2. Agregá su marcador en `src/index.html`, en el lugar correcto del orden:
   ```html
   <script type="text/plain" data-app="js/<sección>/nuevo.js"></script>
   ```
3. `npm run build` lo incrusta solo.

## Fuentes de datos

| Fuente | Uso | Dirección |
|---|---|---|
| Hyperliquid API | Velas, mercados, posiciones, funding | `https://api.hyperliquid.xyz/info` |
| Hyperliquid stats | Ranking de cuentas (liquidaciones) | `https://stats-data.hyperliquid.xyz/Mainnet/leaderboard` |
| Binance Futures | Open interest, long/short, taker buy/sell | `https://fapi.binance.com/futures/data/` |
| SoSoValue | Flujos de ETF de BTC | `https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart` |
| Tree News | Noticias (REST + WebSocket) | `https://news.treeofalpha.com/api/news` · `wss://news.treeofalpha.com/ws` |
| jsDelivr | Librerías Vela y PineTS | `https://cdn.jsdelivr.net/npm/@luxalgo/...` |

## Datos de muestra (modo demo)

Si al arrancar no hay conexión con Hyperliquid, el panel usa:

| Archivo | Sección |
|---|---|
| `src/data/indicador.json` | Velas de BTC por temporalidad para el Indicador y Contexto. |
| `src/data/spaghetti.json` | Series horarias para Spaghetti. |
| `src/data/liquidaciones.json` | Posiciones de ejemplo para el mapa de liquidaciones. |

Son una foto fija; no hace falta actualizarlos para que el panel funcione en vivo.

## Calendario macro

La sección Noticias lee el calendario desde un servidor propio (por ejemplo, un Cloudflare Worker), cuya dirección se carga en **Ajustes**. El servidor tiene que responder un JSON así:

```json
{
  "events": [
    {
      "title": "CPI m/m",
      "country": "USD",
      "date": "2026-10-14T08:30:00-04:00",
      "impact": "High",
      "forecast": "0.3%",
      "previous": "0.4%"
    }
  ]
}
```

- El panel muestra solo eventos de `country: "USD"` con `impact` `"High"` o `"Medium"`.
- `date` tiene que ser una fecha que `new Date()` entienda.
- El servidor tiene que permitir CORS (`Access-Control-Allow-Origin: *`).
- El panel lo vuelve a pedir cada 30 minutos.

El código del servidor no está en este repositorio.

## Publicar

### Como archivo

`npm run build` y compartí `dist/bull-army-extremos.html`. Se abre con doble clic en Chrome, Safari o Firefox.

### En la web

Subí el contenido de `dist/` (renombrando el archivo a `index.html`) a cualquier hosting estático: GitHub Pages, Netlify, Cloudflare Pages, etc.

## Antes de subir cambios

- [ ] `npm run dev`: las cinco secciones cargan y la consola no muestra errores.
- [ ] El indicador de estado dice **En vivo · Hyperliquid**.
- [ ] `npm run build` termina sin errores.
- [ ] `npm run preview`: el archivo de `dist/` funciona igual.
