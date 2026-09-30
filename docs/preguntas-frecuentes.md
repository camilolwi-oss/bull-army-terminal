# Preguntas frecuentes

## Olvidé mi contraseña

Pedile a Bull Army una nueva: el Admin genera otra desde el panel de accesos. Las contraseñas no se pueden recuperar porque no se guardan en ningún lado, solo una huella cifrada.

## ¿Puedo usar mi acceso en varios dispositivos?

Sí: entrás con el mismo usuario en cada navegador. Cada uno guarda su sesión.

## ¿Necesito cuenta en Hyperliquid?

No. La terminal solo **lee** datos públicos. No se conecta a ninguna billetera ni puede operar.

## ¿Es gratis?

La terminal es exclusiva para miembros VIP de Bull Army. Las fuentes de datos que usa son públicas y la key de Tree News es gratis.

## Dice "Demo · datos de muestra". ¿Qué hago?

La terminal no pudo conectarse a Hyperliquid. Probá sin VPN ni bloqueador de anuncios, desde otra red, o abrila en su propia pestaña. Después tocá **Reintentar conexión**. Ver [Modo demo](como-funciona/modo-demo.md).

## El Indicador se queda en "Ejecutando el Pine Script…"

Es normal que tarde entre 5 y 15 segundos. Si pasa mucho más:

- Verificá que la página pueda descargar las librerías de `cdn.jsdelivr.net` (algunos bloqueadores lo impiden).
- Recargá la página.
- Probá una temporalidad más alta (menos velas que calcular en temporalidades con mucha historia).

## ¿Las señales de la terminal son las mismas que en TradingView?

El código del indicador es el mismo. Pueden aparecer diferencias chicas porque los **datos** son distintos: la terminal usa velas de Hyperliquid y en TradingView depende del exchange que elijas. Para comparar, usá el mismo mercado de Hyperliquid en ambos.

## Una señal apareció y después desapareció

Las señales se confirman **al cierre de la vela**. Mientras la vela está abierta, la señal puede aparecer y desaparecer. Operá solo señales de velas cerradas.

## ¿Por qué "Régimen diario" está desactivado?

En **6H** y **3D** no está disponible en la terminal (sí en TradingView). Ver [Indicador](secciones/indicador.md).

## El escaneo de liquidaciones tarda mucho

Revisa cuenta por cuenta respetando el límite de Hyperliquid. Top 500 es rápido; Top 5.000 puede tardar bastante. El resultado queda guardado, así que no hace falta repetirlo al cambiar de mercado. Ver [Fuentes de datos y límites](como-funciona/fuentes-de-datos.md).

## ¿Mi key de Tree News queda guardada en algún servidor?

No. Se guarda solo en tu navegador y se envía únicamente a Tree News. Ver [Ajustes](primeros-pasos/ajustes.md).

## ¿Cómo borro todo lo que guardó la terminal?

Borrá los datos del sitio en tu navegador (en Chrome: ícono del candado junto a la dirección → **Configuración del sitio** → **Borrar datos**). Se pierden los ajustes, el último mercado elegido y el último escaneo de liquidaciones.

## El Grid va lento o tarda en cargar

En 5×5 la terminal pide velas de 25 mercados respetando el límite de Hyperliquid, que comparte con las otras secciones. Si además estás escaneando liquidaciones o usando Spaghetti con muchos activos, la carga tarda más. Probá un grid más chico o esperá unos segundos.

## ¿Funciona en el celular?

Sí. El menú se abre con el botón **☰**. Los gráficos del Indicador, Aurora, el Grid y Spaghetti se aprovechan mejor en una pantalla grande.
