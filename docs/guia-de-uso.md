# Guía de uso

Cómo usar cada sección del panel. Para instalarlo y abrirlo, mirá el [README](../README.md).

## Navegación

El menú lateral lleva a las cinco secciones. Cada una tiene su propia dirección, así que podés guardarla o compartirla:

| Sección | Dirección |
|---|---|
| Contexto (inicio) | `#contexto` |
| Indicador | `#indicador` |
| Spaghetti | `#spaghetti` |
| Liquidaciones | `#liquidaciones` |
| Noticias | `#noticias` |

- **Contraer menú** deja solo los íconos. En el celular el menú se abre con el botón ☰ de arriba.
- Abajo del menú hay un indicador de estado:
  - **En vivo · Hyperliquid** (verde): conectado, datos reales.
  - **Demo · datos de muestra** (dorado): no pudo conectarse y muestra datos guardados.

### Modo demo

Si el panel no logra hablar con Hyperliquid, aparece un aviso dorado arriba y usa los datos de muestra de `src/data/`. Las causas más comunes:

- Una VPN, un bloqueador de anuncios o un firewall que corta las conexiones.
- Estar viendo el panel dentro de una vista previa que bloquea conexiones externas.

Arreglá la conexión y tocá **Reintentar conexión**.

## Contexto

Tablero con el estado del mercado. Cada tarjeta tiene un botón **?** que explica cómo se calcula.

| Tarjeta | Qué responde |
|---|---|
| **¿Long o short?** | Compara el precio de BTC con sus medias de 50 y 200 días. Arriba de ambas: sesgo long. Abajo: sesgo short. Entre medio: neutral. Muestra qué hizo BTC 5 días después en ese mismo estado desde 2019. |
| **Bitcoin** | Precio, cambio de 5 días y volatilidad (calma / normal / agitada). El gráfico cambia entre 7, 30 y 90 días. |
| **¿Operar o esperar?** | Cuánto se mueve BTC hoy y en esta hora contra lo normal, y el horario fuerte del día (UTC). |
| **Amplitud · 24 h** | Cuántos perps con más volumen suben y cuántos bajan en 24 h. |
| **Alts contra BTC · 14 d** | Qué parte de las monedas rinde más que BTC en 14 días, más ETH/BTC. |
| **Apalancamiento y posicionamiento** | Open interest, cuentas long/short y compras/ventas agresivas en futuros de BTC de Binance, más el funding de BTC en Hyperliquid. |
| **Gap de CME** | Aproximación del gap entre el cierre del viernes y la reapertura del domingo de CME, con precios de Hyperliquid. |
| **Flujos de ETF de BTC · 7 d** | Entradas netas diarias de los ETF spot de EE.UU. (SoSoValue). |
| **ATR** | Cuánto se mueve BTC en una vela típica (1 h, 4 h y 1 día) y qué parte del rango diario ya se usó hoy. |
| **Cuándo se mueve · UTC** | Rango medio por hora del día en los últimos 30 días. |

## Indicador

Ejecuta el indicador **Extremos** (el mismo Pine Script de TradingView) en el navegador. La explicación completa de la estrategia y las señales está en **[Indicador Extremos](indicador-extremos.md)**.

**Controles:**

- **Mercado**: elegí cualquier mercado de Hyperliquid. Buscá por nombre y filtrá entre *Perps*, *Spot* y *HIP-3*. La elección se recuerda.
- **Temporalidad**: de 1 minuto a 1 mes.
- **Niveles**: mostrar los niveles de entrada/stop/TP de la **Última** señal, de **Todas** o de **Ninguna**.
- **Interruptores**:

| Interruptor | Qué hace |
|---|---|
| Fade de cascada | Muestra las señales de fade después de una cascada de liquidaciones agotada. |
| Exigir R:R | Descarta señales donde el extremo previo está más cerca que el objetivo. |
| Régimen diario | Toma el régimen del RSI desde la temporalidad diaria. |
| Hull Suite | Dibuja el Hull Suite sobre el precio. |
| Filtro Hull | Solo permite señales a favor del Hull. |
| Stop sigue al Hull | El stop acompaña al Hull en vez de quedar fijo. |
| Div. RSI / Div. OBV | Muestra las divergencias de RSI y OBV. |

El cálculo tarda unos segundos (dice *Ejecutando el Pine Script…*). Hyperliquid entrega hasta ~5000 velas por temporalidad y las señales se confirman al cierre de cada vela.

## Spaghetti

Todos los activos en un mismo gráfico, normalizados para comparar.

- **Serie**: precio o volumen.
- **Referencia**: absoluta, relativa al mercado o relativa a BTC.
- **Activos**: elegí a mano o usá los atajos Top 10/20/30/50, filtrando por Perps, HIP-3 o Spot.
- **Ventana** (de 6 horas a 1 año) y **Vela** (de 1 minuto a 1 día).
- **Fórmula**: cambio acumulado, cambio acumulado %, cambio o cambio %, con una métrica opcional encima (RSI, SMA, EMA o percentil móvil) y su longitud.
- **Top 5 / Bottom 5**: resalta los que más y menos rinden.
- **Leyenda**: tabla con el valor de cada activo; tocá un nombre para resaltarlo o destildalo para ocultarlo.
- **Replay**: reproduce la ventana vela por vela con el control deslizante.
- **Actualizar**: vuelve a pedir los datos.

Pasá el mouse sobre el gráfico para ver los valores de cada activo en ese momento.

## Liquidaciones

Dónde están los precios de liquidación de las cuentas más grandes de Hyperliquid.

1. Elegí el **Mercado** (BTC por defecto).
2. Elegí cuántas **Cuentas** revisar (Top 500 a Top 5.000). Más cuentas tardan más.
3. Tocá **Escanear**.

El mapa muestra los longs (sus liquidaciones quedan **debajo** del precio) y los shorts (**arriba**). Las tablas de la derecha listan los clusters más grandes de cada lado; tocá una fila para ubicarla en el mapa.

**Sensibilidad y filtros:** rango de precio (±5 % a ±50 %), cantidad de niveles, suavizado, tamaño mínimo de posición, apalancamiento mínimo, lado (longs, shorts o ambos), tipo de margen (cross/isolated) y escala (lineal o raíz).

> El escaneo consulta cuenta por cuenta desde tu navegador, así que no cubre el 100 % de las posiciones: solo las de las cuentas más grandes. La cobertura aparece junto al mercado.

## Noticias

- **Feed** de [Tree News](https://news.treeofalpha.com/) filtrable por *Todas*, *Con moneda*, *X / Twitter* y *Medios*, con buscador. Las noticias nuevas aparecen resaltadas.
- **Macro esta semana**: cuenta regresiva al próximo dato fuerte de EE.UU. y la lista de eventos del día.

Sin configurar nada, el feed funciona **demorado**. Para tenerlo en tiempo real y ver el calendario, cargá los ajustes.

## Ajustes

Botón **Ajustes** al pie del menú. Los valores se guardan **solo en tu navegador** (no se escriben en ningún archivo ni se suben al repo).

| Ajuste | Para qué | Cómo conseguirlo |
|---|---|---|
| **API key de Tree News** | Feed de noticias en tiempo real. | Gratis: entrá con Discord en [news.treeofalpha.com](https://news.treeofalpha.com/) y copiá tu key. |
| **Servidor del calendario** | Calendario macro. | La dirección de tu Cloudflare Worker. Ver [Desarrollo › Calendario macro](desarrollo.md#calendario-macro). |
