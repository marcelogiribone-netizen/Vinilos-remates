# Notas de investigación — Detector de vinilos en remotes.com.uy

Bitácora del proyecto, en español simple. Cada sesión de trabajo agrega lo que se descubrió.

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
