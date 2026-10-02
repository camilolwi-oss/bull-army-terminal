# Modo demo

Si la terminal no logra conectarse a Hyperliquid, pasa a **modo demo**: muestra datos guardados para que igual puedas recorrerla.

## Cómo te das cuenta

- La etiqueta del menú dice 🟡 **Demo · datos de muestra**.
- Arriba aparece un aviso dorado con el motivo, por ejemplo *Hyperliquid no respondió en 4 segundos* o *El navegador bloqueó la conexión a Hyperliquid*.

## Qué funciona en demo

| Sección | En demo |
|---|---|
| **Contexto** | Solo las tarjetas de BTC, con datos de muestra. Amplitud, alts, apalancamiento y ETF dicen *Necesita conexión en vivo*. |
| **Indicador** | Solo BTC y solo algunas temporalidades. El buscador de mercados queda desactivado. |
| **Aurora** | Solo BTC en 1H y 4H. |
| **Grid** | No funciona: necesita conexión en vivo. |
| **Spaghetti** | Una muestra fija de 72 horas. |
| **Liquidaciones** | Un escaneo de muestra. |
| **Noticias** | Puede funcionar igual: no depende de Hyperliquid. |

## Cómo salir

1. Revisá la causa más común: una **VPN**, un **bloqueador de anuncios**, el firewall de la empresa o una red que bloquee Hyperliquid.
2. Tocá **Reintentar conexión** en el aviso. Si ahora responde, la terminal vuelve a modo en vivo.

{% hint style="info" %}
Si ves la terminal **dentro de otra página** (una vista previa, un marco), esa página puede estar bloqueando la conexión. Abrila en su propia pestaña: **https://camilolwi-oss.github.io/bull-army-terminal/**
{% endhint %}
