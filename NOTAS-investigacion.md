# Notas de investigación — Detector de vinilos en remotes.com.uy

Bitácora del proyecto, en español simple. Cada sesión de trabajo agrega lo que se descubrió.

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
