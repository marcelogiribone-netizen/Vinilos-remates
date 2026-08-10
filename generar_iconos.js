// generar_iconos.js
// -----------------------------------------------------------------------------
// Regenera los PNG del ícono de DigBin (192 y 512) a partir del archivo fuente
// app/icons/icon-source.svg (un SVG autocontenido, con la fuente cursiva
// "Great Vibes" embebida en base64, así se puede editar/abrir en cualquier
// navegador sin depender de internet).
//
// El ícono es: funda roja (vértices) con el vinilo asomando ~1/4, y el
// monograma "DB" en cursiva (Great Vibes) color crema, con una rúbrica de
// firma (subrayado + acento corto) debajo.
//
// USO (requiere Node y playwright-core, que ya se usa en el proyecto para
// renderizar con el Chromium del entorno):
//     node generar_iconos.js
//
// Si solo querés EDITAR el diseño, abrí app/icons/icon-source.svg en un editor
// o navegador: ahí están las medidas, colores y el trazo de la rúbrica.
// -----------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const SVG = path.join(__dirname, 'app', 'icons', 'icon-source.svg');
const OUT = path.join(__dirname, 'app', 'icons');

(async () => {
  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch (e) {
    console.error('Falta playwright-core. Instalá con:  npm i -D playwright-core');
    console.error('(En este entorno el navegador ya está en /opt/pw-browsers.)');
    process.exit(1);
  }
  const svg = fs.readFileSync(SVG, 'utf8');
  const exe = process.env.CHROME_PATH ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
  for (const size of [192, 512]) {
    const p = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
    await p.setViewportSize({ width: size, height: size });
    const doc = svg.replace('width="512"', `width="${size}"`).replace('height="512"', `height="${size}"`);
    await p.setContent('<!DOCTYPE html><body style="margin:0;background:#fff">' + doc + '</body>', { waitUntil: 'load' });
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, `icon-${size}.png`), clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
    console.log(`icon-${size}.png regenerado`);
  }
  await b.close();
})();
