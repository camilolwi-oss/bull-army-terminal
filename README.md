# Bull Army · Extremos

Panel de trading de Bull Army sobre datos en vivo de [Hyperliquid](https://hyperliquid.xyz). Reúne en una sola página:

| Sección | Qué muestra |
|---|---|
| **Contexto** | El estado del mercado de un vistazo: sesgo long/short de BTC, volatilidad, amplitud, alts contra BTC, apalancamiento, gap de CME, flujos de ETF, ATR y horarios de movimiento. |
| **Indicador** | El indicador **Extremos** (Pine Script) ejecutado en el navegador sobre cualquier mercado de Hyperliquid, con señales, niveles de entrada/stop/TP e historial de trades. |
| **Aurora** | Velas con el oscilador **Aurora** (cinco osciladores, flujo, volumen, divergencias y Order Blocks) y el **Hull Suite** de InSilico. |
| **Spaghetti** | Todos los activos de Hyperliquid en un mismo gráfico para ver quién lidera y quién se queda. |
| **Liquidaciones** | Mapa de los precios de liquidación de las cuentas más grandes de Hyperliquid. |
| **Noticias** | Feed de Tree News en tiempo real y calendario macro de la semana. |

**Abrila en el navegador:** https://camilolwi-oss.github.io/bull-army-terminal/

> Material educativo de Bull Army. **No es consejo financiero.**

## Inicio rápido

Necesitás [Node.js](https://nodejs.org) 18 o superior. No hay dependencias que instalar.

```bash
git clone https://github.com/camilolwi-oss/bull-army-terminal.git
cd bull-army-terminal
npm run dev
```

Abrí <http://localhost:5173> en el navegador.

¿Querés un solo archivo para abrir con doble clic o compartir?

```bash
npm run build
```

Genera `dist/bull-army-extremos.html`, que funciona sin servidor.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Sirve `src/` en <http://localhost:5173> para trabajar en el código. |
| `npm run build` | Arma `dist/bull-army-extremos.html` con todo incrustado (CSS, JS, datos y Pine Script). |
| `npm run preview` | Hace el build y sirve el archivo de `dist/` para probarlo. |

Para usar otro puerto: `PORT=8080 npm run dev` (en PowerShell: `$env:PORT=8080; npm run dev`).

## Estructura del proyecto

```
bull-army-terminal/
├── src/                       Código fuente del panel
│   ├── index.html             Estructura de la página (todas las secciones)
│   ├── css/styles.css         Estilos (tema oscuro de Bull Army)
│   ├── js/
│   │   ├── loader.js          Carga datos y scripts en orden (solo en desarrollo)
│   │   ├── app.js             Arranque, navegación, ajustes, buscador de mercados y sección Indicador
│   │   ├── contexto/          calc.js (cálculos puros) · ui.js (interfaz y datos)
│   │   ├── aurora/            ui.js (gráfico con Aurora y el Hull Suite)
│   │   ├── spaghetti/         calc.js · ui.js
│   │   ├── liquidaciones/     calc.js · source.js (fuente de datos) · ui.js
│   │   └── noticias/          ui.js (Tree News + calendario macro)
│   ├── data/                  Datos de muestra para el modo demo (sin conexión)
│   └── pine/                  extremos.pine · aurora.pine · hull-suite.pine
├── scripts/
│   ├── build.mjs              Genera el archivo único de dist/
│   └── serve.mjs              Servidor local sin dependencias
├── docs/                      Documentación (GitBook)
├── .github/workflows/         Publicación automática en GitHub Pages
└── dist/                      Salida del build (no se sube al repo)
```

## Documentación

La guía completa, en español, está en [`docs/`](docs/README.md) y se publica como GitBook:

- **Primeros pasos**: [abrir la terminal](docs/primeros-pasos/abrir-la-terminal.md), [la interfaz](docs/primeros-pasos/la-interfaz.md), [ajustes](docs/primeros-pasos/ajustes.md).
- **Secciones**: [Contexto](docs/secciones/contexto.md), [Indicador](docs/secciones/indicador.md), [Aurora](docs/secciones/aurora.md), [Spaghetti](docs/secciones/spaghetti.md), [Liquidaciones](docs/secciones/liquidaciones.md), [Noticias](docs/secciones/noticias.md).
- **Indicador Extremos**: [la regla](docs/indicador-extremos/la-regla.md), [cómo leer el gráfico](docs/indicador-extremos/como-leer-el-grafico.md), [TradingView](docs/indicador-extremos/tradingview.md).
- **Cómo funciona**: [arquitectura](docs/como-funciona/arquitectura.md), [fuentes de datos](docs/como-funciona/fuentes-de-datos.md), [modo demo](docs/como-funciona/modo-demo.md).
- **Desarrollo**: [modificar el código](docs/desarrollo/modificar-el-codigo.md), [publicar](docs/desarrollo/publicar.md).

## Créditos

- Hull Suite: InSilico.
- Motor de Pine Script en el navegador: [PineTS](https://github.com/LuxAlgo/PineTS) (AGPL-3.0), cargado desde CDN.
- Gráfico: [Vela](https://github.com/LuxAlgo/Vela), cargado desde CDN.
- Datos: Hyperliquid, Binance Futures, SoSoValue y Tree News.
