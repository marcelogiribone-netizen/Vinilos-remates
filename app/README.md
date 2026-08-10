# DigBin — App (PWA)

**DigBin** ("revolver el cajón de discos") es una app web instalable en el
celular que muestra los vinilos encontrados en los remates activos de
remotes.com.uy. Lee el archivo `vinilos.json` (el que genera
`paso2_vinilos.js`).

## Qué tiene
- **Pantalla 1 (lista):** los remates que tienen vinilos, ordenados por el que
  cierra primero. De cada uno: foto (portada), nombre del remate, empresa,
  lugar, fecha/hora de cierre y cuántos vinilos tiene. Además se puede
  **puntuar cada remate a mano con estrellas (0 a 5)**.
- **Pantalla 2 (detalle):** al tocar un remate, se ven sus vinilos con foto,
  artista y álbum, número de lote, precio base y sello/año. Cada vinilo lleva
  directo a ese lote en la web, y hay un botón al remate completo. Cada vinilo
  se puede **marcar como destacado (corazón)** y hay un **filtro "solo
  destacados"**.
- **Funciona sin internet:** guarda la última copia de los datos y de las
  fotos ya vistas.
- **Instalable en Android** desde Chrome (tiene manifest, service worker e
  ícono).

- **Menú abajo (dos pestañas):** **Remates** (el listado) y **Colección**.
- **Colección:** todos los vinilos que marcaste con corazón, de cualquier
  remate, ordenados por cierre más próximo, mostrando de qué remate son y
  cuándo cierran. El nombre del remate es tocable y lleva a ese remate.

## Lo mío (puntuaciones y destacados)
Las estrellas de cada remate y los corazones de cada vinilo son **tuyos**: se
guardan en el celular y **sobreviven a las actualizaciones** de datos (se
asocian al remate y al lote por su id, no a su posición en la lista). Son dos
cosas separadas: destacar un vinilo NO cambia la puntuación del remate.

**Estrella automática:** al marcar un vinilo con el corazón, si el remate nunca
fue puntuado, se le pone 1 estrella. Si ya le pusiste una puntuación manual
(incluso 0), no se toca. Si sacás el corazón, la estrella queda.

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
