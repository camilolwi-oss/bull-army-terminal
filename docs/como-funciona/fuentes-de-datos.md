# Fuentes de datos y límites

Todos los datos vienen de APIs **públicas y gratuitas**, consultadas directamente desde tu navegador.

| Fuente | Qué aporta | Usada en |
|---|---|---|
| **Hyperliquid API** (`api.hyperliquid.xyz`) | Velas, lista de mercados (perps, spot, HIP-3), precios, volumen, funding y estado de cuentas. Velas en vivo por WebSocket. | Todas las secciones |
| **Hyperliquid stats** (`stats-data.hyperliquid.xyz`) | Ranking público de cuentas por valor. | Liquidaciones |
| **Binance Futures** (`fapi.binance.com`) | Open interest, relación long/short de cuentas y compras/ventas agresivas de BTCUSDT. | Contexto |
| **SoSoValue** (`api.sosovalue.xyz`) | Flujos netos diarios de los ETF spot de BTC de EE.UU. | Contexto |
| **Tree News** (`news.treeofalpha.com`) | Noticias (últimas 200 + WebSocket en vivo). | Noticias |
| **Servidor del calendario** (propio, opcional) | Eventos macro de la semana. | Noticias |
| **jsDelivr** (`cdn.jsdelivr.net`) | Librerías Vela y PineTS. | Indicador y Aurora |

## Cada cuánto se actualiza

| Dato | Frecuencia |
|---|---|
| Gráficos del Indicador y de Aurora | En vivo (WebSocket). |
| Spaghetti, serie de precio | En vivo (WebSocket de precios). |
| Contexto | Cada 5 minutos, mientras la sección está abierta. |
| Cierres diarios de las alts (Contexto) | Se guardan 1 hora en el navegador. |
| Ranking de cuentas (Liquidaciones) | Se guarda 24 horas. |
| Posiciones (Liquidaciones) | Cuando tocás **Escanear**. |
| Noticias | En vivo (o demorado sin key). |
| Calendario macro | Cada 30 minutos. |

## Límite de Hyperliquid

Hyperliquid permite **1200 unidades de "peso" por minuto por IP**. Cada consulta pesa distinto:

| Consulta | Peso |
|---|---|
| Velas | 20 + 1 por cada 60 velas devueltas |
| Estado de una cuenta | 2 |
| Otras | 20 |

La terminal lleva la cuenta de todo lo que pide y **se frena en 1100** para dejar margen. Si se llega al límite, espera lo necesario y sigue sola. Si Hyperliquid igual responde "demasiados pedidos" (error 429), reintenta hasta 4 veces con esperas crecientes.

Por eso, un escaneo grande de Liquidaciones mientras usás Spaghetti con muchos activos puede hacer que todo vaya un poco más lento: comparten el mismo límite.

{% hint style="info" %}
El límite es **por IP**. Si abrís la terminal en varias pestañas o varias personas comparten la misma conexión, se reparten el mismo cupo.
{% endhint %}
