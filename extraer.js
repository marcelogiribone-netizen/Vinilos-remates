// extraer.js
// -----------------------------------------------------------------------------
// Lee la página de un remate de remotes.com.uy y saca la lista de lotes.
//
// El sitio guarda TODOS los lotes dentro del HTML, en una variable de
// JavaScript llamada `items` (un JSON). No hace falta ninguna API ni ejecutar
// JavaScript: alcanza con descargar la página y leer esa variable.
//
// USO:
//   1) Bajar la página del remate (desde la terminal):
//        curl -s "https://www.remotes.com.uy/participar/remate/7393" > remate.html
//   2) Extraer los lotes:
//        node extraer.js remate.html
//
//   Genera un archivo lotes.json con la lista limpia y muestra en pantalla
//   los lotes y cuáles parecen vinilos/discos.
// -----------------------------------------------------------------------------

const fs = require('fs');

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: node extraer.js <archivo.html>');
  process.exit(1);
}

const html = fs.readFileSync(archivo, 'utf8');

// 1) Ubicar el comienzo de la variable `items`.
const marca = 'var items = ';
const i = html.indexOf(marca);
if (i < 0) {
  console.error('No se encontró "var items =" en el HTML.');
  console.error('¿Seguro que es la página de un remate individual?');
  process.exit(1);
}

// 2) Leer el array JSON desde el "[" hasta su "]" de cierre (balanceado),
//    respetando las comillas para no cortar en un "]" que esté dentro de texto.
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

let items;
try {
  items = JSON.parse(html.slice(start, end + 1));
} catch (e) {
  console.error('No se pudo interpretar la lista de lotes:', e.message);
  process.exit(1);
}

// 3) Armar una versión limpia con los campos útiles y guardarla.
const limpio = items.map((it) => ({
  lote: it.lote,
  titulo: it.titulo,
  descripcion: it.descripcion,
  moneda: it.moneda,
  base: it.base,
  cantidad: it.cantidad,
  remate: it.remate,
  id: it.id,
}));
fs.writeFileSync('lotes.json', JSON.stringify(limpio, null, 2));

// 4) Mostrar en pantalla.
console.log(`Total de lotes: ${items.length}\n`);
for (const it of limpio) {
  const desc = (it.descripcion || '').replace(/\s+/g, ' ').trim();
  console.log(
    `Lote ${it.lote}: ${it.titulo}` +
    (desc ? `  |  ${desc}` : '') +
    `  [base ${it.moneda}${it.base}]`
  );
}

// 5) Detección simple de vinilos (demostración).
//    OJO: este filtro es un punto de partida. Palabras como "disco" o "álbum"
//    pueden dar falsos positivos (ej: "disco duro", "disco de freno") o
//    falsos negativos. Conviene afinarlo en la próxima etapa del proyecto.
const POSITIVAS = /\b(vinilo|long\s*play|acetato|LP)\b|disco de vinilo|\bdisco\b|\bálbum\b|\balbum\b|sello (discográfico|discografico|rca|odeon|cbs|philips)/i;
const NEGATIVAS = /disco (duro|rígido|rigido|de freno|compacto|de embrague)|discoteca/i;
const esVinilo = (t) => POSITIVAS.test(t) && !NEGATIVAS.test(t);
const vinilos = limpio.filter((it) =>
  esVinilo(`${it.titulo || ''} ${it.descripcion || ''}`)
);

console.log(`\n--- Posibles vinilos/discos: ${vinilos.length} ---`);
for (const v of vinilos) {
  console.log(`  Lote ${v.lote}: ${v.titulo}  [base ${v.moneda}${v.base}]`);
}
