/* Generador de los íconos de DigBin — DOS archivos, UNA sola fuente.
 *
 * IMPORTANTE (no volver a unificar): el ícono del sistema y el vinilo del splash
 * de la app son DOS archivos distintos, generados de la MISMA fuente
 * (icon-source.svg), y solo cambia el MARGEN:
 *
 *   - icon-192.png / icon-512.png  -> el vinilo al 65% del cuadrado, centrado,
 *     con el fondo (#1a1618) llenando el resto. Es el ícono del manifest
 *     (purpose "any maskable"). El margen hace que, cuando Android amplía y
 *     recorta el ícono en su splash, el vinilo ENTERO sobreviva (no se come los
 *     surcos de los bordes).
 *
 *   - logo-vinilo-512.png  -> el MISMO vinilo a sangre (sin margen). Lo usa la
 *     animación / splash de la app (LOGO_VINILO en app.js). Se dibuja al tamaño
 *     que queda después del recorte de Android (ver --splash-vinilo en styles.css).
 *
 * Si se cambia el dibujo, se edita SOLO icon-source.svg y se corre este script.
 * No crear un icono con otro dibujo.
 *
 * Uso:  npm install --no-save playwright-core   &&   node app/icons/generar-iconos.js
 * (usa el Chromium de /opt/pw-browsers si está; si no, el que traiga playwright)
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SVG = fs.readFileSync(path.join(DIR, 'icon-source.svg'), 'utf8');
const MARGEN_ICONO = 0.65;   // el vinilo ocupa el 65% del cuadrado del ícono
const FONDO = '#1a1618';     // debe coincidir con background_color del manifest

const execPath = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

async function render(browser, html, size, out) {
  const p = await (await browser.newContext({ viewport: { width: size, height: size } })).newPage();
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(DIR, out) });
  await p.close();
  console.log('  ->', out, '(' + size + 'px)');
}

(async () => {
  const b = await chromium.launch(execPath ? { executablePath: execPath } : {});

  // 1) Logo a sangre (sin margen) para el splash/animación.
  console.log('Logo del splash (a sangre):');
  const htmlLleno = `<style>*{margin:0}svg{width:100vw;height:100vh;display:block}</style>${SVG}`;
  await render(b, htmlLleno, 512, 'logo-vinilo-512.png');

  // 2) Ícono con margen: el mismo vinilo al 65%, centrado sobre el fondo.
  console.log('Ícono del sistema (vinilo al ' + (MARGEN_ICONO * 100) + '%):');
  for (const size of [512, 192]) {
    const v = Math.round(size * MARGEN_ICONO);
    const html = `<style>*{margin:0}
      .c{width:${size}px;height:${size}px;background:${FONDO};display:flex;align-items:center;justify-content:center}
      .v{width:${v}px;height:${v}px}.v svg{width:100%;height:100%;display:block}</style>
      <div class="c"><div class="v">${SVG}</div></div>`;
    await render(b, html, size, 'icon-' + size + '.png');
  }

  await b.close();
  console.log('Listo. Recordá subir la versión del service worker (app/sw.js).');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
