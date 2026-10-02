# Calendario macro

El panel **Macro esta semana** de la sección [Noticias](../docs/secciones/noticias.md) muestra los datos económicos de la semana. Funciona solo: no hace falta configurar nada ni tener un servidor propio.

## De dónde sale

- La fuente es el calendario de **ForexFactory**, que es gratis y no pide key.
- ForexFactory no deja que un navegador lo consulte directamente (no permite CORS). Por eso lo descarga **GitHub Actions**: la misma tarea que publica la terminal corre **cada hora**, baja el calendario de la semana y lo publica como `calendario.json`, junto a la terminal.
- La terminal lee ese archivo al abrir Noticias y lo vuelve a leer cada 30 minutos. Al pie del panel se ve la hora de la última actualización.

Resultado: el calendario se renueva varias veces por día. GitHub ejecuta las tareas programadas "cuando puede": aunque está pedida cada hora, en la práctica corre cada pocas horas (en octubre de 2026 se observó cada 6–7 horas). Además se renueva con cada cambio que se sube al repo. La demora afecta solo a pronósticos o cambios de agenda. Los horarios de los eventos no se mueven, así que la cuenta regresiva siempre es exacta.

## Qué muestra

- Solo eventos de **EE.UU.** (`USD`) de impacto **alto** y **medio**.
- El próximo dato de impacto alto, con cuenta regresiva, pronóstico y dato anterior.
- La lista de la semana, agrupada por día, en tu hora local.

ForexFactory no publica el resultado real de cada dato en este archivo, solo el pronóstico y el anterior.

## Si falla la descarga

ForexFactory limita la cantidad de pedidos. Si en una hora no responde, el deploy **reutiliza el último calendario publicado**, así el panel nunca queda vacío. Si tampoco hay uno anterior, el panel dice *"El calendario no está disponible en este momento"*.

{% hint style="info" %}
GitHub desactiva las tareas programadas de un repositorio público si pasan **60 días sin actividad** (sin commits). Si el calendario deja de actualizarse después de mucho tiempo sin cambios, entrá a la pestaña **Actions** del repo y reactivá la tarea **Publicar en GitHub Pages**.
{% endhint %}

## En desarrollo

`src/calendario.json` no se sube al repo. Para verlo en local:

```bash
npm run calendario
```
