# Bull Army · Extremos

Panel de trading de Bull Army sobre datos en vivo de [Hyperliquid](https://hyperliquid.xyz). Reúne en una sola página:

| Sección | Qué muestra |
|---|---|
| **Contexto** | El estado del mercado de un vistazo: sesgo long/short de BTC, volatilidad, amplitud, alts contra BTC, apalancamiento, gap de CME, flujos de ETF, ATR y horarios de movimiento. |
| **Indicador** | El indicador **Extremos** (Pine Script) ejecutado en el navegador sobre cualquier mercado de Hyperliquid, con señales, niveles de entrada/stop/TP e historial de trades. |
| **Spaghetti** | Todos los activos de Hyperliquid en un mismo gráfico para ver quién lidera y quién se queda. |
| **Liquidaciones** | Mapa de los precios de liquidación de las cuentas más grandes de Hyperliquid. |
| **Noticias** | Feed de Tree News en tiempo real y calendario macro de la semana. |

> Material educativo de Bull Army. **No es consejo financiero.**

## Inicio rápido

Necesitás [Node.js](https://nodejs.org) 18 o superior. No hay dependencias que instalar.

```bash
git clone https://github.com/Camilolwi/bull-army-extremos.git
cd bull-army-extremos
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
bull-army-extremos/
├── src/                       Código fuente del panel
│   ├── index.html             Estructura de la página (todas las secciones)
│   ├── css/styles.css         Estilos (tema oscuro de Bull Army)
│   ├── js/
│   │   ├── loader.js          Carga datos y scripts en orden (solo en desarrollo)
│   │   ├── app.js             Arranque, navegación, ajustes y sección Indicador
│   │   ├── contexto/          calc.js (cálculos puros) · ui.js (interfaz y datos)
│   │   ├── spaghetti/         calc.js · ui.js
│   │   ├── liquidaciones/     calc.js · source.js (fuente de datos) · ui.js
│   │   └── noticias/          ui.js (Tree News + calendario macro)
│   ├── data/                  Datos de muestra para el modo demo (sin conexión)
│   └── pine/extremos.pine     El indicador Extremos (también sirve para TradingView)
├── scripts/
│   ├── build.mjs              Genera el archivo único de dist/
│   └── serve.mjs              Servidor local sin dependencias
├── docs/                      Documentación
└── dist/                      Salida del build (no se sube al repo)
```

## Documentación

- **[Guía de uso](docs/guia-de-uso.md)**: cada sección del panel, los controles y los ajustes.
- **[Indicador Extremos](docs/indicador-extremos.md)**: la regla de trading, cómo leer el gráfico y cómo usar el Pine Script en TradingView.
- **[Desarrollo](docs/desarrollo.md)**: arquitectura, fuentes de datos, cómo modificar el código y cómo publicar.

## Créditos

- Hull Suite: InSilico.
- Motor de Pine Script en el navegador: [PineTS](https://github.com/LuxAlgo/PineTS) (AGPL-3.0), cargado desde CDN.
- Gráfico: [Vela](https://github.com/LuxAlgo/Vela), cargado desde CDN.
- Datos: Hyperliquid, Binance Futures, SoSoValue y Tree News.
