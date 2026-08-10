// paso2_vinilos.js
// -----------------------------------------------------------------------------
// PASO 2 del detector de vinilos de remotes.com.uy
//
// Toma la lista de remates candidatos (la que arma paso1_remates.js), ENTRA a
// cada remate, lee sus lotes (con el mismo método de extraer.js: la variable
// `items` que viene dentro del HTML) y arma la LISTA FINAL DE VINILOS.
//
// El filtro de lotes es MÁS FINO que el de la home: la palabra "disco" sola no
// alcanza (existen "discos de freno", "disco rígido"). Se fija en el contexto:
// sellos discográficos, años, "LP", "vinilo", "long play", "33 RPM", o el
// formato "Artista - Título".
//
// Para cada vinilo devuelve: número de lote, artista y álbum (como figura en el
// título), sello y año (si aparecen), precio base, enlace a la imagen y enlace
// directo al lote. Agrupa todo por remate.
//
// CÓMO USARLO:
//   1) Primero correr el Paso 1 (deja remates-candidatos.json):
//        node paso1_remates.js
//   2) Después correr este:
//        node paso2_vinilos.js
//
//   (Para pruebas sin internet: si existe la variable de entorno CACHE_DIR, lee
//    las páginas de disco desde CACHE_DIR/remate-<id>.html en vez de bajarlas.)
//
// GENERA:
//   - vinilos-encontrados.json  -> resultado final, agrupado por remate.
// -----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.remotes.com.uy/';
const IMG_BASE = 'https://static3.remotes.com.uy/img/thumb/800/';
const CACHE_DIR = process.env.CACHE_DIR || null;
const ESPERA_MS = 800; // pausa entre pedidos, para no golpear el servidor

// --- Utilidades de texto ----------------------------------------------------

function normalizar(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Convierte entidades HTML comunes a texto normal (para nombres con tildes).
function decodeHtml(s) {
  if (!s) return '';
  const named = {
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
    Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
    ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
    amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
    laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–', deg: '°',
  };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in named ? named[name] : m));
}

// Saca el NOMBRE del remate del <title>: "Participá del remate de EMPRESA: NOMBRE".
// Devuelve la primera línea del nombre (un título corto y legible).
function extraerNombreRemate(html, fallback) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!m) return fallback || null;
  const t = decodeHtml(m[1]).trim();
  const mm = t.match(/remate de\s*.*?:\s*([\s\S]*)/i);
  const texto = (mm ? mm[1] : t).trim();
  const primeraLinea = texto.split(/\r?\n/)[0].trim();
  return primeraLinea || fallback || null;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Extraer los lotes (var items) del HTML de un remate --------------------

function extraerItems(html) {
  const marca = 'var items = ';
  const i = html.indexOf(marca);
  if (i < 0) return null;
  const start = html.indexOf('[', i);
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let p = start; p < html.length; p++) {
    const c = html[p];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = p; break; } }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

// Cuenta, de forma INDEPENDIENTE de la extracción, cuántos objetos-lote hay en
// el bloque `var items = [ ... ]` (contando el campo "identificador":). Sirve de
// control: si la extracción devuelve menos lotes que esto, algo se cortó.
function contarLotesEnHTML(html) {
  const i = html.indexOf('var items = ');
  if (i < 0) return null;
  const start = html.indexOf('[', i);
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let p = start; p < html.length; p++) {
    const c = html[p];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = p; break; } }
  }
  if (end < 0) return null;
  return (html.slice(start, end + 1).match(/"identificador":/g) || []).length;
}

// --- Filtro FINO de vinilos -------------------------------------------------

// Sellos discográficos conocidos (los que pidió Marcelo + algunos comunes).
const SELLOS = [
  'RCA', 'Odeon', 'Philips', 'CBS', 'Columbia', 'EMI', 'Polydor',
  'Continental', 'Sondor', 'Music Hall', 'Microfon', 'Fania', 'Decca',
  'Motown', 'Deutsche Grammophon', 'Clave', 'De la Planta', 'Ayui',
];

// Usos de "disco" que NO son vinilos (para no confundirnos).
const DISCO_FALSO = /disco[s]?\s+(duro[s]?|rigido[s]?|de\s+freno|de\s+corte|compacto[s]?|de\s+embrague|de\s+arranque|de\s+amoladora|diamantado[s]?|abrasivo[s]?|flexible[s]?|de\s+sierra|de\s+oro\b|de\s+arado|de\s+cardan|de\s+ceramica|de\s+bronce|de\s+metal|de\s+madera|de\s+piedra|solar)/i;

// Usos de "álbum" que NO son discos.
const ALBUM_FALSO = /album\s+de\s+(figuritas|fotos|foto|estampas|estampillas|autografos|sellos|postales|familiar|familia|recortes|figus|cromos|laminas)/i;

// Cosas que NO son discos: arte (óleos, acuarelas, cuadros) y cine/objetos
// (películas, súper 8, diapositivas, proyectores, chapitas, etc.). Si aparece
// alguno de estos, el lote se descarta (a menos que haya una señal FUERTE de
// vinilo, que se evalúa antes).
//
// OJO: acá van SOLO señales inequívocas del objeto físico. NO se incluyen
// palabras como "afiche", "folleto", "láminas", "dibujos", "carpeta" o "cinta",
// porque las descripciones de DISCOS suelen mencionarlas como extras del
// empaque (ej: "incluye afiche interno", "folleto con las letras", "dibujos de
// la portada") y estaban descartando discos reales por error. Los pósters,
// carpetas de láminas, etc. genuinos igual se rechazan porque no tienen ninguna
// señal de disco musical.
// (No se incluyen "película" ni "pintura" sueltas: aparecen en biografías de
//  discos —ej: "participó en películas", "pintura de la tapa"—. Los objetos de
//  cine reales se detectan por "súper 8"/"VHS"/"proyector"; las pinturas por
//  "óleo"/"acuarela"/"sobre tela|lienzo|durabor|...".)
const NO_DISCO = /\b(oleo|acuarela|serigraf\w*|xilograf\w*|litograf\w*|aguafuerte[s]?|oleografia[s]?|cuadro[s]?|cuadrito[s]?|gobelino[s]?|proyector\w*|diapositiva[s]?|videocaseter\w*|vhs|cassette[s]?|casete[s]?|compresor\w*|chapita[s]?|portarretrato[s]?|telefono[s]?|escanea)\b|\bsuper\s?8\b|\bcodigo\s+qr\b|\bsobre\s+(tela|lienzo|durabor|fibra|madera|carton|cartulina)\b/;

// Filatelia (álbumes de SELLOS/estampillas): NO son discos. Se detecta con
// frases específicas de sellos postales, sin tocar "sello discográfico".
const FILATELIA = /\b(filateli\w*|estampillas?|sellos\s+(coloniales|postales|conmemorativos|antiguos)|cientos\s+de\s+sellos|sellos\s+en\s+album|album\s+de\s+sellos|coleccion\s+de\s+sellos)\b/;

// Contexto musical CONFIABLE. Se usa para corroborar el formato "Artista -
// Título" y los sellos conocidos. A propósito NO incluye palabras ambiguas que
// también aparecen en antigüedades/bazar (ej: "conjunto", "banda", "tema",
// "canto", "coro", "música" sola), porque generaban falsos positivos (copas,
// juegos, etc.). Solo términos que casi siempre indican un disco musical.
const MUSICA_CTX = /(banda\s+sonora|soundtrack|varios\s+artistas|artistas\s+varios|long\s*play|\blp[s]?\b|vinilo|acetato|elepe|sello\s+discografic|discografi\w*|grandes\s+exitos|greatest\s+hits|recopilat\w*|recopilaci\w*|compilad\w*|nueva\s+cancion|(musica|cancion)\s+(popular|folclorica|folklorica|de\s+autor|tropical)|\bcanciones\b|folklor\w*|folclor\w*|cantauto\w*|cantante[s]?|compositor\w*|orquesta|sinfoni\w*|\bgrammy\b|\d+\s+discos|grabad[oa]\s+en\b[^.]{0,30}\b(19|20)\d\d)/;

// Equipos de sonido y MUEBLES (NO son discos): tocadiscos, mini componentes,
// disqueros, estanterías, etc. Si el lote es uno de estos y no trae una
// cantidad real de discos, se descarta.
const EQUIPO_O_MUEBLE = /(sintoamplificador|mini\s*componente|equipo\s+de\s+sonido|cassettero|pasacassette|bandeja\s+de\s+vinilo|tornamesa|giradiscos|amplificador|toca\s*discos|tocadiscos|wincofon|combinado\b|mueble|disquero|estanteria|estante\b|repisa|organizador|gabinete|porta\s*disco|revistero|biblioteca)/;

// Decide si un lote es un vinilo y explica por qué (motivos).
function analizarVinilo(titulo, descripcion) {
  const originalCase = `${titulo || ''}  ${descripcion || ''}`;
  const t = normalizar(originalCase);
  const motivos = [];

  // --- Señales FUERTES (con una sola alcanza) ---
  if (/\bvinilo[s]?\b/.test(t)) motivos.push('dice "vinilo"');
  if (/\blong\s*play\b/.test(t) || /\belepe[s]?\b/.test(t)) motivos.push('dice "long play"');
  if (/\blp[s]?\b/.test(t)) motivos.push('dice "LP"');
  if (/\bacetato\b/.test(t)) motivos.push('dice "acetato"');
  if (/\b(33|45|78)\s*rpm\b/.test(t)) motivos.push('menciona RPM');
  if (/disco[s]?\s+de\s+vinilo/.test(t)) motivos.push('"disco de vinilo"');
  if (/disco[s]?\s+de\s+pasta/.test(t)) motivos.push('"discos de pasta" (78 RPM)');
  if (/\bsello\s+discografic/.test(t)) motivos.push('menciona "sello discográfico"');
  const hayFuertes = motivos.length > 0;

  // --- Datos de contexto ---
  // "álbum" ahora es plural-aware: álbum / álbumes / albums.
  const tieneAlbum = /\balbum(es|s)?\b/.test(t) && !ALBUM_FALSO.test(t);
  const tieneDisco = /\bdisco[s]?\b/.test(t) && !DISCO_FALSO.test(t);
  const tieneMusicaCtx = MUSICA_CTX.test(t);
  const mAnio = originalCase.match(/\b(19[3-9]\d|20[0-2]\d)\b/);
  const anio = mAnio ? mAnio[1] : null;

  // Sello discográfico conocido (RCA, Odeon, Philips, etc.).
  const selloEncontrado = SELLOS.find((s) => {
    const re = new RegExp(`\\b${normalizar(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return re.test(t);
  });

  // Formato "Artista - Título" (o "Artista – Título"): un guión con espacios
  // cerca del comienzo. Sirve para discos descritos solo por artista+título
  // (sin la palabra "álbum"/"disco"), ej: "Serrat – Mediterráneo".
  // OJO: primero sacamos un posible prefijo de número de lote como
  // "L 335 - 15 piezas - ..." (que usan algunos remates), porque ese guión NO
  // separa artista de título y disparaba muchísimos falsos positivos.
  const tituloSinPrefijo = (titulo || '').replace(
    /^\s*(l\s*)?\d+[a-z]?\s*[-–—]\s*(\d+\s*(pieza|piezas|juego|unidad|unidades|gran\s+lote|lote)[^-–—]{0,15}[-–—]\s*)?/i, '');
  const formatoArtistaTitulo = /^\s*[^\n]{2,72}?\s[–—-]\s\S/.test(tituloSinPrefijo);

  const traeCantidadDiscos = /\b\d+\s+discos?\b/.test(t) ||
    /(lote|coleccion|coleccion\s+de|caja\s+con|caja\s+de|conjunto\s+de)\s+[^.]{0,25}disc/.test(t);

  const debug = {
    hayFuertes, tieneAlbum, tieneDisco, tieneMusicaCtx,
    anio: anio || null, sello: selloEncontrado || null,
    dash: formatoArtistaTitulo, noDisco: NO_DISCO.test(t),
  };

  // 1) DESCARTES claros PRIMERO: arte/cine/objetos, o equipos/muebles. Van
  //    ANTES de la señal fuerte para que, por ejemplo, un "Disquero" (mueble)
  //    que menciona "discos de vinilo" NO se cuele por decir "vinilo".
  if (NO_DISCO.test(t)) {
    debug.regla = 'RECHAZO: es arte/cine/objeto, no un disco';
    return { esVinilo: false, motivos: ['descartado: no es un disco (arte/cine/objeto)'], anio: null, sello: null, debug };
  }
  if (FILATELIA.test(t)) {
    debug.regla = 'RECHAZO: filatelia (álbum de sellos), no un disco';
    return { esVinilo: false, motivos: ['descartado: es filatelia (sellos), no un disco'], anio: null, sello: null, debug };
  }
  if (EQUIPO_O_MUEBLE.test(t) && !traeCantidadDiscos) {
    debug.regla = 'RECHAZO: equipo/mueble sin cantidad de discos';
    return { esVinilo: false, motivos: ['descartado: es un equipo/mueble, no un disco'], anio: null, sello: null, debug };
  }

  // 2) Señal FUERTE (vinilo/LP/RPM/acetato/disco de vinilo/pasta/sello
  //    discográfico): es un disco sí o sí.
  if (hayFuertes) {
    if (anio) motivos.push(`año ${anio}`);
    debug.regla = 'ACEPTA (señal fuerte): ' + motivos[0];
    return { esVinilo: true, motivos, anio, sello: selloEncontrado || null, debug };
  }

  // 3) SEÑALES DE DISCO MUSICAL (ya sabemos que no es arte/cine/equipo):
  //    - dice "álbum/álbumes"      (álbum musical; los "álbum de fotos/figuritas" ya se excluyeron)
  //    - dice "disco/discos"       (los usos mecánicos ya se excluyeron)
  //    - sello conocido + contexto musical
  //    - formato "Artista - Título" + contexto musical (ej: "Serrat – Mediterráneo")
  let regla = null;
  if (tieneAlbum) regla = 'dice "álbum"';
  else if (tieneDisco) regla = 'dice "disco"';
  else if (selloEncontrado && tieneMusicaCtx) regla = `sello ${selloEncontrado} + contexto musical`;
  else if (formatoArtistaTitulo && tieneMusicaCtx) regla = 'formato "Artista - Título" + contexto musical';

  if (regla) {
    motivos.push(regla);
    if (anio) motivos.push(`año ${anio}`);
    debug.regla = 'ACEPTA: ' + regla;
    const selloSalida = selloEncontrado && (tieneAlbum || tieneDisco || tieneMusicaCtx) ? selloEncontrado : null;
    return { esVinilo: true, motivos, anio, sello: selloSalida, debug };
  }

  debug.regla = 'RECHAZO: ninguna señal de disco';
  return { esVinilo: false, motivos: [], anio: null, sello: null, debug };
}

// --- Parseo best-effort de artista y álbum del título -----------------------

function extraerAlbum(titulo) {
  const s = (titulo || '').trim();
  // 1) Formato "Artista - Álbum": el álbum va después del guión (hasta el
  //    primer punto). Ej: "The Beatles - Rock 'N' Roll Music. (Doble LP.)".
  let m = s.match(/^[^\-–\n:]{2,45}?\s[–-]\s([^.\n]{2,80})/);
  if (m) return m[1].replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');
  // 2) Álbum entre comillas: "Dezembros", «...», “...” (lo usa, por ej., 7393).
  m = s.match(/["“«]([^"”»]{2,80})["”»]/);
  return m ? m[1].trim() : null;
}

// Palabras que NO son un nombre de artista (para descartar capturas erróneas).
const NO_ARTISTA = new Set([
  'uso', 'industria', 'argentina', 'uruguay', 'estado', 'oro', 'plata',
  'pasta', 'epoca', 'coleccion', 'marca', 'varios', 'vol', 'disco', 'album',
  'lp', 'ep', 'doble', 'simple', 'vinilo', 'nuevo', 'usado', 'origen',
]);

function limpiarArtista(txt) {
  const a = (txt || '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');
  if (a.length < 3) return null;
  if (/\d/.test(a)) return null; // descarta cosas como "13 discos"
  const palabras = a.split(' ');
  // Si es una sola palabra y está en la lista negra, descartar.
  if (palabras.length === 1 && NO_ARTISTA.has(normalizar(a))) return null;
  return a;
}

function extraerArtista(titulo) {
  const s = (titulo || '').trim();

  // 1) Formato "Artista - Título" o "Artista – Título" (lo usa, por ej., 7580).
  let m = s.match(/^([^\-–\n:]{2,45}?)\s[–-]\s/);
  if (m) { const a = limpiarArtista(m[1]); if (a) return a; }

  // 2) Artista entre paréntesis, ej: "Disco LP ( BEATLES) ..." (lo usa 7568).
  m = s.match(/\(\s*(\p{Lu}[\p{L} .&']{2,40}?)\s*\)/u);
  if (m && !/\b(lp|ep|rpm|doble|simple|vinilo|disco|album)\b/i.test(m[1])) {
    const a = limpiarArtista(m[1]); if (a) return a;
  }

  // 3) "... de [la/el/…] [descriptores] Nombre Propio ..." (lo usa 7393).
  const desc = '(?:la|el|los|las|un|una|de|del|cantante|banda|grupo|conjunto|d[uú]o|' +
    'artista|legendari[oa]|m[ií]tic[oa]|reconocid[oa]|c[eé]lebre|gran|pop|rock|' +
    'melodic[oa]|mel[oó]dic[oa]|folclorista|folklorista|uruguay[oa]|argentin[oa]|' +
    'brasile[ñn][oa]|espa[ñn]ol[a]?|italian[oa]|frances[a]?|solista|m[uú]sico)';
  const re = new RegExp(
    `\\bde\\s+(?:${desc}\\s+)*(\\p{Lu}[\\p{L}.]+(?:\\s+\\p{Lu}[\\p{L}.]+){0,3})`, 'u'
  );
  m = s.match(re);
  if (m) { const a = limpiarArtista(m[1]); if (a) return a; }

  return null;
}

// --- Obtener el HTML de un remate (cache o en vivo) -------------------------

async function obtenerRemateHtml(id) {
  if (CACHE_DIR) {
    const f = path.join(CACHE_DIR, `remate-${id}.html`);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    throw new Error(`no está en cache: ${f}`);
  }
  const url = `${BASE_URL}participar/remate/${id}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

// --- Programa principal -----------------------------------------------------

// Solo corre el proceso completo cuando se ejecuta directamente
// (node paso2_vinilos.js). Si se importa con require(), no corre nada, así se
// pueden reutilizar las funciones de análisis (por ej. para diagnóstico/tests).
if (require.main === module) principal();

async function principal() {
  // 1) Cargar candidatos del Paso 1.
  if (!fs.existsSync('remates-candidatos.json')) {
    console.error('No encuentro remates-candidatos.json.');
    console.error('Corré primero:  node paso1_remates.js');
    process.exit(1);
  }
  const candidatos = JSON.parse(fs.readFileSync('remates-candidatos.json', 'utf8'));

  // 2) Aplicar filtro de fecha (solo los que no cerraron) y ordenar por cierre.
  const ahora = Math.floor(Date.now() / 1000);
  const activos = candidatos
    .filter((r) => r.fechaDudosa || !r.timestamp || r.timestamp >= ahora)
    .sort((a, b) => (a.timestamp || Infinity) - (b.timestamp || Infinity));

  console.error(`Remates candidatos a revisar: ${activos.length}\n`);

  const resultado = [];
  let totalVinilos = 0;
  const alertasExtraccion = []; // avisos si se pierden lotes al extraer

  // 3) Entrar a cada remate y buscar vinilos.
  for (const rem of activos) {
    process.stderr.write(`Revisando remate ${rem.id} (${rem.empresa || '?'})... `);
    let html;
    try {
      html = await obtenerRemateHtml(rem.id);
    } catch (e) {
      console.error(`ERROR: ${e.message}`);
      resultado.push({ ...datosRemate(rem, rem.descripcion), error: e.message, vinilos: [] });
      continue;
    }

    const nombre = extraerNombreRemate(html, rem.descripcion);

    const items = extraerItems(html);
    if (!items) {
      console.error('sin lotes legibles');
      resultado.push({ ...datosRemate(rem, nombre), error: 'no se pudo leer var items', vinilos: [] });
      continue;
    }

    // CHEQUEO PERMANENTE: ¿la extracción trajo TODOS los lotes del remate?
    // Si trae menos que los que el HTML declara, avisamos (y al final el
    // proceso termina con error para que la corrida diaria se ponga en rojo).
    const esperados = contarLotesEnHTML(html);
    if (esperados != null && items.length < esperados) {
      const msg = `remate ${rem.id}: se extrajeron ${items.length} lotes pero el HTML tiene ${esperados}`;
      alertasExtraccion.push(msg);
      process.stderr.write(`⚠️ EXTRACCIÓN INCOMPLETA (${items.length}/${esperados}) `);
    }

    const vinilos = [];
    for (const it of items) {
      const an = analizarVinilo(it.titulo, it.descripcion);
      if (!an.esVinilo) continue;
      const foto = Array.isArray(it.foto) && it.foto.length ? it.foto[0] : null;
      vinilos.push({
        id: it.id, // id estable del lote (para guardar destacados que sobrevivan actualizaciones)
        lote: it.lote,
        titulo: it.titulo,
        artista: extraerArtista(it.titulo),
        album: extraerAlbum(it.titulo),
        sello: an.sello,
        anio: an.anio,
        moneda: it.moneda,
        base: Number(it.base),
        // Oferta vigente al momento de la corrida: it.precio es la puja más
        // alta (0 si nadie ofertó). Si hay oferta la guardamos; si no, null y
        // la app muestra el precio base.
        oferta: Number(it.precio) > 0 ? Number(it.precio) : null,
        imagen: foto ? IMG_BASE + foto : (it.thumb || null),
        enlaceLote: `${BASE_URL}participar/remate/${rem.id}?lote=${it.lote}`,
        motivos: an.motivos,
      });
    }

    console.error(`${items.length} lotes, ${vinilos.length} vinilos`);
    totalVinilos += vinilos.length;
    resultado.push({ ...datosRemate(rem, nombre), totalLotes: items.length, vinilos });

    if (!CACHE_DIR) await dormir(ESPERA_MS);
  }

  // 4) Guardar y mostrar.
  // Se envuelve en { generado, remates }: "generado" es la hora de esta corrida
  // (la app la muestra como "ofertas al ..."). La app también acepta el formato
  // viejo (un array suelto) por compatibilidad.
  const salida = { generado: new Date().toISOString(), remates: resultado };
  fs.writeFileSync('vinilos-encontrados.json', JSON.stringify(salida, null, 2));

  console.log('\n' + '='.repeat(72));
  console.log(`RESULTADO: ${totalVinilos} vinilos en ${resultado.filter(r => r.vinilos.length).length} remates`);
  console.log('='.repeat(72));

  // Alerta permanente de extracción: si algún remate perdió lotes, avisamos
  // fuerte y terminamos con error (exit 1). En la actualización diaria (GitHub
  // Actions) esto hace que la corrida se ponga en ROJO y NO se publiquen datos
  // incompletos: quedan los del día anterior hasta revisarlo.
  if (alertasExtraccion.length) {
    console.error('\n' + '!'.repeat(72));
    console.error(`⚠️  ALERTA: extracción incompleta en ${alertasExtraccion.length} remate(s):`);
    alertasExtraccion.forEach((m) => console.error('   - ' + m));
    console.error('No se publican datos incompletos. Revisar el extractor (var items).');
    console.error('!'.repeat(72));
    process.exitCode = 1;
  }

  for (const r of resultado) {
    if (!r.vinilos.length) continue;
    console.log(`\n■ REMATE ${r.id} — ${r.empresa || '(sin empresa)'}`);
    console.log(`  Lugar:  ${r.lugar || '(sin lugar)'}`);
    console.log(`  Fecha:  ${r.fecha || '(sin fecha)'}${r.fechaDudosa ? '  ⚠️ FECHA DUDOSA' : ''}`);
    console.log(`  Remate: ${r.url}`);
    console.log(`  Vinilos (${r.vinilos.length}):`);
    for (const v of r.vinilos) {
      const meta = [v.artista, v.album].filter(Boolean).join(' — ');
      const extra = [v.sello, v.anio].filter(Boolean).join(', ');
      console.log(`    · Lote ${v.lote}: ${meta || v.titulo}${extra ? `  (${extra})` : ''}  [base ${v.moneda}${v.base}]`);
      console.log(`        ${v.enlaceLote}`);
    }
  }
  console.log('\nGuardado: vinilos-encontrados.json');
}

// Exportar funciones para diagnóstico / tests (no afecta la ejecución normal).
module.exports = {
  extraerItems, analizarVinilo, extraerArtista, extraerAlbum,
  SELLOS, DISCO_FALSO, ALBUM_FALSO, MUSICA_CTX, EQUIPO_O_MUEBLE,
};

function datosRemate(rem, nombre) {
  return {
    id: rem.id,
    nombre: nombre || rem.descripcion || null,
    empresa: rem.empresa,
    departamento: rem.departamento,
    lugar: rem.lugar,
    fecha: rem.fecha,
    fechaISO: rem.fechaISO,
    timestamp: rem.timestamp,
    fechaDudosa: !!rem.fechaDudosa,
    url: rem.url,
  };
}
