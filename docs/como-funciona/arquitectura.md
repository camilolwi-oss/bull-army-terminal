# Arquitectura

## En una frase

La terminal es **una página web estática**: HTML, CSS y JavaScript sin frameworks, que corre entera en el navegador y le pide los datos directamente a las APIs públicas. No hay servidor propio ni base de datos.

```mermaid
flowchart LR
    U[Navegador] -->|velas, mercados, posiciones| HL[Hyperliquid API]
    U -->|open interest, long/short| BN[Binance Futures]
    U -->|flujos de ETF| SV[SoSoValue]
    U -->|noticias| TN[Tree News]
    U -->|eventos macro| CAL[Servidor del calendario<br/>opcional]
    U -->|librerías del gráfico| CDN[jsDelivr]
```

## Piezas

| Pieza | Qué hace |
|---|---|
| **Vela** | La librería de los gráficos del Indicador y de Aurora (velas, zoom, herramientas de dibujo). |
| **PineTS** | Ejecuta el Pine Script en el navegador, dentro de un *Web Worker* para no trabar la página. |
| **Módulos de sección** | Uno por sección (Contexto, Aurora, Spaghetti, Liquidaciones, Noticias). Cada uno se crea recién cuando abrís su pestaña, así la terminal arranca rápido. |
| **`app.js`** | El núcleo: arranque, detección en vivo/demo, navegación, ajustes, límite de pedidos a Hyperliquid y la sección Indicador. |

Vela y PineTS se descargan de jsDelivr en versiones fijas la primera vez que abrís el Indicador o Aurora, y las comparten las dos secciones.

## Cálculo separado de la interfaz

Cada sección tiene dos archivos:

- **`calc.js`**: fórmulas puras (medias, ATR, RSI, mapa de liquidaciones…). No tocan la página: reciben números y devuelven números.
- **`ui.js`**: pide los datos, llama a los cálculos y dibuja.

Separarlos hace que las fórmulas sean fáciles de revisar y de probar sin abrir la terminal.

## Arranque

1. Se prueba la conexión con Hyperliquid (una consulta chica con 4 segundos de límite).
2. Si responde: **modo en vivo**. Si no: **[modo demo](modo-demo.md)** con el aviso y el motivo.
3. Se abre la sección de la dirección (`#contexto` si no hay ninguna).
4. Cada vez que abrís otra sección, se crea su módulo (solo la primera vez).

## Estructura de archivos

```
bull-army-terminal/
├── src/
│   ├── index.html             La página con todas las secciones
│   ├── css/styles.css         Estilos
│   ├── js/
│   │   ├── loader.js          Carga datos y scripts (solo en desarrollo)
│   │   ├── app.js             Núcleo + Indicador
│   │   ├── contexto/          calc.js · ui.js
│   │   ├── aurora/            ui.js (Aurora + Hull Suite)
│   │   ├── spaghetti/         calc.js · ui.js
│   │   ├── liquidaciones/     calc.js · source.js · ui.js
│   │   └── noticias/          ui.js
│   ├── data/                  Datos de muestra (modo demo)
│   └── pine/                  extremos.pine · aurora.pine · hull-suite.pine
├── scripts/                   build.mjs · serve.mjs
├── docs/                      Esta documentación
└── .github/workflows/         Publicación automática en GitHub Pages
```

Cómo se arma el archivo único a partir de estas piezas: ver [Modificar el código](../desarrollo/modificar-el-codigo.md).
