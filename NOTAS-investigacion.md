# Notas de investigación — Detector de vinilos en remotes.com.uy

Bitácora del proyecto, en español simple. Cada sesión de trabajo agrega lo que se descubrió.

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
