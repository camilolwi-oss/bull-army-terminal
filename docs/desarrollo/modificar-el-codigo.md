# Modificar el código

## Preparar el entorno

Necesitás [Node.js](https://nodejs.org) 18 o superior y [Git](https://git-scm.com). No hay dependencias que instalar.

```bash
git clone https://github.com/camilolwi-oss/bull-army-terminal.git
cd bull-army-terminal
npm run dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Sirve `src/` en <http://localhost:5173>. Recargá la página después de cada cambio. |
| `npm run build` | Arma `dist/bull-army-extremos.html`, un único archivo con todo adentro. |
| `npm run preview` | Hace el build y sirve el resultado para probarlo. |

Para usar otro puerto: `PORT=8080 npm run dev` (en PowerShell: `$env:PORT=8080; npm run dev`).

## Cómo se carga la página en desarrollo

Al final de `src/index.html` hay dos tipos de marcadores:

```html
<!-- Datos: el contenido se lee de data-src -->
<script type="application/json" id="snap" data-src="data/indicador.json"></script>

<!-- Scripts: se ejecutan en este orden -->
<script type="text/plain" data-app="js/app.js"></script>

<script src="js/loader.js"></script>
```

`js/loader.js` descarga los datos, los pone dentro de su `<script>` y después ejecuta los scripts de la app **en orden**. El build hace lo mismo, pero incrustando todo en el HTML y quitando el loader.

{% hint style="info" %}
Por eso `src/index.html` **no se abre con doble clic**: el navegador no deja leer archivos desde `file://`. Usá `npm run dev` o el archivo de `dist/`.
{% endhint %}

## Dónde tocar

| Si querés cambiar… | Editá |
|---|---|
| Textos o estructura de una sección | `src/index.html` |
| Colores, tipografías, espaciados | `src/css/styles.css` (las variables de color están al principio, en `:root`) |
| Una fórmula de Contexto | `src/js/contexto/calc.js` |
| Cómo se muestra Contexto | `src/js/contexto/ui.js` |
| Fórmulas o métricas de Spaghetti | `src/js/spaghetti/calc.js` |
| El mapa de liquidaciones | `src/js/liquidaciones/calc.js` |
| De dónde salen las posiciones | `src/js/liquidaciones/source.js` |
| Noticias o calendario | `src/js/noticias/ui.js` |
| Navegación, ajustes, Indicador, buscador de mercados | `src/js/app.js` |
| La sección Aurora (controles y gráfico) | `src/js/aurora/ui.js` |
| El cálculo de Aurora y el Hull que usa el Grid | `src/js/aurora/calc.js` |
| La sección Grid (celdas, alertas, WebSocket) | `src/js/grid/ui.js` |
| El indicador Aurora | `src/pine/aurora.pine` |
| El Hull Suite de la sección Aurora | `src/pine/hull-suite.pine` |
| El indicador Extremos | `src/pine/extremos.pine` |

## Agregar un archivo JS

1. Crealo en `src/js/<sección>/`.
2. Agregá su marcador en `src/index.html`, respetando el orden (los `calc.js` antes que sus `ui.js`, `app.js` al final):
   ```html
   <script type="text/plain" data-app="js/<sección>/nuevo.js"></script>
   ```
3. El build lo incrusta solo.

## Cambiar el Pine Script

La terminal lee los archivos de `src/pine/` directamente: `extremos.pine` en la sección **Indicador**, y `aurora.pine` y `hull-suite.pine` en la sección **Aurora**. Después de editar uno, abrí su sección con `npm run dev` y revisá la consola del navegador.

Los interruptores de cada sección le pasan valores a los `input` del script **por nombre de variable** (por ejemplo, `showOB` en Aurora). Si renombrás un input, actualizá también el JS de la sección.

{% hint style="warning" %}
El **Grid** no ejecuta `aurora.pine`: usa la réplica en JavaScript de `src/js/aurora/calc.js`. Si cambiás la lógica de Aurora en el Pine, replicá el cambio ahí para que el Grid y la sección Aurora sigan mostrando lo mismo.
{% endhint %}

{% hint style="warning" %}
PineTS no soporta el 100 % de Pine Script. Si usás funciones nuevas, verificá que funcionen **en la terminal y en TradingView**. En 6H y 3D la terminal quita las llamadas a `request.security()`, que PineTS no resuelve en esas temporalidades.
{% endhint %}

## Antes de subir cambios

- [ ] `npm run dev`: las siete secciones cargan y la consola no muestra errores.
- [ ] El estado dice **En vivo · Hyperliquid**.
- [ ] `npm run build` termina sin errores.
- [ ] `npm run preview`: el archivo único funciona igual.

Después:

```bash
git add -A
git commit -m "Describí el cambio"
git push
```

El push publica la nueva versión en la web automáticamente. Ver [Publicar](publicar.md).
