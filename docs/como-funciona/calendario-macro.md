# Calendario macro

El panel **Macro esta semana** de la sección [Noticias](../secciones/noticias.md) no consulta una API pública directamente: lee los eventos desde **un servidor propio** (por ejemplo, un Cloudflare Worker) cuya dirección se carga en [Ajustes](../primeros-pasos/ajustes.md).

Así el calendario puede venir de cualquier fuente sin cambiar la terminal: el servidor solo tiene que devolver el formato de abajo.

## Qué tiene que devolver el servidor

Un JSON con una lista `events`:

```json
{
  "events": [
    {
      "title": "CPI m/m",
      "country": "USD",
      "date": "2026-10-14T08:30:00-04:00",
      "impact": "High",
      "forecast": "0.3%",
      "previous": "0.4%"
    }
  ]
}
```

| Campo | Contenido |
|---|---|
| `title` | Nombre del evento. |
| `country` | Moneda o país. La terminal muestra solo `"USD"`. |
| `date` | Fecha y hora con zona horaria (formato ISO 8601). |
| `impact` | `"High"`, `"Medium"` o `"Low"`. La terminal muestra `High` y `Medium`. |
| `forecast` | Pronóstico (texto, puede ir vacío). |
| `previous` | Dato anterior (texto, puede ir vacío). |

## Requisitos del servidor

- Responder a un `GET` en la dirección que cargás en Ajustes.
- Permitir CORS con el encabezado `Access-Control-Allow-Origin: *`, porque la terminal lo llama desde el navegador.
- La terminal lo vuelve a pedir cada 30 minutos; conviene que el servidor guarde la respuesta en caché.

{% hint style="warning" %}
El código de este servidor **todavía no está en el repositorio**. Hasta que exista, el panel muestra un botón para abrir Ajustes y el resto de la sección Noticias funciona normalmente.
{% endhint %}
