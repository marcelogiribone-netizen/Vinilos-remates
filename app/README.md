# Detector de Vinilos — App (PWA)

App web instalable en el celular que muestra los vinilos encontrados en los
remates activos de remotes.com.uy. Lee el archivo `vinilos.json` (el que
genera `paso2_vinilos.js`).

## Qué tiene
- **Pantalla 1 (lista):** los remates que tienen vinilos, ordenados por el que
  cierra primero. De cada uno: nombre del remate, empresa, lugar, fecha/hora
  de cierre y cuántos vinilos tiene.
- **Pantalla 2 (detalle):** al tocar un remate, se ven sus vinilos con foto,
  artista y álbum, número de lote, precio base y sello/año. Cada vinilo lleva
  directo a ese lote en la web, y hay un botón al remate completo.
- **Funciona sin internet:** guarda la última copia de los datos y de las
  fotos ya vistas.
- **Instalable en Android** desde Chrome (tiene manifest, service worker e
  ícono).

## Archivos
- `index.html`, `styles.css`, `app.js` — la app.
- `manifest.webmanifest` — datos para instalarla.
- `sw.js` — service worker (hace que funcione sin internet).
- `icons/` — íconos de la app.
- `vinilos.json` — los datos (copiar acá el resultado de `paso2_vinilos.js`).

## Cómo actualizar los datos
Cada vez que quieras refrescar la lista:
```
node paso1_remates.js
node paso2_vinilos.js
cp vinilos-encontrados.json app/vinilos.json
```
(Después, en la app, con internet, se actualiza sola al abrirla.)

## Probar en la compu
Un service worker necesita un servidor (no sirve abrir el archivo directo).
Desde la carpeta `app/`:
```
python3 -m http.server 8099
```
y abrir `http://localhost:8099/` en el navegador.

## Publicarla e instalarla en el celular
Ver las instrucciones detalladas en `NOTAS-investigacion.md` (Sesión 6).
En resumen: se publica la carpeta `app/` en un lugar con HTTPS (por ejemplo
GitHub Pages), se abre esa dirección en Chrome del celular, y se usa
"Agregar a pantalla de inicio / Instalar app".
