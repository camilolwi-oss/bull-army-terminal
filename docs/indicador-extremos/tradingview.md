# Usarlo en TradingView

El indicador de la terminal es un Pine Script v6 común. El mismo código funciona en TradingView, con alertas incluidas.

## Instalarlo

1. Abrí el archivo [`src/pine/extremos.pine`](https://github.com/camilolwi-oss/bull-army-terminal/blob/main/src/pine/extremos.pine) en GitHub y tocá el botón **Copy raw file** (el ícono de copiar).
2. En TradingView, abrí el **Editor de Pine** (pestaña de abajo del gráfico).
3. Borrá lo que haya, pegá el código y tocá **Guardar**.
4. Tocá **Añadir al gráfico**.

El indicador aparece como **BA Extremos** en un panel debajo del precio, con las señales dibujadas sobre las velas.

## Parámetros

En la configuración del indicador (ícono de engranaje), los parámetros están agrupados igual que [la regla](la-regla.md):

| Grupo | Qué controla |
|---|---|
| **1 · Régimen (el RSI filtra)** | Longitud del RSI, piso del rango alcista (40), techo del bajista (60), régimen desde una temporalidad superior y pullback obligatorio a la zona 50. |
| **2 · Gatillo (el SRSI cronometra)** | Parámetros del Stochastic RSI (14/14/3/3) y los extremos 0.2 / 0.8. |
| **3 · Riesgo (la estructura manda)** | Velas para el swing del stop, margen en ATR, R:R objetivo, exigir espacio hasta el extremo previo, niveles visibles, cierre por giro del Hull y stop que sigue al Hull. |
| **4 · Advertencias (no gatillos)** | Divergencias RSI y OBV, failure swings. |
| **5 · Fade de cascada (liquidaciones)** | Activación, largo mínimo de la cascada y umbrales de clímax y agotamiento. |
| **6 · Visual** | RSI en el panel, marcas de silencio y range shift, tablero y color de velas por régimen. |
| **7 · Hull Suite (InSilico)** | Mostrar y filtrar por el Hull, variante (HMA, EHMA o THMA), longitud y Hull de otra temporalidad. |

{% hint style="info" %}
Para usar **Régimen desde TF superior**, elegí una temporalidad 4 a 6 veces mayor que la del gráfico: diario para 4H o 1H, por ejemplo.
{% endhint %}

## Alertas

En TradingView: **Crear alerta** → en *Condición* elegí **BA Extremos** → elegí una de estas:

| Alerta | Cuándo salta |
|---|---|
| LONG (regla completa) | Señal long que pasó todos los filtros. |
| SHORT (regla completa) | Señal short que pasó todos los filtros. |
| FADE ▲ / FADE ▼ | Fade de una cascada bajista / alcista agotada. |
| Cascada agotada (preparar fade) | Aparece el hito de agotamiento; el fade puede venir. |
| Range shift | El RSI cambió de régimen. |
| Absorción | Se marcó absorción. |
| Trade cerrado (TP, SL o Hull) | Se cerró el trade abierto. |
| Hull gira alcista / bajista | El Hull cambió de color. |
| Divergencia RSI / OBV | Nueva divergencia. |
| Divergencia RSI+OBV (confluencia) | Divergencia de RSI y de OBV en la misma zona. |

Elegí **Una vez por cierre de barra** para que la alerta coincida con las señales confirmadas.
