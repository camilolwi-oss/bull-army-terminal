# Modo demo

Si al arrancar la terminal no logra hablar con Hyperliquid, pasa a **modo demo**: muestra datos guardados para que igual puedas recorrerla.

## Cómo te das cuenta

- La etiqueta del menú dice 🟡 **Demo · datos de muestra**.
- Arriba aparece un aviso dorado con el motivo:
  - *Hyperliquid no respondió en 4 segundos.*
  - *El navegador bloqueó la conexión a Hyperliquid.*
  - *Hyperliquid respondió con error…*

## Qué funciona en demo

| Sección | En demo |
|---|---|
| **Contexto** | Solo las tarjetas de BTC (sesgo, precio, volatilidad, operar/esperar, CME, ATR, horarios) con datos de muestra. Amplitud, alts, apalancamiento y ETF dicen *Necesita conexión en vivo*. |
| **Indicador** | Solo BTC y solo las temporalidades que tienen datos de muestra. El buscador de mercados queda desactivado. |
| **Aurora** | Solo BTC en 1H y 4H, igual que el Indicador. |
| **Spaghetti** | Una muestra fija de 72 horas. |
| **Liquidaciones** | Un escaneo de muestra. |
| **Noticias** | Depende de Tree News, no de Hyperliquid: puede funcionar igual. |

## Cómo salir

1. Revisá la causa: VPN, bloqueador de anuncios, firewall de la empresa o una red que bloquee `api.hyperliquid.xyz`.
2. Tocá **Reintentar conexión** en el aviso. Si ahora responde, la página se recarga en modo en vivo.

{% hint style="info" %}
Si ves la terminal **dentro de otra página** (una vista previa, un iframe), esa página puede estar bloqueando las conexiones externas. Abrila en su propia pestaña con la [dirección web](../primeros-pasos/abrir-la-terminal.md).
{% endhint %}

## Los datos de muestra

Están en `src/data/` y son una foto fija tomada en un momento puntual:

| Archivo | Sección |
|---|---|
| `indicador.json` | Velas de BTC por temporalidad (Indicador, Aurora y Contexto). |
| `spaghetti.json` | Series horarias de varios activos. |
| `liquidaciones.json` | Posiciones de las cuentas grandes. |

No hace falta actualizarlos para que la terminal funcione en vivo.
