---
description: El RSI y el Hull filtran, el SRSI cronometra.
---

# La regla en cuatro pasos

> **El RSI y el Hull filtran, el SRSI cronometra.** Señales de reversión solo desde los extremos y a favor de la tendencia.

El indicador **Extremos** no busca techos ni pisos: busca **retrocesos dentro de una tendencia** y entra cuando el retroceso se agota. Cada señal tiene que pasar cuatro filtros, en orden.

## 1. Tendencia con el Hull y el RSI

El **Hull Suite** tiene que apuntar a favor y el **RSI** tiene que vivir en su rango de tendencia (según Andrew Cardwell):

| Régimen | RSI | Lado permitido |
|---|---|---|
| Alcista | Vive entre 40 y 80; manda por encima de 60 | Solo **long** |
| Bajista | Vive entre 20 y 60; manda por debajo de 40 | Solo **short** |

Cuando el RSI rompe 60 hacia arriba o pierde 40 hacia abajo, el régimen cambia (**RANGE SHIFT**) y con él la dirección permitida.

## 2. Esperar el pullback

No se persigue el precio. El RSI tiene que **volver a la zona del 50**:

- En un long: bajar a la zona **40–50**.
- En un short: subir a la zona **50–60**.

## 3. Gatillo con el SRSI

El **Stochastic RSI** (14/14/3/3) marca el momento. La señal nace cuando %K cruza a %D **dentro del extremo** y en la dirección de la tendencia:

- **Long**: cruce hacia arriba **por debajo de 0.2**.
- **Short**: cruce hacia abajo **por encima de 0.8**.

Ningún cruce en la zona media (entre 0.2 y 0.8) genera señal.

## 4. Riesgo estructural

- **Stop** en el último swing (con un pequeño margen en ATR).
- **Objetivo** a **2R** (dos veces el riesgo).
- Si el extremo previo está más cerca que el objetivo, la geometría no da 2R: **no hay trade** (se marca *sin R:R*).
- Si el **Hull gira en contra**, el trade se cierra aunque no haya tocado stop ni objetivo.

## La regla de hierro

{% hint style="danger" %}
El SRSI **nunca** opera contra el Hull ni contra el régimen del RSI. Un cruce del SRSI contra el régimen es **silencio**, no una señal (se marca con una × en el panel).

Con el filtro Hull activo, el fade de cascada también respeta el Hull.
{% endhint %}

## Confirmaciones: las estrellas

Una señal válida arranca con **★**. Suma una estrella por cada confirmación reciente:

- **Divergencia del RSI** a favor.
- **Divergencia del OBV** (el volumen acumulado) a favor.
- **Failure swing** de Wilder a favor.

Una señal **★★★★** tiene las tres confirmaciones.

## Fade de cascada

Una excepción controlada: después de una **cascada de liquidaciones**, el indicador puede buscar el rebote (FADE ▲ o FADE ▼). Solo lo hace cuando la cascada está **agotada**:

1. **Clímax**: una vela con volumen y rango muy por encima de lo normal.
2. **Agotamiento**: una vela contraria con **volumen bajo**.
3. Recién ahí, el cruce del SRSI.

## Absorción

Si aparecen **tres o más señales contrarias** que el precio se tragó sin girar, se marca **ABSORCIÓN**: el mercado está absorbiendo la presión contraria. Esperá continuación de la tendencia, no reversión.
