# Notas de investigación — Detector de vinilos en remotes.com.uy

Bitácora del proyecto, en español simple. Cada sesión de trabajo agrega lo que se descubrió.

---

## Sesión 14 — 12 de agosto de 2026 — Remates que desaparecen por HTTP 429

### El problema
Un remate (7600, "Noche de la Nostalgia", cierra 16/08) apareció un día y al
siguiente desapareció de la app, aunque en la web seguía activo.

### Diagnóstico con datos (sin suponer)
- **Home:** el 7600 aparece, dice "Vinilos" → pasa palabras clave.
- **Fecha:** cierra 16/08 (futuro) → pasa el filtro de fecha. NO era problema de
  fecha (se descartó mirando el timestamp; la fecha de la home es la de cierre).
- **Lotes:** 125 lotes, 124 se aceptan como vinilo → el filtro tampoco lo
  rechaza.
- **Descarga del remate:** ACÁ se caía. Comparando el JSON de ayer vs hoy en
  `main`: ayer el 7600 tenía 124 vinilos; hoy quedó con 0 y `error: "HTTP 429"`.
  Y no fue solo el 7600: **14 de 24 remates** de esa corrida fallaron con
  **HTTP 429 (Too Many Requests)**. El sitio nos limita por pedir muy seguido, y
  cuáles remates caen es casi aleatorio según el timing.

**Causa raíz:** `paso2` bajaba las páginas muy rápido, el sitio devolvía 429, y
el código trataba el 429 como "sin lotes" en silencio → el remate quedaba con 0
vinilos y la app lo escondía.

### El arreglo (en capas)
1. **Reintentos con espera ante 429/5xx** (respetando `Retry-After`): ante un
   429 ya no se rinde; espera y reintenta (hasta 4 veces, espera creciente).
2. **Descarga más pausada** (1,5–2,2 s entre pedidos, con jitter) para no
   disparar el 429.
3. **Carry-forward:** si aun así falla la descarga de un remate que **estaba en
   la corrida anterior con vinilos y todavía no cerró**, se **reusa esa data**
   (marcada `desactualizado: true`) para que NO desaparezca de la app.
4. **Chequeo permanente (log):** `alertas-remates.log` registra, con fecha, los
   remates que se reusaron, los que se perdieron sin data previa, y cualquiera
   que estaba ayer (activo) y hoy no vino. Queda commiteado para revisarlo.

Nota: el `desactualizado: true` indica que las ofertas de ese remate son de la
corrida anterior (una foto un poco más vieja) hasta que la próxima descarga
funcione.

---

## Política permanente — conflictos por app/vinilos.json (decidido 10/8/2026)

**Problema:** la tarea automática reescribe `app/vinilos.json` en `main`; si una
rama de trabajo también tocaba ese archivo, cada PR daba conflicto.

**Solución adoptada (simple y sin riesgo):** `app/vinilos.json` lo actualiza
**solo la tarea automática, en `main`**. Las **ramas de trabajo NO lo tocan**.
Con eso, al mergear un PR, git ve que la rama no modificó el archivo y toma el
de `main` automáticamente → **sin conflictos**. Para probar en local se usa
`vinilos-encontrados.json` (ignorado); nunca copiarlo a `app/vinilos.json` en
una rama de trabajo.

(Alternativa evaluada y descartada por ahora: mover el JSON a una rama de datos
aparte y que la app lo lea por URL. Es "cero disciplina", pero agrega riesgo de
CORS/caché y complejidad; no vale la pena para el beneficio.)

---

## Sesión 13 — 10 de agosto de 2026 — Oferta vigente + dos corridas por día

### 1) Oferta vigente de cada lote — ¡GRATIS!
**Hallazgo:** la oferta actual YA viene dentro de `var items`, en el mismo HTML
que el detector ya baja. NO hace falta usar el WebSocket ni hacer un pedido por
lote. Costo: **cero** pedidos extra; la corrida no se alarga ni agrega carga al
sitio.

Campos del lote:
- `precio`: valor de la oferta más alta (la puja actual). Es **0** si nadie
  ofertó todavía.
- (`proximaPuja` = próxima oferta mínima; `tengo_ofertas`/`maximaOferta`/
  `pujador` son del usuario logueado → inútiles para nosotros.)

**Regla:** si `precio > 0` hay oferta; si `precio = 0`, no hay.
En `paso2` cada vinilo ahora lleva `oferta` (= precio si > 0, si no `null`).

**En la app:**
- Sin oferta → precio **base** (como antes).
- Con oferta → el valor en **rojo** con una etiqueta "OFERTA".
- Funciona también en la **Colección** (misma tarjeta; el snapshot guarda la
  oferta).
- Es una **foto del momento de la corrida**, no tiempo real: se muestra
  "**Ofertas al DD/MM HH:MM**" (hora en que corrió el detector). Para eso el
  JSON ahora es `{ generado, remates }` (la app también acepta el formato viejo).
- Si un lote no trae el dato, muestra el base y no se rompe nada.

### 2) Dos corridas por día (hora de Uruguay, UTC-3)
El workflow pasó de 1 a **2 corridas**:
- **01:00 Uruguay = 04:00 UTC** (`0 4 * * *`): corrida principal (la lista de
  la mañana no arrastra remates que cerraron la noche anterior).
- **18:00 Uruguay = 21:00 UTC** (`0 21 * * *`): segunda pasada para refrescar
  las ofertas antes de que cierren los remates de esa noche.

Ambas hacen lo mismo (paso 1 + paso 2 + guardar el JSON). Service worker a
`digbin-v7`.

---

## Sesión 12 — 10 de agosto de 2026 — Falsos negativos del filtro (diagnóstico y arreglo)

### El problema
En el remate 7580 (Rincón del Vintage) faltaban discos reales (falsos
negativos). Se hizo un diagnóstico instrumentado (sin adivinar).

### Diagnóstico
- **Extracción:** 211 lotes extraídos = 211 en el HTML → NO se pierde ningún
  lote. El problema estaba 100% en el FILTRO. (El remate tiene lotes con sufijo
  como 7B/46C y uno #1000; por eso la numeración tiene huecos, pero están todos.)
- **Patrón real de los falsos negativos:**
  1. **Plural no reconocido:** la regla `\balbum\b` no matcheaba "álbumes"
     (plural). Muchos discos que solo dicen "álbumes" se perdían.
  2. **"álbum" exigía año o sello:** discos que dicen "Álbum de estudio/en
     vivo" sin año se descartaban.
  3. **"disco" no bastaba** aunque tuviera año y "música".
  4. **Contexto musical muy angosto:** no incluía "música", "canciones",
     "recopilatorio", "banda sonora", "varios artistas", "grabado en 19xx", etc.
  5. Discos descritos solo como **"Artista – Título"** (sin la palabra
     álbum/disco) eran invisibles.

### El arreglo (qué reglas cambiaron y por qué)
- "álbum" ahora es **plural-aware** (álbum/álbumes/albums).
- Se acepta **"álbum"** o **"disco"** por sí solos (ya filtrados los usos no
  musicales), y el formato **"Artista – Título" + contexto musical**.
- El **contexto musical** se amplió pero con términos CONFIABLES (banda sonora,
  varios artistas, recopilatorio, folclore, grabado en 19xx, etc.), evitando
  palabras ambiguas ("conjunto", "banda", "tema") que aparecen en bazar.
- **Descartes reforzados** para NO aflojar: arte/cine/objetos (óleo, "sobre
  tela/durabor", cuadro, súper 8, proyector, diapositiva, VHS, chapita,
  teléfono…), filatelia (álbumes de sellos) y equipos/muebles (disquero) se
  rechazan ANTES. Se cuidó de no descartar discos por mencionar extras del
  empaque ("afiche interno", "folleto", "láminas").
- Se ignora el prefijo de número de lote tipo **"L 335 - 15 piezas -"** al
  detectar el formato Artista-Título (evita falsos positivos masivos en remates
  que numeran así).

### Resultado (remate 7580)
- Antes: 65 aceptados (se perdían discos). Ahora: **92**, con **todos** los
  discos (lotes ~1–77) incluidos y **cero** arte/cine colado (lotes ~78–193:
  óleos, pósters, películas, diapositivas, etc. quedan afuera).
- Otros remates de control: 7393 sigue en 6; los de antigüedades (6241, 7492,
  7520, 7385, 7524) en 0 (sin falsos positivos). En 7460 quedó 1 (una colección
  de CDs/DVDs de rock: música real, no vinilo — falso positivo menor).

### Chequeo permanente de extracción
`paso2_vinilos.js` ahora compara, por cada remate, la cantidad de lotes
extraídos contra un conteo independiente del HTML. Si extrae de menos, avisa
fuerte y termina con error (exit 1) → la corrida diaria se pone en ROJO y NO se
publican datos incompletos (quedan los del día anterior hasta revisar).

Nota técnica: `paso2_vinilos.js` ahora exporta sus funciones (se puede
`require()` sin correr el proceso) para diagnóstico/tests.

---

## Sesión 11 — 10 de agosto de 2026 — Actualización automática diaria + vencidos

Cuatro cosas.

### 1) Corre solo una vez por día (GitHub Actions)
Se agregó **`.github/workflows/actualizar-datos.yml`**. Todos los días:
1. corre `paso1_remates.js`, 2. corre `paso2_vinilos.js`, 3. copia el
resultado a `app/vinilos.json`, 4. lo commitea y sube (solo si cambió).
- Horario: **09:00 UTC = 6:00 de la mañana de Uruguay** (temprano). GitHub a
  veces demora unos minutos, es normal.
- También se puede **disparar a mano** desde GitHub (botón "Run workflow").

IMPORTANTE: GitHub solo corre las tareas programadas (y muestra el botón "Run
workflow") cuando el archivo del workflow está en la **rama principal (main)**.
Mientras esté solo en la rama de trabajo, no se dispara solo. Cuando
mezclemos/publiquemos a `main`, la actualización diaria queda activa.

### 2) Remates vencidos NO aparecen en la pantalla principal
El filtro de vencidos ahora se aplica **al mostrar**, no solo al generar los
datos: si abrís la app y un remate cerró hace un rato, ya no aparece en la
lista. (Un remate se considera vencido si su fecha/hora ya pasó; los de "fecha
dudosa" o sin fecha no se esconden.)

### 3) Vencidos en la Colección = historial (no se borran)
La Colección ahora tiene dos secciones:
- **Arriba:** destacados de remates **activos**, ordenados por cierre más
  próximo.
- **Abajo:** sección **"Cerrados (historial)"**, atenuada en gris, con los
  destacados de remates que ya cerraron, mostrando **"cerró el ..."**.
- Botón **"Limpiar cerrados"** para borrarlos vos cuando quieras (pide
  confirmación). No se borran solos.

Para que esto funcione como historial de verdad (aunque el remate ya no venga
en los datos nuevos), al marcar un vinilo se guarda una **copia (snapshot)** de
ese disco y su remate en el celular. Así siempre podés volver a mirar qué
discos te interesaron, con su foto, remate y fecha de cierre.

### 4) La app toma los datos nuevos sin reinstalar
- `vinilos.json` se pide siempre **"red primero"** (si hay internet, trae lo
  último), y el service worker no deja datos viejos.
- Cuando cambia el **código** de la app, el service worker nuevo se activa y la
  app **se recarga sola una vez** para no quedar en la versión vieja.
- Tus **estrellas y corazones** viven aparte (en el celular, por id de remate y
  de lote) y **sobreviven siempre** a las actualizaciones.
- Service worker a `digbin-v6`.

### CÓMO VERIFICAR que la actualización diaria funciona
1. En GitHub, entrá al repositorio → pestaña **"Actions"**.
2. Buscá el workflow **"Actualizar datos de DigBin"** en la lista de la
   izquierda. (Recordá: aparece cuando el workflow ya está en `main`.)
3. Para probar sin esperar al horario: tocá **"Run workflow"** (botón a la
   derecha) → confirmá. En 1–2 minutos debería aparecer una corrida.
4. Una corrida en **verde (✓)** = salió bien. Si tocás la corrida, vas a ver
   los pasos (Paso 1, Paso 2, etc.) y sus registros.
5. Confirmá que **subió los datos**: en la pestaña "Commits" del repo tiene que
   aparecer un commit **"Actualización automática de datos (vinilos.json)"**
   (solo aparece si hubo cambios respecto del día anterior).
6. En el celular, abrí DigBin con internet: al ratito vas a ver los datos
   nuevos (y arriba de la lista, la fecha de "actualizado ...").

Si una corrida sale en **rojo (✗)**, abrila y mirá en qué paso falló:
- si es en "Paso 1/2", puede ser que el sitio no respondió o cambió algo;
- volvé a intentar con "Run workflow"; si sigue fallando, avisame y lo reviso.

---

## Sesión 10 — 10 de agosto de 2026 — Nuevo ícono de DigBin (funda + firma "DB")

Se rediseñó el ícono (el del cajón no gustó). El nuevo es una **funda de disco
roja** (color #b5341f, esquinas en vértice) con el **vinilo asomando ~1/4** por
arriba (el disco es un poco más chico que la funda, así sus bordes no coinciden
con los vértices → más natural), y sobre la funda el monograma **"DB" en
cursiva** (fuente *Great Vibes*) en tono **crema** (#f2e4c0), con una **rúbrica
de firma** debajo (subrayado + un acento corto), bien pegada a las letras.

Detalles:
- La fuente cursiva se bajó del registro de **npm** (`@fontsource/great-vibes`),
  que sí está permitido, y quedó **embebida** en el SVG fuente.
- Fuente editable del ícono: **`app/icons/icon-source.svg`** (autocontenido,
  se abre en cualquier navegador).
- PNG finales: `app/icons/icon-192.png` y `icon-512.png`.
- `generar_iconos.js` ahora regenera esos PNG desde el SVG fuente.
- En el manifest, los íconos pasaron a `purpose: "any"` (el diseño tiene fondo
  blanco y contenido cerca de los bordes; con "maskable" se recortaban las
  esquinas).
- Service worker a `digbin-v5`.

---

## Sesión 9 — 9 de agosto de 2026 — La app se llama DigBin (nombre + ícono)

### Nombre nuevo
La app pasó a llamarse **DigBin** (la idea: "dig" = revolver/excavar, "bin" =
cajón de discos de disquería → revolver el cajón de discos). Se cambió en todo
lo visible para el usuario:
- Manifest: `name` y `short_name` = "DigBin" (lo que se lee bajo el ícono al
  instalarla).
- Título de la página (`<title>`).
- Encabezado dentro de la app (barra de arriba en la pantalla de Remates).
- README de la app.

No se cambió el nombre del repositorio ni de los archivos de código (solo lo
visible).

### Ícono nuevo
El anterior era un vinilo genérico. El nuevo es acorde al nombre: un **cajón
de discos** con fundas de colores y un **vinilo saliendo** (revolver el
cajón). Simple y reconocible en tamaño chico. Se generó con
`generar_iconos.js` (Node puro, sin librerías) en 192 y 512 px. El mismo
cajón se usa además como imagen de respaldo cuando una foto no carga.

Detalle técnico: el service worker pasó a `digbin-v4`.

---

## Sesión 8 — 9 de agosto de 2026 — App: estrella automática, menú y Colección

Tres cambios más (sin tocar todavía la actualización automática).

### 1) Estrella automática al destacar
Cuando marcás un vinilo con el corazón, si ese remate **nunca fue puntuado**,
la app le pone **1 estrella automáticamente**. Reglas respetadas:
- Si ya le pusiste una puntuación manual (cualquiera, **incluso 0 a
  propósito**), NO se toca. Tu puntuación manual siempre gana.
- Si después sacás el corazón, la estrella **queda** (no se borra sola).

Para que esto funcione bien, internamente ahora se distingue **"sin puntuar"**
(no existe la clave guardada) de **"puntuado en 0 por vos"** (existe la clave
con valor 0). Antes el 0 se borraba; ahora se guarda siempre. En las estrellas,
la etiqueta muestra "sin puntuar" o "0/5" según el caso.

### 2) Menú de navegación (pestañas abajo)
Se agregó una **barra de pestañas fija abajo** (cómoda para una mano) con dos
secciones:
- **Remates** 💿 → el listado de siempre (pantalla 1).
- **Colección** ♥ → la nueva pantalla.
La pestaña activa se resalta. El detalle de un remate sigue dentro de
"Remates".

### 3) Pantalla "Colección"
Muestra **todos los vinilos marcados con corazón**, de cualquier remate,
**ordenados por fecha de cierre (más próxima primero)**. Cada vinilo muestra:
foto, artista y álbum, número de lote, precio base, chips de sello/año, y —lo
importante— **de qué remate es y cuándo cierra**. Así ya no perdés de vista a
qué remate pertenece lo que marcaste.
- Tocar el vinilo (foto/datos) abre ese **lote en la web**.
- El **nombre del remate es tocable** y lleva a la pantalla de ese remate
  **dentro de la app**.
- Si no hay ninguno marcado, aparece un **mensaje amable** explicando cómo
  agregar (ir a Remates, entrar a un remate y tocar el corazón).
- Desde la Colección también podés **quitar** un destacado (y desaparece).

### Probado (navegador, tamaño celular)
- Destacar sin puntuar → pone 1 estrella. ✔
- Destacar con 0 manual → queda en 0 (no lo pisa). ✔
- Quitar el corazón → la estrella queda. ✔
- Distingue "sin puntuar" de "0/5". ✔
- Colección: 2 destacados ordenados por cierre, nombre de remate tocable que
  lleva al detalle, con fecha de cierre visible. ✔
- Menú con 2 pestañas y mensaje de vacío. Sin errores. ✔

Detalle técnico: el service worker pasó a `vinilos-v3`.

---

## Sesión 7 — 9 de agosto de 2026 — Mejoras a la app: puntuación, destacados y fotos

Se agregaron tres cosas pedidas (sin tocar todavía la actualización automática).

### 1) Puntuación manual de remates (pantalla 1)
Cada remate tiene una fila de 5 estrellas tocables (0 a 5). Es una valoración
**tuya, manual**: no se calcula con nada. Arrancan sin puntuar. Tocar una
estrella pone esa puntuación; tocar la misma estrella otra vez la baja a 0
(para despuntuar). Se guarda en el celular (clave `puntuaciones`) **asociada
al id del remate**, así sobrevive cuando se actualizan los datos y no depende
de la posición en la lista. Tocar las estrellas NO abre el remate.

### 2) Destacar vinilos (pantalla 2)
Cada vinilo tiene un corazón tocable. Al marcarlo queda rojo y visible. Hay un
botón **"Solo destacados"** que filtra la lista para ver únicamente los
marcados (muestra también cuántos hay). Se guarda en el celular (clave
`destacados`) **asociado al id del lote**, así sobrevive a las
actualizaciones. Es **independiente** de la puntuación del remate (son dos
cosas separadas, en almacenes distintos).

### 3) Fotos de los vinilos — diagnóstico y solución
**El problema:** las fotos no cargaban y se veía el logo genérico. Investigué
las cabeceras del servidor de imágenes (`static3.remotes.com.uy`) y encontré
que tiene **protección anti-hotlinking por "Referer"**:

- Foto pedida **sin** Referer → responde **200** (la imagen). ✅
- Foto pedida con Referer de **otro dominio** (ej: `tuusuario.github.io`) →
  responde **403** (bloqueada). ❌
- Foto pedida con Referer del **propio** remotes.com.uy → **200**. ✅

O sea: cuando la app está publicada en otro dominio (GitHub Pages), el
navegador manda por defecto el Referer de ese dominio y el servidor rechaza la
imagen. Por eso se veía el logo de respaldo.

**La solución:** hacer que el navegador **no mande Referer**. Se hizo de dos
formas (por las dudas):
- Un `<meta name="referrer" content="no-referrer">` global en `index.html`.
- El atributo `referrerpolicy="no-referrer"` en cada `<img>`.
- Y en el service worker, las fotos se piden con `referrerPolicy: 'no-referrer'`
  y `mode: 'no-cors'`.

Se verificó por HTTP: sin Referer la imagen da **200 image/jpeg**; con Referer
de otro dominio da **403**. Con la solución, el navegador no manda Referer, así
que las fotos cargan.

**Respaldo:** si una foto igual falla, se muestra el ícono genérico (un vinilo)
y la lista no se rompe (cada `<img>` tiene un `onerror` que cambia a ese ícono).

En la **lista** ahora también se muestra una foto por remate: la primera foto
de sus vinilos (la portada).

Nota: NO se pudo ver la foto real dentro de esta máquina de pruebas porque su
salida a internet hacia el servidor de imágenes está limitada; pero se
comprobó por HTTP que las URLs responden 200 sin Referer, así que en el
celular real se ven.

### Detalle técnico
Se agregó el campo `id` (id estable del lote) a cada vinilo en
`paso2_vinilos.js`, para poder guardar los destacados de forma que sobrevivan
a las actualizaciones. El service worker pasó a versión `vinilos-v2`.

---

## Sesión 6 — 9 de agosto de 2026 — Paso 3: la app instalable (PWA)

### Qué se pidió
Una PWA (app web instalable) para el celular, con dos pantallas, que lea el
JSON de `paso2_vinilos.js`, funcione sin internet y sea instalable en Android.

### Qué se hizo
Toda la app quedó en la carpeta **`app/`**:
- `index.html`, `styles.css`, `app.js` — la aplicación.
- `manifest.webmanifest` — para poder instalarla.
- `sw.js` — el "service worker" (hace que ande sin internet).
- `icons/icon-192.png`, `icons/icon-512.png` — el ícono (un vinilo).
- `vinilos.json` — los datos (copia de `vinilos-encontrados.json`).

**Pantalla 1 (lista):** remates con vinilos, ordenados por cierre más
próximo. Muestra nombre del remate (recortado con "…" si es largo), empresa,
lugar, fecha/hora y cuántos vinilos tiene. NO muestra el número de remate.

**Pantalla 2 (detalle):** título = nombre del remate; abajo en letra chica la
empresa, el lugar y la fecha; botón "Ver remate completo"; y la lista de
vinilos con foto, artista — álbum, número de lote, precio base y chips de
sello/año. Cada vinilo es tocable y abre ese lote en la web.

### Detalle técnico: el "nombre del remate"
La web no muestra el número de remate, así que se usa el **nombre real** que
figura en el `<title>` de la página de cada remate, con el patrón
"Participá del remate de EMPRESA: NOMBRE". Se toma la primera línea de ese
nombre. Se agregó al `paso2_vinilos.js` (campo `nombre` en el JSON).

### Cómo funciona sin internet
- La app (pantallas, ícono) se guarda la primera vez que se abre.
- Los datos (`vinilos.json`) usan "red primero": si hay internet trae lo
  último; si no, muestra la última copia guardada (con un aviso).
- Las fotos de los discos se van guardando a medida que se ven.

### Probado
Se probó con un navegador real (Chromium) en tamaño de celular:
- Las dos pantallas se ven bien y son legibles con una mano. ✔
- El service worker se registra. ✔
- **Sin conexión**: se corta internet, se recarga, y los 6 remates y sus
  vinilos siguen apareciendo. ✔
- Las URLs de las fotos responden HTTP 200 (se ven en el celular real). ✔

### CÓMO INSTALARLA EN EL CELULAR (para Marcelo)

La app necesita estar publicada en una dirección con "https" para poder
instalarse. La forma más fácil y gratis es **GitHub Pages** (el proyecto ya
está en GitHub):

1. **Publicar (una sola vez):**
   - En la computadora/celular, entrá a GitHub, al repositorio del proyecto.
   - Andá a **Settings → Pages**.
   - En "Build and deployment", elegí **Deploy from a branch**.
   - Elegí la rama `main` (o la rama del proyecto) y carpeta `/ (root)`,
     y guardá.
   - Esperá 1–2 minutos. GitHub te va a dar una dirección tipo
     `https://TU-USUARIO.github.io/Vinilos-remates/app/`.

2. **Instalar en el celular (Android + Chrome):**
   - Abrí esa dirección (`.../app/`) en **Chrome**.
   - Tocá el menú de Chrome (los tres puntitos, arriba a la derecha).
   - Tocá **"Agregar a la pantalla de inicio"** o **"Instalar aplicación"**.
   - Confirmá. Va a aparecer el ícono del vinilo en tu pantalla, como
     cualquier app.
   - (Si no aparece la opción, esperá unos segundos o recargá; a veces
     Chrome tarda en ofrecer instalar.)

3. **Usarla:**
   - Se abre a pantalla completa, como una app normal.
   - Funciona aunque estés sin datos: muestra lo último guardado.

Nota: mientras no tengamos la actualización automática (próximo paso), los
datos se refrescan cuando corrés de nuevo `paso1` + `paso2` y actualizás el
archivo `app/vinilos.json` en el repo.

### Próximos pasos sugeridos
- Que los datos se actualicen solos (que la app o un proceso corra `paso1` +
  `paso2` cada tanto y actualice `vinilos.json`).
- Guardar favoritos / marcar vinilos que te interesan.
- Filtro o buscador por artista dentro de la app.

---

## Sesión 5 — 8 de agosto de 2026 — Paso 2: leer los lotes y armar la lista de vinilos

### Qué se pidió
Entrar a cada remate candidato, leer sus lotes (con el método de `extraer.js`)
y armar la lista final de vinilos, con un filtro MÁS FINO que el de la home
(la palabra "disco" sola no alcanza). Para cada vinilo: número de lote,
artista y álbum, sello y año (si aparecen), precio base, enlace a la imagen
y enlace directo al lote. Todo agrupado por remate, solo remates que no
cerraron, ordenados por cierre más próximo primero.

### Qué se hizo
Escribí **`paso2_vinilos.js`**. Toma los candidatos del Paso 1
(`remates-candidatos.json`), entra a cada remate (baja la página en vivo, o
usa una cache local para pruebas), lee la variable `items` con los lotes, y
aplica un **filtro fino de vinilos**.

### Cómo funciona el filtro fino (lo importante)
Mira el CONTEXTO, no una sola palabra:

- **Señales fuertes** (con una alcanza): "vinilo", "long play"/"elepé", "LP",
  "acetato", "33/45/78 RPM", "disco de vinilo", "discos de pasta" (los de 78
  RPM, antiguos), o la frase "sello discográfico".
- **Sello conocido + contexto**: RCA, Odeon, Philips, CBS, Columbia, EMI,
  Polydor, Continental, etc. — pero SOLO cuenta si además hay contexto de
  música. Así "Juguera Philips" o "Lámpara Philips" NO se cuelan.
- **Combinaciones**: "álbum" + (sello o año), "disco" + "álbum", etc.
- **Descarta equipos y muebles**: tocadiscos, mini componentes, "disqueros"
  (muebles para discos), estanterías... salvo que traigan una cantidad real
  de discos (ej: "34 discos de pasta").
- Ignora usos falsos: "disco duro", "disco de freno", "álbum de figuritas".

También intenta sacar **artista y álbum** del título (formato "Artista -
Título", entre paréntesis, o "…de Fulano…"). Es aproximado (el título es
texto libre), pero **siempre queda el título completo** por las dudas.

### Resultado real (corrida del 8/8/2026)
Revisó los **23 remates activos** (los otros 16 candidatos ya habían cerrado,
filtrados por fecha como se pidió). Encontró **78 vinilos en 6 remates**:

| Cierre | Remate | Empresa (lugar) | Vinilos |
|--------|--------|-----------------|---------|
| 09/08 11:00 | 7441 | Jorge Perujo (Montevideo) | 1 (34 discos de pasta) |
| 09/08 17:00 | 7480 | Escritorio de Remates CV (Colonia) | 1 (13 discos vinilos) |
| 09/08 20:00 | 7393 | Mage Remates (Montevideo) | 6 |
| 11/08 18:59 | 7580 | Rincón del Vintage (Montevideo) | 65 |
| 11/08 19:00 | 7576 | Gardiol y otros (Colonia) | 1 |
| 17/08 15:00 | 7568 | Valentina Rodríguez (Montevideo) | 4 (Beatles) |

El remate **7580 (Rincón del Vintage)** es el premio gordo: 65 vinilos
(Beatles, Eric Clapton, George Harrison, Supertramp, Alice Cooper,
Whitesnake, Journey...).

### Cómo usarlo
```
node paso1_remates.js      # arma remates-candidatos.json
node paso2_vinilos.js      # entra a cada uno y arma vinilos-encontrados.json
```
El resultado queda en `vinilos-encontrados.json` (agrupado por remate). Se
guardó una foto en `ejemplo-vinilos-encontrados.json`.

### Qué se afinó durante el trabajo (por si sirve)
En las primeras corridas aparecían falsos positivos: electrodomésticos
Philips, medallas con año y guión ("El País - Campeón 1987"), y un mueble
"disquero". Se corrigieron exigiendo contexto musical y descartando
equipos/muebles. También se recuperó un hallazgo que se escapaba: un lote de
"34 discos de pasta".

### Cosas para tener en cuenta / a mejorar
- **Artista/álbum son aproximados** en títulos con redacción libre; el título
  completo siempre queda guardado.
- El filtro se puede seguir afinando con más sellos o casos raros.
- Falta (próximos pasos): ver estado de cada lote (si ya se vendió), precios
  en vivo, y quizás una app/aviso automático.

---

## Sesión 4 — 8 de agosto de 2026 — Filtro de fecha (solo remates activos)

### Qué se pidió
Que la lista muestre **solo los remates que todavía no cerraron**, y que
esté **ordenada por fecha de cierre más próxima primero** (lo que está por
vencer, arriba).

### Qué se hizo (dentro de `paso1_remates.js`)
1. **Descartar los ya finalizados:** cuando corre el programa, mira la hora
   actual y saca de la lista todo remate cuya fecha/hora ya pasó.
2. **Fecha dudosa:** si un remate no tiene una fecha clara en la home, NO se
   descarta; se incluye igual pero queda marcado con `"fechaDudosa": true`
   (y en pantalla aparece con un aviso "⚠️ FECHA DUDOSA"). Estos van al final
   de la lista.
3. **Orden:** de la fecha de cierre más próxima a la más lejana.

Nota técnica: la home trae una sola fecha por remate (la etiqueta "Cuándo"),
que es la que usamos como fecha de cierre. Es el único dato de fecha
disponible en la página principal.

### Resultado real (corrida del 8/8/2026)
- 39 candidatos con palabras clave.
- **16 descartados** por estar ya finalizados.
- **23 candidatos activos** quedaron en la lista, ordenados por vencimiento.
- El primero de la lista vence el 09/08 a las 11:00 (Jorge Perujo).

El archivo `ejemplo-remates-candidatos.json` fue actualizado con estos 23.

---

## Sesión 3 — 8 de agosto de 2026 — Paso 1: leer la home y filtrar candidatos

### Qué se pidió
Que el detector lea la página principal (la "home") y arme la lista de
remates que probablemente tengan vinilos, para después (en otro paso) entrar
solo a esos. Sin entrar todavía a cada remate ni armar ninguna app.

### Qué se hizo
Escribí el programa **`paso1_remates.js`**. Hace esto:

1. **Baja la home** `https://www.remotes.com.uy/`. Puede bajarla en vivo, o
   usar un archivo `home.html` que se le pase (por si la red da problemas).
2. **Lee todos los remates** que aparecen ahí. Descubrí que cada remate está
   en un bloque de HTML que empieza con
   `<a class="selectRemateLabel" href="participar/remate/NÚMERO">`, y adentro
   trae: empresa rematadora, departamento (un cartelito azul), la descripción
   (en una etiqueta `<h4>`), la dirección ("Dónde"), el teléfono, el
   rematador y la fecha/hora (guardada como "timestamp", un número que
   convierto a fecha de Uruguay).
3. **Filtra por palabras clave** (sin distinguir mayúsculas ni tildes):
   vinilo, vinilos, disco, discos, LP, long play, álbum, música, tocadiscos,
   colección, coleccionable(s), antigüedad(es), multirubro, sucesión.
   El filtro es **amplio a propósito**: prefiere traer de más.
4. **Guarda dos archivos**:
   - `remates-candidatos.json` → solo los remates que pasaron el filtro.
   - `remates-todos.json` → todos los remates de la home (para revisar a mano).
5. **Muestra en pantalla** la lista de candidatos, ordenada por fecha (los
   más próximos primero).

### Resultado real (corrida del 8/8/2026)
- **98 remates** en total en la home.
- **39 candidatos** con palabras clave.
- Palabras que más aparecieron: `antigüedades` (18), `coleccionables` (14),
  `colección` (9), `sucesión` (5), `multirubro` (3), `vinilos` (2),
  `discos` (2), `música` (1), `vinilo` (1).

**Remates que mencionan vinilos/discos/música DIRECTAMENTE en la home**
(los más prometedores):
- **7580** — Rincón del Vintage (Montevideo): "REMATE ÚNICO DEDICADO POR
  ENTERO AL ARTE... VINILOS ÚNICOS...".
- **7443** — Legado Remates (Canelones): menciona "vinilos".
- **7393** — Mage Remates (Montevideo): "...Discos de Vinilo y mucho más"
  (este es el que ya analizamos: tiene 6 vinilos).
- **7576** — Gardiol y otros (Colonia): "discos" + coleccionables.
- **7533** — Import Remates (Montevideo): libros, CDs y "música".

(El resto de los 39 son de antigüedades / colección / sucesión, donde
suelen aparecer vinilos aunque no lo digan en el título. Por eso conviene
igual entrar a revisarlos en el Paso 2.)

### Cómo usarlo
```
# Opción A: baja la home en vivo
node paso1_remates.js

# Opción B: usar una home ya descargada
curl -s "https://www.remotes.com.uy/" > home.html
node paso1_remates.js home.html
```

### Cosas para tener en cuenta / a mejorar
- **Fechas viejas:** la home muestra también algunos remates cuya fecha ya
  pasó (por ejemplo del 5/8, y hoy es 8/8). Los dejé todos por ahora, con su
  fecha, para no perder ninguno. En el Paso 2 podemos filtrar por fecha si
  querés ver solo los futuros.
- **Zona horaria:** las fechas se muestran en hora de Uruguay
  (America/Montevideo).
- **El JSON cambia** cada vez que se corre (según lo que haya en la home),
  por eso está en `.gitignore`. Guardé una foto de ejemplo en
  `ejemplo-remates-candidatos.json` para que se vea el formato.
- Todavía **no** entramos a cada remate ni miramos los lotes; eso es el
  Paso 2.

---

## Sesión 2 — 8 de agosto de 2026 — ¡RESUELTO!

### Resumen de una línea
Los lotes (número, título, descripción, precio base y más) **ya vienen
dentro del HTML** de la página del remate, guardados en una variable de
JavaScript llamada `items`. No hace falta ninguna API secreta ni WebSocket
para leer las descripciones. Con un simple `curl` alcanza.

### Cómo lo encontramos (contado sencillo)

1. Ya con la red habilitada, bajé la home y la página del remate 7393:
   ambas responden **HTTP 200** (o sea, todo bien).
2. Revisé el HTML del remate 7393. Marcelo tenía razón: no se ven las
   descripciones "a simple vista" en la parte visible de la página.
3. Pero al mirar el HTML por dentro, encontré que la página trae **todos
   los datos de los lotes escondidos en una línea de JavaScript**:

   ```
   var items = [{"id":1065913,"remate":7393,"lote":"1",
   "titulo":"Bowl de Cerámica ...","descripcion":"*largo: 23,5 cm...",
   "base":"150.000000", ...}, {...}, ...]
   ```

   Es una lista con **los 85 lotes** del remate, cada uno con su número,
   título, descripción, moneda y precio base. La página usa esa lista para
   ir "dibujando" los lotes con JavaScript — por eso Marcelo no las veía en
   el texto plano, pero los datos **siempre estuvieron ahí, en el HTML**.

### Por qué esto es una gran noticia

- **No necesitamos una API ni permisos especiales.** Con bajar la página
  (como hace cualquier navegador) ya tenemos todo.
- Es **rápido y liviano**: una sola descarga por remate.
- Funciona **sin ejecutar JavaScript**, así que el detector puede ser un
  programa muy simple.

### La receta técnica (para reproducirlo)

1. Descargar la página del remate:
   `https://www.remotes.com.uy/participar/remate/<NUMERO>`
2. Buscar en el HTML el texto `var items = ` y leer la lista JSON que le
   sigue (desde el `[` hasta el `]` que lo cierra).
3. Eso es un JSON con todos los lotes. Campos útiles de cada lote:
   - `lote` → número del lote (ej: "46")
   - `titulo` → descripción principal (acá dice si es un vinilo)
   - `descripcion` → detalles extra (medidas, etc.)
   - `moneda` + `base` → precio base
   - `id`, `remate`, `cantidad` → identificadores y stock

El script `extraer.js` (guardado en el repo) hace exactamente esto.

### Ejemplo real: lotes del remate 7393 (85 lotes en total)

Este remate es de antigüedades y objetos de colección. Entre ellos hay
**6 lotes de vinilos/discos**, que el detector encontró automáticamente
buscando palabras como "vinilo", "disco", "LP":

- **Lote 46** — Disco de vinilo del álbum "Dezembros" de Maria Bethânia
  (RCA, 1986). Base $250.
- **Lote 47** — Disco de vinilo "Selección 25 Aniversario" de Carlos
  Gardel (Odeon, 1960). Base $300.
- **Lote 48** — Disco de vinilo "Y te has quedado sola" de Los Iracundos
  (RCA Victor, 1974). Base $250.
- **Lote 49** — Álbum "A Qué Le Llaman Distancia" de Atahualpa Yupanqui
  (Odeon, 1960). Base $250.
- **Lote 50** — Disco álbum homónimo de Sandro, el "Álbum Rojo"
  (CBS, 1969). Base $250.
- **Lote 51** — Disco "El grito de la tierra" de Mercedes Sosa
  (Philips, 1970). Base $250.

(La lista completa de los 85 lotes queda en el archivo `lotes-7393.json`,
generado por el script.)

### Detalle técnico menor (por si aparece más adelante)

- Dentro del HTML también hay un `SOCKET_URL` / `wss://www.remotes.com.uy/socket`.
  Eso es el **WebSocket de la subasta en vivo** (para ver las ofertas en
  tiempo real mientras corre el remate). **No** lo necesitamos para leer las
  descripciones de los lotes — esas ya están en `var items`. Lo dejo anotado
  por si en el futuro querés mostrar precios/ofertas en vivo.
- El sitio está detrás de Cloudflare, pero no molestó: respondió normal.

### Próximos pasos sugeridos (para la siguiente sesión)

1. Armar un pequeño programa que:
   a. Lea la home para sacar la lista de remates activos.
   b. Entre a cada remate, extraiga `items`, y filtre los que son vinilos.
   c. Arme un aviso (lista de vinilos encontrados, con remate, lote y base).
2. Mejorar el filtro de vinilos (palabras clave, evitar falsos positivos
   como "disco" de freno o "disco" duro, etc.).
3. Ver si conviene que corra solo cada cierto tiempo y te avise.

---

## Sesión 1 — 8 de agosto de 2026

### Objetivo de la sesión
1. Confirmar acceso a remotes.com.uy desde el entorno de trabajo.
2. Encontrar la API interna que carga los lotes de cada remate.
3. Mostrar como ejemplo los lotes del remate 7393.

### Resultado: BLOQUEADO por la configuración de red del entorno

**Qué pasó:** el "entorno" donde trabajo (una computadora en la nube que se
crea para cada sesión) tiene la salida a internet casi totalmente cerrada.
Hice varias pruebas:

- `https://www.remotes.com.uy/` → bloqueado (error 403 del proxy de red)
- `https://remotes.com.uy/` → bloqueado
- `https://example.com/` → bloqueado
- `https://www.google.com/` → bloqueado

Como hasta un sitio genérico como example.com está bloqueado, el problema
**no es del sitio de remates**: es la política de red del entorno, que solo
permite descargar paquetes de programación (npm, PyPI, etc.) y hablar con
GitHub. Ningún sitio web común es accesible.

### Qué hay que hacer para destrabar (lo hace Marcelo desde el celular)

1. Entrar a **claude.ai/code** (o la app donde se abre esta sesión).
2. Ir a la configuración del **entorno** (Environment settings) de este
   proyecto — es la sección donde se elige el acceso a red
   ("Network access").
3. Cambiar la política a **acceso completo a red** ("Full network access"),
   o si se prefiere algo más cerrado, agregar estos dominios a la lista de
   permitidos:
   - `remotes.com.uy`
   - `www.remotes.com.uy`
4. Empezar una sesión nueva (los cambios de red suelen aplicar a las
   sesiones que se crean después del cambio).

Documentación oficial (en inglés):
https://code.claude.com/docs/en/claude-code-on-the-web

### Plan de investigación para la próxima sesión (cuando haya red)

Esto es lo que hay que hacer, en orden:

1. **Probar la home** (`https://www.remotes.com.uy/`): confirmar que
   responde y que las descripciones de los remates activos están en el HTML.
2. **Bajar la página de un remate** (`/participar/remate/7393`) y confirmar
   que los lotes NO están en el HTML (solo número + foto, según lo que vio
   Marcelo).
3. **Buscar la API interna**: revisar los archivos JavaScript que carga esa
   página (etiquetas `<script src=...>`) y buscar adentro palabras como
   `fetch`, `ajax`, `api`, `lotes`, `remate`, `json`. Eso suele revelar la
   dirección del "mostrador trasero" (la API) donde la página pide los datos.
4. **Probar los endpoints encontrados** contra el remate 7393, por ejemplo
   direcciones del estilo `/api/remate/7393/lotes` o similares, y ver si
   devuelven los lotes en formato JSON (texto estructurado, fácil de leer
   por un programa).
5. **Documentar acá** el endpoint exacto, qué parámetros necesita, y un
   ejemplo real de la lista de lotes del remate 7393 (número + descripción).

### Datos que ya sabemos (aportados por Marcelo)

- La página principal `https://www.remotes.com.uy/` lista todos los remates
  activos **con su descripción directamente en el HTML** (fácil de leer).
- Las páginas de remate individual (ej: `/participar/remate/7393`) muestran
  los lotes solo como **número + foto**; las descripciones en texto se
  cargan después, con JavaScript. Por eso hace falta encontrar la API.

### Idea general del proyecto (para no perderla)

Un detector que revise los remates del sitio y avise cuando aparezcan
lotes de **vinilos** (discos). Para eso necesitamos poder leer las
descripciones de los lotes de forma automática, que es lo que estamos
investigando.
