---
description: Dónde están los precios de liquidación de las cuentas más grandes de Hyperliquid.
---

# Liquidaciones

Muestra **a qué precios se liquidarían** las posiciones abiertas de las cuentas más grandes de Hyperliquid. Las zonas con muchas liquidaciones suelen funcionar como imanes: cuando el precio llega, las liquidaciones en cadena aceleran el movimiento.

![Sección Liquidaciones](../.gitbook/assets/liquidaciones.png)

## Cómo usarla

1. Elegí el **Mercado** (por defecto BTC). El buscador muestra el open interest de cada uno y la **cobertura**: qué parte de ese open interest está en las cuentas escaneadas.
2. Elegí cuántas **Cuentas** revisar: Top 500, 1.000, 2.000, 3.000 o 5.000.
3. Tocá **Escanear**.

{% hint style="info" %}
La primera vez descarga el ranking público de cuentas de Hyperliquid (unos 38 MB), que queda guardado 24 horas. Después revisa cuenta por cuenta, así que **Top 2.000 puede tardar unos minutos**. El resultado queda guardado y sirve para todos los mercados: podés cambiar de mercado sin volver a escanear.
{% endhint %}

## Leer el mapa

Arriba del mapa, un titular resume lo más importante: **cuánto se liquidaría si el precio cae o sube un 5 %**. Debajo, cuántas cuentas y posiciones se usaron y la cobertura del open interest.

- **Longs** (naranja): sus liquidaciones están **debajo** del precio actual. Si el precio baja hasta ahí, esos longs se liquidan y venden.
- **Shorts** (verde): sus liquidaciones están **arriba**. Si el precio sube, se liquidan y compran.
- La **altura** de cada barra es cuántos dólares se liquidarían en ese nivel.
- El área **acumulada** muestra cuánto se liquidaría en total si el precio fuera desde el actual hasta ese nivel.
- Pasá el mouse por el mapa para ver el detalle de cada nivel.

A la derecha, dos tablas con los **5 clusters más grandes** de cada lado: precio, distancia al precio actual y USD. Tocá una fila para ubicarla en el mapa.

## Sensibilidad y filtros

| Control | Qué hace |
|---|---|
| **Rango** | Qué tan lejos del precio actual mirar: ±5 % a ±50 %. |
| **Niveles** | En cuántas franjas de precio se divide el rango (60 a 300). Más niveles = más detalle. |
| **Suavizado** | Reparte cada nivel entre sus vecinos para que se vean zonas en vez de picos sueltos. |
| **Posición mín.** | Ignora posiciones más chicas que ese tamaño ($10 K a $10 M). |
| **Apalanc. mín.** | Solo posiciones con al menos ese apalancamiento (3x a 20x). |
| **Lado** | Longs y shorts, solo longs o solo shorts. |
| **Margen** | Cross, isolated o ambos. |
| **Escala** | **Lineal** o **Raíz**. La raíz achica los picos gigantes para que se vean también los niveles chicos. |

## Cómo se calcula

1. **Cuentas**: del ranking público de Hyperliquid se toman las N con mayor valor de cuenta.
2. **Posiciones**: para cada cuenta se consulta su estado (`clearinghouseState`), que incluye el **precio de liquidación** que calcula Hyperliquid para cada posición abierta.
3. **Mapa**: el rango de precio se divide en niveles y cada posición suma su tamaño en dólares al nivel de su precio de liquidación. Se descartan las posiciones que ya deberían estar liquidadas (un long con precio de liquidación por encima del precio actual, por ejemplo).
4. **Suavizado**: se aplica un filtro gaussiano sobre los niveles.
5. **Clusters**: los máximos locales del mapa suavizado, ordenados por tamaño.

Para referencia, la fórmula oficial de Hyperliquid es:

```
precio_liq = precio − lado × margen_disponible / |tamaño| / (1 − l × lado)
l = 1 / apalancamiento_de_mantenimiento
lado = 1 para long, −1 para short
```

{% hint style="warning" %}
El mapa **no incluye el 100 % de las posiciones**, solo las de las cuentas escaneadas. Por eso la cobertura importa: con cobertura baja, el mapa es una muestra, no la foto completa.
{% endhint %}
