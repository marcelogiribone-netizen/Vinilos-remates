// paso1_remates.js
// -----------------------------------------------------------------------------
// PASO 1 del detector de vinilos de remotes.com.uy
//
// Lee la PÁGINA PRINCIPAL (home) del sitio, arma la lista de TODOS los remates
// que aparecen ahí (nombre/empresa, lugar, fecha y hora, y enlace), y marca
// como "candidatos" los que tienen palabras clave relacionadas con vinilos,
// discos, música, colección, antigüedades, etc.
//
// IMPORTANTE: este paso NO entra a cada remate ni lee sus lotes. Solo mira la
// home para decidir a qué remates conviene entrar después (eso será el Paso 2).
//
// CÓMO USARLO:
//   Opción A (baja la home en vivo):
//       node paso1_remates.js
//   Opción B (usa un archivo HTML ya descargado, por ej. con curl):
//       curl -s "https://www.remotes.com.uy/" > home.html
//       node paso1_remates.js home.html
//
// GENERA dos archivos:
//   - remates-candidatos.json  -> solo los remates que probablemente tengan
//                                 vinilos (los que pasan el filtro).
//   - remates-todos.json       -> todos los remates de la home (por si querés
//                                 revisarlos a mano).
// Y muestra en pantalla la lista de candidatos.
// -----------------------------------------------------------------------------

const fs = require('fs');

const HOME_URL = 'https://www.remotes.com.uy/';
const BASE_URL = 'https://www.remotes.com.uy/';

// Palabras clave para marcar candidatos. Filtro AMPLIO a propósito: preferimos
// que traiga de más y descartar a mano, antes que perdernos un remate con vinilos.
const PALABRAS_CLAVE = [
  'vinilo', 'vinilos', 'disco', 'discos', 'lp', 'long play', 'album',
  'musica', 'tocadiscos', 'coleccion', 'coleccionable', 'coleccionables',
  'antiguedad', 'antiguedades', 'multirubro', 'sucesion',
];

// --- Utilidades -------------------------------------------------------------

// Saca los acentos y pasa a minúsculas, para comparar sin problemas de tildes
// (así "música" == "musica", "antigüedades" == "antiguedades", etc.).
function normalizar(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita las marcas de acento
    .toLowerCase();
}

// Convierte las entidades HTML más comunes (&aacute;, &oacute;, &amp;, etc.)
// a texto normal, y limpia espacios de más.
function decodeHtml(s) {
  if (!s) return '';
  const named = {
    aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
    Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
    ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
    agrave: 'à', egrave: 'è', ordf: 'ª', ordm: 'º', deg: '°',
    amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
    laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in named ? named[name] : m))
    .replace(/\s+/g, ' ')
    .trim();
}

// Formatea un timestamp Unix (segundos) a fecha y hora de Uruguay.
function formatearFecha(ts) {
  if (!ts) return { texto: null, iso: null, timestamp: null };
  const d = new Date(ts * 1000);
  let texto = null;
  try {
    texto = new Intl.DateTimeFormat('es-UY', {
      timeZone: 'America/Montevideo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  } catch (e) {
    texto = d.toISOString();
  }
  return { texto, iso: d.toISOString(), timestamp: ts };
}

// --- Extracción de la home --------------------------------------------------

function extraerRemates(html) {
  // Cada remate está dentro de un <a class="selectRemateLabel ..." href="...">
  const bloques = html.split('<a class="selectRemateLabel').slice(1);
  const remates = [];

  for (const raw of bloques) {
    const fin = raw.indexOf('</a>');
    const b = fin >= 0 ? raw.slice(0, fin) : raw;

    const mId = b.match(/href="participar\/remate\/(\d+)"/);
    if (!mId) continue;
    const id = mId[1];

    // Empresa rematadora: el primer <p>Texto</p> del bloque.
    const mEmpresa = b.match(/<p>([^<]+)<\/p>/);
    const empresa = mEmpresa ? decodeHtml(mEmpresa[1]) : null;

    // Departamento: el badge azul.
    const mBadge = b.match(/badge-info">([^<]+)</);
    const departamento = mBadge ? decodeHtml(mBadge[1]) : null;

    // Descripción del remate: el <h4>.
    const mDesc = b.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
    const descripcion = mDesc ? decodeHtml(mDesc[1].replace(/<[^>]+>/g, ' ')) : '';

    // "Dónde": ciudad + departamento (ej: "SALTO, SALTO").
    const mDonde = b.match(/nde:<\/strong>\s*([\s\S]*?)<br/i);
    const lugar = mDonde
      ? decodeHtml(mDonde[1].replace(/<[^>]+>/g, ' '))
      : departamento;

    // Fecha/hora: timestamp Unix.
    const mTs = b.match(/class="timestamp">(\d+)</);
    const fecha = formatearFecha(mTs ? parseInt(mTs[1], 10) : null);

    // Teléfono (opcional).
    const mTel = b.match(/fono:<\/strong>\s*([\s\S]*?)<br/i);
    const telefono = mTel ? decodeHtml(mTel[1].replace(/<[^>]+>/g, ' ')) : null;

    // Rematador (opcional).
    const mRematador = b.match(/Remata:<\/strong>\s*([\s\S]*?)(?:<span|<br|<\/p)/i);
    const rematador = mRematador ? decodeHtml(mRematador[1].replace(/<[^>]+>/g, ' ')) : null;

    remates.push({
      id,
      empresa,
      departamento,
      lugar,
      descripcion,
      fecha: fecha.texto,
      fechaISO: fecha.iso,
      timestamp: fecha.timestamp,
      telefono,
      rematador,
      url: `${BASE_URL}participar/remate/${id}`,
    });
  }
  return remates;
}

// Decide si un remate es "candidato" y qué palabras clave coincidieron.
function coincidencias(remate) {
  const texto = normalizar(
    `${remate.empresa || ''} ${remate.descripcion || ''} ${remate.rematador || ''}`
  );
  const encontradas = [];
  for (const kw of PALABRAS_CLAVE) {
    // \b (borde de palabra) para no confundir, por ej. "lp" dentro de otra palabra.
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(texto)) encontradas.push(kw);
  }
  return encontradas;
}

// --- Programa principal -----------------------------------------------------

async function obtenerHtml() {
  const archivo = process.argv[2];
  if (archivo) {
    console.error(`Leyendo la home desde el archivo: ${archivo}`);
    return fs.readFileSync(archivo, 'utf8');
  }
  console.error(`Descargando la home en vivo: ${HOME_URL}`);
  const r = await fetch(HOME_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (detector-vinilos)' },
  });
  if (!r.ok) throw new Error(`La home respondió HTTP ${r.status}`);
  return await r.text();
}

(async () => {
  let html;
  try {
    html = await obtenerHtml();
  } catch (e) {
    console.error('\nNo pude obtener la home:', e.message);
    console.error('Probá bajarla con curl y pasarla como archivo:');
    console.error('  curl -s "https://www.remotes.com.uy/" > home.html');
    console.error('  node paso1_remates.js home.html');
    process.exit(1);
  }

  const todos = extraerRemates(html);

  // Marcar candidatos.
  const candidatos = [];
  for (const r of todos) {
    const kw = coincidencias(r);
    if (kw.length > 0) {
      candidatos.push({ ...r, palabrasClave: kw });
    }
  }

  // Ordenar por fecha (los más próximos primero).
  const porFecha = (a, b) => (a.timestamp || 0) - (b.timestamp || 0);
  todos.sort(porFecha);
  candidatos.sort(porFecha);

  // Guardar resultados.
  fs.writeFileSync('remates-todos.json', JSON.stringify(todos, null, 2));
  fs.writeFileSync('remates-candidatos.json', JSON.stringify(candidatos, null, 2));

  // Mostrar en pantalla.
  console.log(`\nRemates encontrados en la home: ${todos.length}`);
  console.log(`Remates CANDIDATOS (con palabras clave): ${candidatos.length}\n`);
  console.log('='.repeat(70));
  for (const r of candidatos) {
    console.log(`\n[Remate ${r.id}] ${r.empresa || '(sin empresa)'}`);
    console.log(`  Lugar:  ${r.lugar || r.departamento || '(sin lugar)'}`);
    console.log(`  Fecha:  ${r.fecha || '(sin fecha)'}`);
    console.log(`  Coincide por: ${r.palabrasClave.join(', ')}`);
    const desc = (r.descripcion || '').slice(0, 160);
    console.log(`  Descripción: ${desc}${(r.descripcion || '').length > 160 ? '…' : ''}`);
    console.log(`  Enlace: ${r.url}`);
  }
  console.log('\n' + '='.repeat(70));
  console.log('Guardado: remates-candidatos.json y remates-todos.json');
})();
