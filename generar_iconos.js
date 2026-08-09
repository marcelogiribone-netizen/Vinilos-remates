// Genera el ícono de DigBin: un cajón de discos (bin) con vinilos, y un disco
// saliendo (la idea de "revolver el cajón"). PNG sin librerías externas.
const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function dibujar(S) {
  const buf = Buffer.alloc(S * S * 4);
  function px(x, y, c) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const a = c[3] == null ? 255 : c[3];
    if (a >= 255) { buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255; return; }
    // mezcla alfa sobre lo existente
    const ia = 255 - a;
    buf[i] = (c[0] * a + buf[i] * ia) / 255;
    buf[i + 1] = (c[1] * a + buf[i + 1] * ia) / 255;
    buf[i + 2] = (c[2] * a + buf[i + 2] * ia) / 255;
    buf[i + 3] = 255;
  }
  const F = (f) => Math.round(f * S);
  function rect(x0, y0, x1, y1, c) { for (let y = F(y0); y < F(y1); y++) for (let x = F(x0); x < F(x1); x++) px(x, y, c); }
  function roundRect(x0, y0, x1, y1, rad, c) {
    const X0 = F(x0), Y0 = F(y0), X1 = F(x1), Y1 = F(y1), R = F(rad);
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      let dx = 0, dy = 0;
      if (x < X0 + R && y < Y0 + R) { dx = X0 + R - x; dy = Y0 + R - y; }
      else if (x > X1 - R - 1 && y < Y0 + R) { dx = x - (X1 - R - 1); dy = Y0 + R - y; }
      else if (x < X0 + R && y > Y1 - R - 1) { dx = X0 + R - x; dy = y - (Y1 - R - 1); }
      else if (x > X1 - R - 1 && y > Y1 - R - 1) { dx = x - (X1 - R - 1); dy = y - (Y1 - R - 1); }
      if (dx * dx + dy * dy <= R * R) px(x, y, c);
    }
  }
  function circle(cx, cy, r, c) {
    const CX = cx * S, CY = cy * S, R = r * S;
    for (let y = Math.floor(CY - R); y <= CY + R; y++) for (let x = Math.floor(CX - R); x <= CX + R; x++) {
      const dx = x + .5 - CX, dy = y + .5 - CY;
      if (dx * dx + dy * dy <= R * R) px(x, y, c);
    }
  }

  // Paleta
  const bg = [181, 52, 31];        // rojo de marca
  const woodFront = [150, 92, 40]; // frente del cajón
  const woodBack = [176, 112, 54]; // borde trasero (más claro)
  const woodLip = [110, 66, 30];   // sombra/labio inferior
  const sleeves = [
    [243, 231, 206], // crema
    [46, 140, 134],  // teal
    [242, 169, 0],   // ámbar
    [228, 87, 46],   // coral
  ];
  const vinyl = [26, 22, 24], groove = [70, 64, 66], label = [242, 169, 0], hole = [40, 30, 25];

  // Fondo
  rect(0, 0, 1, 1, bg);

  // Borde trasero del cajón (para que los discos "salgan" de adentro)
  roundRect(0.16, 0.40, 0.84, 0.56, 0.03, woodBack);

  // Discos (lomos) parados dentro del cajón
  var xs = [0.23, 0.373, 0.516, 0.659], w = 0.11;
  var tops = [0.32, 0.30, 0.33, 0.31];
  for (var i = 0; i < 4; i++) {
    roundRect(xs[i], tops[i], xs[i] + w, 0.66, 0.012, sleeves[i]);
    // línea oscura arriba = abertura de la funda
    rect(xs[i], tops[i], xs[i] + w, tops[i] + 0.016, [0, 0, 0, 60]);
  }

  // Frente del cajón (tapa la parte de abajo de los lomos: quedan "adentro")
  roundRect(0.15, 0.55, 0.85, 0.82, 0.05, woodFront);
  // Labio inferior con sombra + tablilla
  rect(0.15, 0.75, 0.85, 0.82, [0, 0, 0, 40]);
  rect(0.19, 0.635, 0.81, 0.65, [0, 0, 0, 30]); // ranura horizontal
  roundRect(0.15, 0.55, 0.85, 0.585, 0.03, woodLip); // borde superior del frente

  // Disco de vinilo saliendo (el "dig"): arriba, al centro-derecha
  var cx = 0.575, cy = 0.30, R = 0.155;
  for (let y = Math.floor((cy - R) * S); y <= (cy + R) * S; y++) {
    for (let x = Math.floor((cx - R) * S); x <= (cx + R) * S; x++) {
      const dx = x + .5 - cx * S, dy = y + .5 - cy * S;
      const d = Math.sqrt(dx * dx + dy * dy) / S;
      if (d <= R) {
        const ring = 0.5 + 0.5 * Math.sin(d * (Math.PI * 2) / 0.02);
        let c = [
          Math.round(vinyl[0] + (groove[0] - vinyl[0]) * ring),
          Math.round(vinyl[1] + (groove[1] - vinyl[1]) * ring),
          Math.round(vinyl[2] + (groove[2] - vinyl[2]) * ring),
        ];
        if (d <= 0.05) c = label;
        if (d <= 0.011) c = hole;
        px(x, y, c);
      }
    }
  }

  return buf;
}

const dir = process.argv[2] || '.';
for (const S of [192, 512]) {
  fs.writeFileSync(`${dir}/icon-${S}.png`, png(S, S, dibujar(S)));
  console.log(`icon-${S}.png (${S}x${S}) generado`);
}
