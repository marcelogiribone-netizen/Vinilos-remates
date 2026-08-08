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

// --- Filtro FINO de vinilos -------------------------------------------------

// Sellos discográficos conocidos (los que pidió Marcelo + algunos comunes).
const SELLOS = [
  'RCA', 'Odeon', 'Philips', 'CBS', 'Columbia', 'EMI', 'Polydor',
  'Continental', 'Sondor', 'Music Hall', 'Microfon', 'Fania', 'Decca',
  'Motown', 'Deutsche Grammophon', 'Clave', 'De la Planta', 'Ayui',
];

// Usos de "disco" que NO son vinilos (para no confundirnos).
const DISCO_FALSO = /disco[s]?\s+(duro[s]?|rigido[s]?|de\s+freno|de\s+corte|compacto[s]?|de\s+embrague|de\s+arranque|de\s+amoladora|diamantado[s]?|abrasivo[s]?|flexible[s]?|de\s+sierra|de\s+oro\b|de\s+arado|de\s+cardan)/i;

// Usos de "álbum" que NO son discos.
const ALBUM_FALSO = /album\s+de\s+(figuritas|fotos|foto|estampas|autografos|sellos|postales|familiar|recortes|figus|cromos|laminas)/i;

// Contexto musical (palabras que confirman que hablamos de un disco musical).
// NO incluye "disco"/"álbum" sueltos a propósito (esos son señales aparte).
const MUSICA_CTX = /(vinilo|long\s*play|\blp[s]?\b|elepe|\b(33|45|78)\s*rpm\b|acetato|discografic|grabaci|sencillo|banda\s+sonora|soundtrack|\bcompilad|\brecopilaci|varios\s+artistas|artistas\s+varios|grandes\s+exitos|\d+\s+discos)/;

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
  const tieneDisco = /\bdisco[s]?\b/.test(t) && !DISCO_FALSO.test(t);
  const tieneAlbum = /\balbum\b/.test(t) && !ALBUM_FALSO.test(t);
  const tieneMusicaCtx = MUSICA_CTX.test(t);
  const mAnio = originalCase.match(/\b(19[3-9]\d|20[0-2]\d)\b/);
  const anio = mAnio ? mAnio[1] : null;

  // Sello discográfico conocido (RCA, Odeon, Philips, etc.).
  const selloEncontrado = SELLOS.find((s) => {
    const re = new RegExp(`\\b${normalizar(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return re.test(t);
  });

  // --- Señales que dependen del CONTEXTO ---
  // Un sello conocido cuenta SOLO si hay contexto de disco/álbum/música.
  // (Así "Juguera Philips" o "Lámpara Philips" no se cuelan.)
  const selloConContexto =
    selloEncontrado && (tieneDisco || tieneAlbum || tieneMusicaCtx);
  if (selloConContexto) motivos.push(`sello ${selloEncontrado} + contexto`);

  // Si NO hubo señal fuerte ni sello con contexto, exigimos combinación:
  //  - "álbum" + (sello conocido O año)   -> ej: 'Álbum ... de 1970'
  //  - "disco" + "álbum"                  -> ej: 'disco álbum de ...'
  //  - "disco"/"álbum" + contexto musical -> por si acaso
  if (!hayFuertes && !selloConContexto) {
    if (tieneAlbum && (selloEncontrado || anio)) {
      motivos.push('"álbum" + ' + (selloEncontrado ? `sello ${selloEncontrado}` : `año ${anio}`));
    } else if (tieneDisco && tieneAlbum) {
      motivos.push('"disco" + "álbum"');
    } else if ((tieneDisco || tieneAlbum) && tieneMusicaCtx) {
      motivos.push('disco/álbum + contexto musical');
    }
  }

  let esVinilo = motivos.length > 0;

  // Descarte de EQUIPOS y MUEBLES: si es un tocadiscos / mini componente /
  // disquero / estantería, y NO trae una CANTIDAD real de discos, se descarta.
  // (Ojo: acá "trae discos" exige un número — ej "34 discos" — o una colección
  //  explícita; que el texto solo mencione "discos de vinilo" no alcanza,
  //  porque un mueble puede decir "ranuras para discos de vinilo".)
  const traeCantidadDiscos = /\b\d+\s+discos?\b/.test(t) ||
    /(lote|coleccion|coleccion\s+de|caja\s+con|caja\s+de|conjunto\s+de)\s+[^.]{0,25}disc/.test(t);
  if (esVinilo && EQUIPO_O_MUEBLE.test(t) && !traeCantidadDiscos) {
    return { esVinilo: false, motivos: ['descartado: es un equipo/mueble, no un disco'], anio: null, sello: null };
  }

  // Info extra (no decide, solo describe) cuando ya es vinilo.
  if (esVinilo && anio) motivos.push(`año ${anio}`);

  return { esVinilo, motivos, anio, sello: selloConContexto ? selloEncontrado : (esVinilo ? selloEncontrado : null) };
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
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (detector-vinilos)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

// --- Programa principal -----------------------------------------------------

(async () => {
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

  // 3) Entrar a cada remate y buscar vinilos.
  for (const rem of activos) {
    process.stderr.write(`Revisando remate ${rem.id} (${rem.empresa || '?'})... `);
    let html;
    try {
      html = await obtenerRemateHtml(rem.id);
    } catch (e) {
      console.error(`ERROR: ${e.message}`);
      resultado.push({ ...datosRemate(rem), error: e.message, vinilos: [] });
      continue;
    }

    const items = extraerItems(html);
    if (!items) {
      console.error('sin lotes legibles');
      resultado.push({ ...datosRemate(rem), error: 'no se pudo leer var items', vinilos: [] });
      continue;
    }

    const vinilos = [];
    for (const it of items) {
      const an = analizarVinilo(it.titulo, it.descripcion);
      if (!an.esVinilo) continue;
      const foto = Array.isArray(it.foto) && it.foto.length ? it.foto[0] : null;
      vinilos.push({
        lote: it.lote,
        titulo: it.titulo,
        artista: extraerArtista(it.titulo),
        album: extraerAlbum(it.titulo),
        sello: an.sello,
        anio: an.anio,
        moneda: it.moneda,
        base: Number(it.base),
        imagen: foto ? IMG_BASE + foto : (it.thumb || null),
        enlaceLote: `${BASE_URL}participar/remate/${rem.id}?lote=${it.lote}`,
        motivos: an.motivos,
      });
    }

    console.error(`${items.length} lotes, ${vinilos.length} vinilos`);
    totalVinilos += vinilos.length;
    resultado.push({ ...datosRemate(rem), totalLotes: items.length, vinilos });

    if (!CACHE_DIR) await dormir(ESPERA_MS);
  }

  // 4) Guardar y mostrar.
  fs.writeFileSync('vinilos-encontrados.json', JSON.stringify(resultado, null, 2));

  console.log('\n' + '='.repeat(72));
  console.log(`RESULTADO: ${totalVinilos} vinilos en ${resultado.filter(r => r.vinilos.length).length} remates`);
  console.log('='.repeat(72));

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
})();

function datosRemate(rem) {
  return {
    id: rem.id,
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
