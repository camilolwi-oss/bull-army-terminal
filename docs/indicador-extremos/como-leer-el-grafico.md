# Cómo leer el gráfico

![El indicador Extremos sobre BTC](../.gitbook/assets/indicador.png)

El gráfico tiene dos partes:

- **Arriba, el precio**: velas, Hull Suite, señales y niveles de cada trade.
- **Abajo, el panel**: el SRSI (%K y %D, de 0 a 100), el RSI y un fondo de color según el régimen.

## Señales

| Marca | Significado |
|---|---|
| **LONG ★** | Hull y RSI alcistas, pullback a la zona 40–50 y cruce %K/%D debajo de 0.2. |
| **SHORT ★** | Hull y RSI bajistas, rebote a la zona 50–60 y cruce %K/%D encima de 0.8. |
| **★★ → ★★★★** | Una estrella extra por cada divergencia RSI, divergencia OBV y failure swing recientes. |
| **FADE ▲▼** | Cascada agotada: clímax de volumen, vela contraria con volumen bajo y recién ahí el cruce. |

## Trades

| Marca | Significado |
|---|---|
| **TP · SL · Hull** | Entrada, stop y objetivo avanzan con el trade y se cierran en el TP, en el SL o cuando gira el Hull, con el resultado en R. |
| **Historial** | El tablero suma los trades cerrados del gráfico: cuántos por TP, por SL y por Hull, y el total en R. |
| **sin R:R** | Gatillo válido, pero el extremo previo está más cerca que el objetivo. No hay trade. |

## Tendencia y régimen

| Marca | Significado |
|---|---|
| **HULL** | Hull Suite de InSilico. Verde: solo compras. Rojo: solo ventas. |
| **RANGE SHIFT** | El RSI rompió 60 o perdió 40: cambió el régimen y con él la dirección permitida. |
| **ABSORCIÓN** | Tres o más señales contrarias que el precio se tragó sin girar. Esperá continuación. |

## Advertencias (no son gatillos)

| Marca | Significado |
|---|---|
| **Div− · FS▼** | Divergencia del RSI y failure swing de Wilder. |
| **OBV+ · OBV−** | El precio marca un extremo nuevo y el volumen acumulado no lo acompaña (línea punteada). |
| **RSI·OBV** | Confluencia: momentum y volumen divergen en la misma zona (en dorado). |
| **CLÍMAX · agotada** | Los dos hitos de una cascada que habilitan el fade. |

## El tablero

Abajo a la izquierda del precio hay un tablero con el estado actual de la regla, fila por fila:

| Fila | Qué dice |
|---|---|
| **Régimen** | Alcista, bajista o neutral, y qué lado se permite. |
| **RSI** · **SRSI %K** | Valores actuales. |
| **Pullback** | Si el RSI ya volvió a la zona del 50. |
| **Cascada** | Si hay un clímax en curso y si falta el agotamiento. |
| **Última señal** | La última señal emitida. |
| **Divergencias** | Las últimas divergencias RSI y OBV, y hace cuántas velas. |
| **Hull** | Dirección del Hull y qué lado permite. |
| **Trade** | El trade abierto, o *Sin trade*. |
| **Historial** | Trades cerrados: cuántos por TP, SL y Hull, y el total en R. |

Es la forma más rápida de saber **qué le falta** a la regla para dar una señal.

## En el panel inferior

| Marca | Significado |
|---|---|
| **0.2 – 0.8** | Las líneas de los extremos. Ningún cruce entre ellas genera señal. |
| **×** | Cruce del SRSI contra el régimen. Es silencio, no una señal. |
| **Fondo de color** | El régimen del RSI: alcista, bajista o neutral. |

{% hint style="info" %}
Las señales se confirman **al cierre de la vela**. Una marca que aparece en la vela en curso puede desaparecer si la vela cierra distinto.
{% endhint %}
