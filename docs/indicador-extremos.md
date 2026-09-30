# Indicador Extremos

> **El RSI y el Hull filtran, el SRSI cronometra.** Señales de reversión solo desde los extremos y a favor de la tendencia.

El código está en [`src/pine/extremos.pine`](../src/pine/extremos.pine) (Pine Script v6). El panel lo ejecuta en el navegador con PineTS, y el mismo archivo se puede pegar en TradingView.

## La regla en cuatro pasos

1. **Tendencia con el Hull y el RSI.** El Hull tiene que apuntar a favor y el RSI vivir en su rango: sobre 60 manda el lado largo, bajo 40 el corto.
2. **Esperar el pullback.** No se persigue el precio: el RSI tiene que volver a la zona del 50.
3. **Gatillo con el SRSI.** Cruce %K/%D nacido dentro del extremo que apunta a favor: bajo 0.2 para compras, sobre 0.8 para ventas.
4. **Riesgo estructural.** Stop en el swing, objetivo a 2R. Si la geometría no da 2R, no hay trade. Si el Hull gira en contra, el trade se cierra.

**Regla de hierro:** el SRSI nunca opera contra el Hull ni contra el régimen del RSI. Con el filtro activo, el fade de cascada también respeta el Hull.

## Cómo leer el gráfico

| Marca | Significado |
|---|---|
| **LONG ★** | Hull y RSI alcistas, pullback a la zona 40–50 y cruce %K/%D debajo de 0.2. |
| **SHORT ★** | Hull y RSI bajistas, rebote a la zona 50–60 y cruce %K/%D encima de 0.8. |
| **★★ → ★★★★** | Una estrella extra por cada divergencia RSI, divergencia OBV y failure swing recientes. |
| **HULL** | Hull Suite de InSilico. Verde: solo compras. Rojo: solo ventas. |
| **TP · SL · Hull** | Entrada, stop y objetivo avanzan con el trade y se cierran en el TP, en el SL o cuando gira el Hull, con el resultado en R. |
| **Historial** | El tablero suma los trades cerrados: cuántos por TP, SL y Hull, y el total en R. |
| **0.2 – 0.8** | Ningún cruce en el medio del oscilador genera señal: solo los extremos. |
| **FADE ▲▼** | Cascada agotada: clímax de volumen, vela contraria con volumen bajo y recién ahí el cruce. |
| **CLÍMAX · agotada** | Los dos hitos de la cascada que habilitan el fade. |
| **sin R:R** | Gatillo válido, pero el extremo previo está más cerca que el objetivo. No hay trade. |
| **ABSORCIÓN** | Tres o más señales contrarias que el precio se tragó sin girar. Esperá continuación. |
| **RANGE SHIFT** | El RSI rompió 60 o perdió 40: cambió el régimen y con él la dirección permitida. |
| **× en el panel** | Cruce del SRSI contra el régimen. Es silencio, no una señal. |
| **Div− · FS▼** | Divergencia del RSI y failure swing de Wilder. Advertencias, no gatillos. |
| **OBV+ · OBV−** | El precio marca un extremo nuevo y el volumen acumulado no lo acompaña (línea punteada). |
| **RSI·OBV** | Confluencia: momentum y volumen divergen en la misma zona (en dorado). |

## Usarlo en TradingView

1. Abrí [`src/pine/extremos.pine`](../src/pine/extremos.pine) y copiá todo el contenido.
2. En TradingView, abrí el **Editor de Pine** (abajo del gráfico).
3. Pegá el código reemplazando lo que haya y tocá **Guardar**.
4. Tocá **Añadir al gráfico**.

### Parámetros

Los ajustes del indicador están agrupados igual que la regla:

| Grupo | Qué controla |
|---|---|
| 1 · Régimen (el RSI filtra) | Longitud del RSI, piso del rango alcista (40), techo del bajista (60), régimen desde temporalidad superior y pullback obligatorio. |
| 2 · Gatillo (el SRSI cronometra) | Parámetros del estocástico RSI (14/14/3/3) y los extremos 0.2 / 0.8. |
| 3 · Riesgo (la estructura manda) | Velas para el swing del stop, buffer en ATR, R:R objetivo, exigir espacio hasta el extremo previo, niveles visibles, cierre por giro del Hull y stop que sigue al Hull. |
| 4 · Advertencias (no gatillos) | Divergencias RSI y OBV, failure swings. |
| 5 · Fade de cascada (liquidaciones) | Activación, largo mínimo de la cascada, umbrales de clímax (volumen y rango) y de agotamiento. |
| 6 · Visual | RSI en el panel, marcas de silencio y range shift, tablero y color de velas por régimen. |
| 7 · Hull Suite (InSilico) | Mostrar y filtrar por el Hull, variante (HMA/EHMA/THMA), longitud y Hull de otra temporalidad. |

### Alertas

En TradingView: **Crear alerta** → condición **BA Extremos** → elegí una de estas:

- LONG (regla completa) · SHORT (regla completa)
- FADE ▲ (cascada bajista agotada) · FADE ▼ (cascada alcista agotada)
- Cascada agotada (preparar fade)
- Range shift · Absorción
- Trade cerrado (TP, SL o Hull)
- Hull gira alcista · Hull gira bajista
- Divergencia RSI · Divergencia OBV · Divergencia RSI+OBV (confluencia)

## Si cambiás el Pine Script

El panel lee `src/pine/extremos.pine` directamente. Después de editarlo:

1. `npm run dev` y revisá la sección **Indicador** (mirá también la consola del navegador).
2. `npm run build` para regenerar el archivo único.

PineTS no soporta el 100 % de Pine Script: si agregás funciones nuevas, verificá que el panel las siga ejecutando además de TradingView.
