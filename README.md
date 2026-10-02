# Bull Army · Extremos

Panel de trading de Bull Army sobre datos en vivo de [Hyperliquid](https://hyperliquid.xyz). Reúne en una sola página:

| Sección | Qué muestra |
|---|---|
| **Contexto** | El estado del mercado de un vistazo: sesgo long/short de BTC, volatilidad, amplitud, alts contra BTC, apalancamiento, gap de CME, flujos de ETF, ATR y horarios de movimiento. |
| **Indicador** | El indicador **Extremos** (Pine Script) ejecutado en el navegador sobre cualquier mercado de Hyperliquid, con señales, niveles de entrada/stop/TP e historial de trades. |
| **Aurora** | Velas con el oscilador **Aurora** (cinco osciladores, flujo, volumen, divergencias y Order Blocks), el **Hull Suite** de InSilico, el flujo de **Binance Futures** (delta, CVD y open interest, con flechas delta/OI y divergencias CVD sin repintar) y **VWAP** diario, semanal, mensual, trimestral y anual. |
| **Grid** | Screener de 2×2 a 5×5 con velas, **Aurora** y **Hull** en vivo por celda, activos a elección (perps, spot o HIP-3) y alertas visuales. |
| **Scanner** | Plano cartesiano con los 50 perps de más volumen: vistas Reversión (estiramiento vs giro), Rotación vs BTC (tipo RRG) y Puntaje, con colas de 5 velas, ranking alcista/bajista y confirmación de Binance para los 15 mejores. |
| **Spaghetti** | Todos los activos de Hyperliquid en un mismo gráfico para ver quién lidera y quién se queda. |
| **Liquidaciones** | Mapa de los precios de liquidación de las cuentas más grandes de Hyperliquid. |
| **Noticias** | Feed de Tree News en tiempo real y calendario macro de la semana. |

**Abrila en el navegador:** https://camilolwi-oss.github.io/bull-army-terminal/ (requiere usuario VIP). Se puede instalar como app (PWA).

**Accesos:** los administra el Admin desde `#admin`. Ver [ADMIN.md](ADMIN.md).

> Material educativo de Bull Army. **No es consejo financiero.**

## Inicio rápido

Necesitás [Node.js](https://nodejs.org) 18 o superior. No hay dependencias que instalar.

```bash
git clone https://github.com/camilolwi-oss/bull-army-terminal.git
cd bull-army-terminal
npm run dev
```

Abrí <http://localhost:5173> en el navegador.

La terminal pide login también en desarrollo: usá un acceso válido (ver [ADMIN.md](ADMIN.md)).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Sirve `src/` en <http://localhost:5173> para trabajar en el código. |
| `npm run build` | Arma `dist/`: la página con todo incrustado (CSS, JS, datos y Pine Script) más `app.dat`, el manifest, el service worker y los íconos de la PWA. |
| `npm run preview` | Hace el build y sirve el archivo de `dist/` para probarlo. |

Para usar otro puerto: `PORT=8080 npm run dev` (en PowerShell: `$env:PORT=8080; npm run dev`).

## Estructura del proyecto

```
bull-army-terminal/
├── src/                       Código fuente del panel
│   ├── index.html             Estructura de la página (todas las secciones)
│   ├── app.dat                Lista de accesos codificada (sin contraseñas ni nombres legibles)
│   ├── manifest.webmanifest   PWA · sw.js · icons/
│   ├── css/styles.css         Estilos (tema oscuro de Bull Army)
│   ├── js/
│   │   ├── loader.js          Carga datos y scripts en orden (solo en desarrollo)
│   │   ├── acceso/            Login, sesión y panel de Admin
│   │   ├── app.js             Arranque, navegación, ajustes, buscador de mercados y sección Indicador
│   │   ├── contexto/          calc.js (cálculos puros) · ui.js (interfaz y datos)
│   │   ├── aurora/            calc.js (réplica de Aurora y el Hull) · flujo.js (delta, CVD, OI, señales, VWAP)
│   │   │                      flujo-vela.js (datos de Binance e indicadores nativos de Vela) · ui.js (gráfico)
│   │   ├── grid/              ui.js (screener en grilla)
│   │   ├── scanner/           calc.js (ejes y puntaje) · ui.js (plano, ranking y datos)
│   │   ├── spaghetti/         calc.js · ui.js
│   │   ├── liquidaciones/     calc.js · source.js (fuente de datos) · ui.js
│   │   └── noticias/          ui.js (Tree News + calendario macro)
│   ├── data/                  Datos de muestra para el modo demo (sin conexión)
│   └── pine/                  extremos.pine · aurora.pine · hull-suite.pine
├── scripts/
│   ├── build.mjs              Arma dist/ (página + accesos + PWA)
│   └── serve.mjs              Servidor local sin dependencias
├── docs/                      Guía para usuarios (GitBook)
├── dev/                       Documentación técnica (no se publica)
├── .github/workflows/         Publicación automática en GitHub Pages
└── dist/                      Salida del build (no se sube al repo)
```

## Documentación

**Para usuarios** (se publica como GitBook): [`docs/`](docs/README.md) — cómo entrar, cada sección, el indicador Extremos, modo demo, preguntas frecuentes y glosario.

**Para desarrollo** (no se publica en el GitBook): [`dev/`](dev/) — [arquitectura](dev/arquitectura.md), [fuentes de datos y límites](dev/fuentes-de-datos.md), [calendario macro](dev/calendario-macro.md), [modificar el código](dev/modificar-el-codigo.md) y [publicar](dev/publicar.md). La administración de accesos está en [ADMIN.md](ADMIN.md).

## Créditos

- Hull Suite: InSilico.
- Motor de Pine Script en el navegador: [PineTS](https://github.com/LuxAlgo/PineTS) (AGPL-3.0), cargado desde CDN.
- Gráfico: [Vela](https://github.com/LuxAlgo/Vela), cargado desde CDN.
- Datos: Hyperliquid, Binance Futures, SoSoValue y Tree News.
