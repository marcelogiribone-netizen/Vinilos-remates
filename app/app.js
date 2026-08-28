'use strict';

// ---------------------------------------------------------------------------
// DigBin — lógica de la PWA (detector de vinilos en remates de remotes.com.uy).
// Pantalla 1: lista de remates con vinilos (con puntuación manual por estrellas).
// Pantalla 2: detalle del remate con sus vinilos (con destacados y filtro).
// Funciona sin internet: guarda la última copia de los datos en el celular.
// Las puntuaciones y los destacados se guardan en el celular y sobreviven a
// las actualizaciones de datos (se asocian al id, no a la posición).
// ---------------------------------------------------------------------------

var ICONO = 'icons/icon-192.png';
var LOGO_VINILO = 'icons/icon-maskable-512.png'; // el vinilo entero (para la animación)
var contenido = document.getElementById('contenido');
var barraTitulo = document.getElementById('tituloBarra');
var btnAtras = document.getElementById('btnAtras');
var btnMenu = document.getElementById('btnMenu');
var drawer = document.getElementById('drawer');
var drawerFondo = document.getElementById('drawerFondo');
var aviso = document.getElementById('aviso');

// --- Recorrida (actualización manual disparando GitHub Actions) -------------
// El token lo pega el usuario UNA vez y se guarda SOLO en este teléfono
// (localStorage). Nunca está en el código. Ver la guía para crearlo.
var REPO = 'marcelogiribone-netizen/Vinilos-remates';
var WORKFLOW = 'actualizar-datos.yml';
var KEY_TOKEN = 'digbin_gh_token';
var GUIA_TOKEN = 'https://github.com/settings/personal-access-tokens/new';
var corridaEnCurso = false;

function getToken() {
  try { return localStorage.getItem(KEY_TOKEN) || ''; } catch (e) { return ''; }
}
function setToken(t) {
  try {
    if (t) localStorage.setItem(KEY_TOKEN, t);
    else localStorage.removeItem(KEY_TOKEN);
  } catch (e) { /* modo privado */ }
}

var datos = [];         // remates con vinilos
var actualizado = null;  // fecha de la última descarga de datos
var generado = null;     // fecha en que el detector tomó los datos (ofertas)
var fallos = 0;          // remates que no se pudieron leer en la última corrida
var soloDestacados = false; // filtro de la pantalla 2

// --- Guardado en el celular (localStorage) ---------------------------------

var KEY_PUNTOS = 'puntuaciones';   // { remateId: 0..5 }
var KEY_DESTACADOS = 'destacados'; // { viniloId: true }
// Copia (snapshot) de cada vinilo destacado + su remate, para que la Colección
// funcione como HISTORIAL aunque el remate ya no esté en los datos nuevos.
var KEY_DEST_DATOS = 'destacados_datos'; // { viniloId: { v:{...}, r:{...} } }

function leerMapa(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; }
  catch (e) { return {}; }
}
function guardarMapa(key, obj) {
  // localStorage puede fallar (modo privado, cuota llena). No rompe la app, pero
  // lo avisamos en la consola en vez de tragarlo en silencio.
  try { localStorage.setItem(key, JSON.stringify(obj)); }
  catch (e) { console.warn('No se pudo guardar en localStorage (' + key + '):', e && e.message); }
}

// Puntuación de un remate (0 a 5).
// IMPORTANTE: distinguimos "sin puntuar" (no hay clave) de "puntuado en 0 por
// el usuario" (hay clave con valor 0). Por eso setPuntos guarda SIEMPRE el
// valor (incluso el 0), y solo estaPuntuado() sabe si el usuario ya lo tocó.
function getPuntosRaw(remateId) {
  var v = leerMapa(KEY_PUNTOS)[String(remateId)];
  return typeof v === 'number' ? v : undefined; // undefined = sin puntuar
}
function estaPuntuado(remateId) {
  return getPuntosRaw(remateId) !== undefined;
}
function getPuntos(remateId) {
  var v = getPuntosRaw(remateId);
  return v === undefined ? 0 : v;
}
function setPuntos(remateId, valor) {
  var m = leerMapa(KEY_PUNTOS);
  m[String(remateId)] = valor; // guarda siempre (incluso 0) = puntuación manual
  guardarMapa(KEY_PUNTOS, m);
}

// Destacado de un vinilo (usa el id estable del lote; respaldo: remate:lote).
function claveVinilo(remateId, v) {
  if (v.id != null) return 'id:' + v.id;
  return 'rl:' + remateId + ':' + v.lote;
}
function esDestacado(clave) {
  return leerMapa(KEY_DESTACADOS)[clave] === true;
}
// Marca/desmarca un vinilo. Al marcar guarda un snapshot (vinilo + remate);
// al desmarcar borra el snapshot. Devuelve true si quedó destacado.
function toggleDestacado(clave, v, r) {
  var m = leerMapa(KEY_DESTACADOS);
  var datos = leerMapa(KEY_DEST_DATOS);
  if (m[clave]) {
    delete m[clave];
    delete datos[clave];
  } else {
    m[clave] = true;
    if (v && r) datos[clave] = { v: snapVinilo(v), r: snapRemate(r) };
  }
  guardarMapa(KEY_DESTACADOS, m);
  guardarMapa(KEY_DEST_DATOS, datos);
  return m[clave] === true;
}
// Guarda/actualiza el snapshot de un destacado que ya está marcado (para
// "rellenar" destacados viejos o refrescar datos del remate cuando hay datos).
function guardarSnapshot(clave, v, r) {
  var datos = leerMapa(KEY_DEST_DATOS);
  datos[clave] = { v: snapVinilo(v), r: snapRemate(r) };
  guardarMapa(KEY_DEST_DATOS, datos);
}
function snapVinilo(v) {
  return {
    id: v.id, lote: v.lote, titulo: v.titulo, artista: v.artista, album: v.album,
    sello: v.sello, anio: v.anio, moneda: v.moneda, base: v.base, oferta: v.oferta,
    imagen: v.imagen, enlaceLote: v.enlaceLote,
  };
}
function snapRemate(r) {
  return {
    id: r.id, nombre: r.nombre, empresa: r.empresa, departamento: r.departamento,
    lugar: r.lugar, fecha: r.fecha, fechaISO: r.fechaISO, timestamp: r.timestamp,
    fechaDudosa: !!r.fechaDudosa, url: r.url,
  };
}
function contarDestacados(remate) {
  var n = 0;
  remate.vinilos.forEach(function (v) {
    if (esDestacado(claveVinilo(remate.id, v))) n++;
  });
  return n;
}

// ¿El remate ya cerró? (su fecha/hora pasó respecto de ahora). Los de "fecha
// dudosa" o sin fecha se consideran NO vencidos (no los escondemos).
function estaVencido(r) {
  if (!r || !r.timestamp || r.fechaDudosa) return false;
  return r.timestamp < Math.floor(Date.now() / 1000);
}

// --- Utilidades ------------------------------------------------------------

function el(tag, clase, texto) {
  var e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

function mostrarAviso(txt) {
  if (!txt) { aviso.hidden = true; return; }
  aviso.textContent = txt;
  aviso.hidden = false;
  setTimeout(function () { aviso.hidden = true; }, 4000);
}

function montoTexto(moneda, valor) {
  var n = Number(valor);
  var num = isNaN(n) ? valor : n.toLocaleString('es-UY');
  return (moneda || '') + num;
}

// Devuelve qué precio mostrar y si es una oferta (para pintarlo en rojo).
//  - Si el lote tiene oferta vigente (oferta != null) -> ese valor, en rojo.
//  - Si no -> el precio base, normal (como antes).
function infoPrecio(v) {
  if (v.oferta != null && Number(v.oferta) > 0) {
    return { texto: montoTexto(v.moneda, v.oferta), oferta: true };
  }
  if (v.base != null) return { texto: montoTexto(v.moneda, v.base), oferta: false };
  return { texto: 'sin base', oferta: false };
}

// Fecha en que el detector tomó los datos (para "ofertas al ...").
function fechaOfertas() {
  if (!generado) return '';
  try {
    return new Date(generado).toLocaleString('es-UY',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

function nombreDisco(v) {
  if (v.artista && v.album) return v.artista + ' — ' + v.album;
  return v.titulo || v.album || v.artista || 'Disco';
}

function fechaCortaISO(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-UY',
      { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

// Antigüedad de los datos en texto ("hace 2 días", "hace 30 horas") o null si
// no sabemos cuándo se generaron. Se mide sobre `generado` (cuándo el detector
// tomó los datos), que es lo que realmente importa.
function antiguedadDatos() {
  if (!generado) return null;
  var ms = Date.now() - new Date(generado).getTime();
  if (isNaN(ms) || ms < 0) return null;
  return ms;
}
function textoAntiguedad(ms) {
  var horas = Math.floor(ms / 3600000);
  if (horas < 24) return 'hace ' + horas + ' hora' + (horas === 1 ? '' : 's');
  var dias = Math.floor(horas / 24);
  return 'hace ' + dias + ' día' + (dias === 1 ? '' : 's');
}
// Banner tocable "datos viejos" si los datos tienen más de 24 h. Al tocarlo,
// dispara una recorrida (actualización manual).
function bannerDatosViejos() {
  var ms = antiguedadDatos();
  if (ms == null || ms < 24 * 3600000) return null;
  var b = el('button', 'banner-viejos');
  b.type = 'button';
  b.innerHTML = '';
  b.appendChild(document.createTextNode('🕒 Datos de ' + textoAntiguedad(ms) + '. '));
  b.appendChild(el('span', 'banner-viejos-cta', 'Tocá para actualizar'));
  b.addEventListener('click', iniciarRecorrida);
  return b;
}

// Aviso de "no se pudo actualizar" para un remate (o null si está al día).
function notaFallo(r) {
  if (r.noLeido) {
    return '⚠️ No se pudo leer este remate en la última corrida. Podés abrirlo en la web.';
  }
  if (r.desactualizado) {
    var f = fechaCortaISO(r.datosDe);
    return '⚠️ Datos' + (f ? ' del ' + f : ' anteriores') + ' — no se pudo actualizar en la última corrida.';
  }
  return null;
}

// Crea una <img> que no manda Referer (para que el servidor no la bloquee)
// y que, si falla, muestra el ícono genérico como respaldo.
function crearFoto(clase, url, alt) {
  var img = document.createElement('img');
  img.className = clase;
  img.loading = 'lazy';
  img.alt = alt || '';
  img.referrerPolicy = 'no-referrer';
  img.setAttribute('referrerpolicy', 'no-referrer');
  img.src = url || ICONO;
  img.onerror = function () { this.onerror = null; this.src = ICONO; };
  return img;
}

// --- Carga de datos (con respaldo offline) ---------------------------------

function cargarDatos() {
  return fetch('vinilos.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (json) {
      try {
        localStorage.setItem('vinilos-data', JSON.stringify(json));
        localStorage.setItem('vinilos-fecha', new Date().toISOString());
      } catch (e) { /* almacenamiento lleno o bloqueado */ }
      actualizado = new Date();
      return json;
    })
    .catch(function () {
      var guardado = localStorage.getItem('vinilos-data');
      if (guardado) {
        var f = localStorage.getItem('vinilos-fecha');
        actualizado = f ? new Date(f) : null;
        mostrarAviso('Sin conexión: mostrando los últimos datos guardados.');
        return JSON.parse(guardado);
      }
      throw new Error('sin-datos');
    });
}

// Acepta el formato nuevo { generado, fallos, remates } y el viejo (array).
// Setea las variables globales `generado` y `fallos`.
function prepararDatos(json) {
  var remates;
  if (json && !Array.isArray(json) && Array.isArray(json.remates)) {
    remates = json.remates;
    generado = json.generado || null;
    fallos = json.fallos || 0;
  } else {
    remates = json || [];
    generado = null; // formato viejo: no trae hora de generación
    fallos = 0;
  }
  // Mostramos remates con vinilos O con problema de lectura (error/noLeido),
  // así un remate que no se pudo actualizar NUNCA desaparece en silencio.
  return remates
    .filter(function (r) {
      return (r.vinilos && r.vinilos.length > 0) || r.error || r.noLeido;
    })
    .sort(function (a, b) {
      return (a.timestamp || Infinity) - (b.timestamp || Infinity);
    });
}

// Foto representativa del remate: la primera foto de sus vinilos (la portada).
function fotoRemate(r) {
  for (var i = 0; i < r.vinilos.length; i++) {
    if (r.vinilos[i].imagen) return r.vinilos[i].imagen;
  }
  return null;
}

// --- Estrellas (puntuación manual) -----------------------------------------

function crearEstrellas(remateId) {
  var cont = el('div', 'estrellas');
  cont.setAttribute('role', 'radiogroup');
  cont.setAttribute('aria-label', 'Puntuar remate de 0 a 5');

  function pintar() {
    var raw = getPuntosRaw(remateId);
    var val = raw === undefined ? 0 : raw;
    var botones = cont.querySelectorAll('.estrella');
    for (var i = 0; i < botones.length; i++) {
      var n = i + 1;
      botones[i].textContent = n <= val ? '★' : '☆';
      botones[i].classList.toggle('activa', n <= val);
      botones[i].setAttribute('aria-checked', n === val ? 'true' : 'false');
    }
    etiqueta.textContent = raw === undefined ? 'sin puntuar' : (val + '/5');
  }

  for (var n = 1; n <= 5; n++) {
    (function (num) {
      var b = el('button', 'estrella', '☆');
      b.type = 'button';
      b.setAttribute('aria-label', num + ' estrella' + (num > 1 ? 's' : ''));
      b.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var actual = getPuntos(remateId);
        // Tocar la misma estrella actual la baja a 0 (permite despuntuar).
        setPuntos(remateId, actual === num ? 0 : num);
        pintar();
      });
      cont.appendChild(b);
    })(n);
  }
  var etiqueta = el('span', 'estrellas-label', 'sin puntuar');
  cont.appendChild(etiqueta);
  pintar();
  return cont;
}

// --- Pantalla 1: lista de remates ------------------------------------------

function pantallaLista() {
  barraTitulo.textContent = 'DigBin';
  btnAtras.hidden = true;
  contenido.innerHTML = '';

  // Solo remates ACTIVOS (los vencidos se filtran AL MOSTRAR, no solo al
  // generar los datos): si abrís la app y un remate cerró hace un rato, ya no
  // aparece. (Los vencidos siguen disponibles en la Colección como historial.)
  var activos = datos.filter(function (r) { return !estaVencido(r); });

  var bv = bannerDatosViejos();
  if (bv) contenido.appendChild(bv);

  if (!activos.length) {
    contenido.appendChild(estado('No hay remates activos con vinilos en este momento.'));
    return;
  }

  var totalVinilos = activos.reduce(function (s, r) { return s + r.vinilos.length; }, 0);
  contenido.appendChild(el('p', 'actualizado',
    totalVinilos + ' vinilos en ' + activos.length + ' remates' +
    (actualizado ? ' · actualizado ' + fechaCorta(actualizado) : '')));

  // Banner si en la última corrida algún remate no se pudo actualizar.
  var conProblema = activos.filter(function (r) { return r.desactualizado || r.noLeido; }).length;
  if (conProblema > 0) {
    contenido.appendChild(el('p', 'banner-fallos',
      '⚠️ ' + conProblema + ' remate' + (conProblema === 1 ? '' : 's') +
      ' no se pudieron actualizar en la última corrida (se muestran con datos anteriores).'));
  }

  activos.forEach(function (r) {
    var card = el('div', 'card-remate' + (r.desactualizado || r.noLeido ? ' card-problema' : ''));

    // Fila superior: foto + textos
    var fila = el('div', 'card-fila');
    fila.appendChild(crearFoto('remate-foto', fotoRemate(r), r.nombre || 'Remate'));

    var texto = el('div', 'card-texto');
    texto.appendChild(el('p', 'card-nombre', r.nombre || 'Remate'));
    if (r.empresa) texto.appendChild(el('p', 'card-empresa', r.empresa));

    var meta = el('p', 'card-meta');
    if (r.lugar) meta.appendChild(document.createTextNode('📍 ' + r.lugar));
    if (r.fecha) {
      if (r.lugar) meta.appendChild(sep());
      meta.appendChild(document.createTextNode('🕒 ' + r.fecha));
    }
    if (r.fechaDudosa) meta.appendChild(document.createTextNode('  ⚠️ fecha dudosa'));
    texto.appendChild(meta);

    // Aviso de "no se pudo actualizar" (datos viejos o no leído).
    var nf = notaFallo(r);
    if (nf) texto.appendChild(el('p', 'nota-fallo', nf));

    fila.appendChild(texto);
    card.appendChild(fila);

    // Fila inferior: cantidad de vinilos (o aviso) + estrellas
    var pie = el('div', 'card-pie');
    var n = r.vinilos.length;
    if (r.noLeido && n === 0) {
      pie.appendChild(el('span', 'badge badge-gris', '⚠️ sin datos'));
    } else {
      pie.appendChild(el('span', 'badge', '🎵 ' + n + (n === 1 ? ' vinilo' : ' vinilos')));
    }
    pie.appendChild(crearEstrellas(r.id));
    card.appendChild(pie);

    // Tocar la tarjeta (menos las estrellas) abre el detalle.
    card.addEventListener('click', function (ev) {
      if (ev.target.closest('.estrellas')) return;
      location.hash = '#/r/' + r.id;
    });

    contenido.appendChild(card);
  });
}

function sep() {
  var s = el('span', 'sep');
  s.textContent = '  ·  ';
  return s;
}

// --- Pantalla 2: detalle del remate ----------------------------------------

function pantallaDetalle(id) {
  var r = datos.find(function (x) { return String(x.id) === String(id); });
  if (!r) { location.hash = '#/'; return; }

  barraTitulo.textContent = r.nombre || 'Remate';
  btnAtras.hidden = false;
  contenido.innerHTML = '';

  // Cabecera
  var cab = el('div', 'detalle-cabecera');
  cab.appendChild(el('h2', 'detalle-titulo', r.nombre || 'Remate'));

  var sub = el('p', 'detalle-sub');
  if (r.empresa) { sub.appendChild(el('b', null, r.empresa)); sub.appendChild(document.createElement('br')); }
  if (r.lugar) { sub.appendChild(document.createTextNode('📍 ' + r.lugar)); sub.appendChild(document.createElement('br')); }
  if (r.fecha) sub.appendChild(document.createTextNode('🕒 ' + r.fecha + (r.fechaDudosa ? '  ⚠️ fecha dudosa' : '')));
  cab.appendChild(sub);

  var nf = notaFallo(r);
  if (nf) cab.appendChild(el('p', 'nota-fallo', nf));

  if (r.url) {
    var btn = el('a', 'btn-remate', 'Ver remate completo en la web ↗');
    btn.href = r.url; btn.target = '_blank'; btn.rel = 'noopener';
    cab.appendChild(btn);
  }
  contenido.appendChild(cab);

  // Si no se pudo leer y no hay vinilos que mostrar, avisamos y salimos.
  if (r.noLeido && (!r.vinilos || !r.vinilos.length)) {
    contenido.appendChild(estado(
      'No se pudieron leer los vinilos de este remate en la última corrida ' +
      '(el sitio no respondió a tiempo). Va a reintentar en la próxima corrida. ' +
      'Mientras tanto podés abrir el remate en la web con el botón de arriba.'));
    return;
  }

  // Barra de filtro: cantidad + "solo destacados"
  var barra = el('div', 'barra-filtro');
  var n = r.vinilos.length;
  var nDest = contarDestacados(r);
  barra.appendChild(el('span', 'conteo-vinilos', '🎵 ' + n + (n === 1 ? ' vinilo' : ' vinilos')));

  var toggle = el('button', 'btn-filtro');
  toggle.type = 'button';
  function pintarToggle() {
    toggle.textContent = (soloDestacados ? '★ Solo destacados' : '☆ Solo destacados') +
      ' (' + contarDestacados(r) + ')';
    toggle.classList.toggle('activo', soloDestacados);
  }
  toggle.addEventListener('click', function () {
    soloDestacados = !soloDestacados;
    dibujarVinilos();
    pintarToggle();
  });
  pintarToggle();
  barra.appendChild(toggle);
  contenido.appendChild(barra);

  if (fechaOfertas()) {
    contenido.appendChild(el('p', 'nota-ofertas', 'Ofertas al ' + fechaOfertas()));
  }

  // Contenedor de la lista de vinilos (se redibuja al filtrar)
  var lista = el('div', 'lista-vinilos');
  contenido.appendChild(lista);

  function dibujarVinilos() {
    lista.innerHTML = '';
    var visibles = r.vinilos.filter(function (v) {
      return !soloDestacados || esDestacado(claveVinilo(r.id, v));
    });
    if (!visibles.length) {
      lista.appendChild(estado(soloDestacados
        ? 'Todavía no marcaste ningún vinilo como destacado en este remate.'
        : 'Sin vinilos.'));
      return;
    }
    visibles.forEach(function (v) {
      lista.appendChild(crearCardVinilo(r, v, {
        onFav: function () { pintarToggle(); if (soloDestacados) dibujarVinilos(); }
      }));
    });
  }
  dibujarVinilos();
}

function crearCardVinilo(r, v, opciones) {
  opciones = opciones || {};
  var card = el('div', 'card-vinilo' + (opciones.cerrado ? ' card-cerrado' : ''));
  var clave = claveVinilo(r.id, v);

  // Enlace principal (foto + info) que abre el lote en la web.
  var link = el('a', 'vinilo-link');
  if (v.enlaceLote) { link.href = v.enlaceLote; link.target = '_blank'; link.rel = 'noopener'; }

  link.appendChild(crearFoto('vinilo-foto', v.imagen, nombreDisco(v)));

  var info = el('div', 'vinilo-info');
  info.appendChild(el('p', 'vinilo-titulo', nombreDisco(v)));

  var datosP = el('p', 'vinilo-datos');
  datosP.appendChild(document.createTextNode('Lote ' + (v.lote != null ? v.lote : '?') + '  ·  '));
  var ip = infoPrecio(v);
  var precioSpan = el('span', 'vinilo-precio' + (ip.oferta ? ' con-oferta' : ''), ip.texto);
  if (ip.oferta) precioSpan.title = 'Oferta vigente (el base es ' + montoTexto(v.moneda, v.base) + ')';
  datosP.appendChild(precioSpan);
  if (ip.oferta) datosP.appendChild(el('span', 'etiqueta-oferta', ' oferta'));
  info.appendChild(datosP);

  if (v.sello || v.anio) {
    var chips = el('div', 'chips');
    if (v.sello) chips.appendChild(el('span', 'chip', v.sello));
    if (v.anio) chips.appendChild(el('span', 'chip', v.anio));
    info.appendChild(chips);
  }
  link.appendChild(info);
  card.appendChild(link);

  // En la Colección: mostrar de qué remate es y cuándo cierra.
  // El nombre del remate es tocable y lleva al detalle DENTRO de la app.
  if (opciones.mostrarRemate) {
    var linea = el('div', 'coleccion-remate');
    linea.appendChild(document.createTextNode('En: '));
    var enlaceRemate = el('a', 'coleccion-remate-nombre', r.nombre || 'Remate');
    enlaceRemate.href = '#/r/' + r.id;
    linea.appendChild(enlaceRemate);
    if (r.fecha) {
      var etiquetaFecha = opciones.cerrado ? ' · cerró el ' + r.fecha : ' · 🕒 ' + r.fecha;
      linea.appendChild(el('span', 'coleccion-cierre', etiquetaFecha));
    }
    card.appendChild(linea);
  }

  // Botón destacar (corazón), separado del enlace.
  var fav = el('button', 'btn-fav');
  fav.type = 'button';
  function pintarFav() {
    var on = esDestacado(clave);
    fav.textContent = on ? '♥' : '♡';
    fav.classList.toggle('activo', on);
    fav.setAttribute('aria-pressed', on ? 'true' : 'false');
    fav.setAttribute('aria-label', on ? 'Quitar de destacados' : 'Marcar como destacado');
  }
  fav.addEventListener('click', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    var ahoraOn = toggleDestacado(clave, v, r);
    // Estrella automática: al DESTACAR, si el remate nunca fue puntuado,
    // ponerle 1 estrella. Si ya tiene puntuación manual (incluso 0), no tocar.
    // Al quitar el corazón, la estrella queda como está (no se borra sola).
    if (ahoraOn && !estaPuntuado(r.id)) setPuntos(r.id, 1);
    pintarFav();
    if (opciones.onFav) opciones.onFav(ahoraOn);
  });
  pintarFav();
  card.appendChild(fav);

  return card;
}

// --- Pantalla Colección: todos mis vinilos destacados ----------------------

function pantallaColeccion() {
  barraTitulo.textContent = 'Mi colección';
  btnAtras.hidden = true;
  contenido.innerHTML = '';

  var bv = bannerDatosViejos();
  if (bv) contenido.appendChild(bv);

  // 1) Rellenar/refrescar snapshots con los datos vivos actuales (así los
  //    destacados marcados antes de esta versión también tienen su copia, y se
  //    actualiza la fecha de cierre si el remate cambió).
  datos.forEach(function (r) {
    r.vinilos.forEach(function (v) {
      var clave = claveVinilo(r.id, v);
      if (esDestacado(clave)) guardarSnapshot(clave, v, r);
    });
  });

  // 2) Armar la lista desde los snapshots (funciona como historial aunque el
  //    remate ya no esté en los datos nuevos).
  var snaps = leerMapa(KEY_DEST_DATOS);
  var items = Object.keys(snaps).map(function (clave) {
    var s = snaps[clave]; return { clave: clave, v: s.v, r: s.r };
  });

  if (!items.length) {
    var vacio = el('div', 'estado');
    vacio.appendChild(el('p', 'estado-titulo', '💿 Tu colección está vacía'));
    vacio.appendChild(el('p', null,
      'Acá van a aparecer los vinilos que marques como destacados.'));
    vacio.appendChild(el('p', 'estado-ayuda',
      'Andá a "Remates", entrá a un remate y tocá el corazón ♡ de los discos ' +
      'que te interesen. Cada uno va a quedar guardado acá, con el remate al ' +
      'que pertenece y su fecha de cierre.'));
    contenido.appendChild(vacio);
    return;
  }

  var activos = items.filter(function (it) { return !estaVencido(it.r); });
  var cerrados = items.filter(function (it) { return estaVencido(it.r); });
  // Activos: cierre más próximo primero. Cerrados: el que cerró hace menos, primero.
  activos.sort(function (a, b) { return (a.r.timestamp || Infinity) - (b.r.timestamp || Infinity); });
  cerrados.sort(function (a, b) { return (b.r.timestamp || 0) - (a.r.timestamp || 0); });

  contenido.appendChild(el('p', 'actualizado',
    activos.length + ' activos · ' + cerrados.length + ' cerrados' +
    (fechaOfertas() ? ' · ofertas al ' + fechaOfertas() : '')));

  // --- Sección ACTIVOS ---
  if (activos.length) {
    var lista = el('div', 'lista-vinilos');
    activos.forEach(function (it) {
      lista.appendChild(crearCardVinilo(it.r, it.v, {
        mostrarRemate: true,
        onFav: function () { pantallaColeccion(); }
      }));
    });
    contenido.appendChild(lista);
  } else {
    contenido.appendChild(el('p', 'estado-ayuda', 'No tenés destacados en remates activos.'));
  }

  // --- Sección CERRADOS (historial, atenuada) ---
  if (cerrados.length) {
    var cab = el('div', 'seccion-cerrados');
    cab.appendChild(el('span', 'seccion-cerrados-titulo', 'Cerrados (historial)'));
    var btnLimpiar = el('button', 'btn-limpiar', 'Limpiar cerrados');
    btnLimpiar.type = 'button';
    btnLimpiar.addEventListener('click', function () {
      if (!confirm('¿Borrar de la colección los ' + cerrados.length +
        ' destacados de remates ya cerrados? Esto no se puede deshacer.')) return;
      limpiarCerrados(cerrados);
      pantallaColeccion();
    });
    cab.appendChild(btnLimpiar);
    contenido.appendChild(cab);

    var listaC = el('div', 'lista-vinilos');
    cerrados.forEach(function (it) {
      listaC.appendChild(crearCardVinilo(it.r, it.v, {
        mostrarRemate: true, cerrado: true,
        onFav: function () { pantallaColeccion(); }
      }));
    });
    contenido.appendChild(listaC);
  }
}

// Borra de la colección solo los destacados de remates ya cerrados.
function limpiarCerrados(cerrados) {
  var m = leerMapa(KEY_DESTACADOS);
  var datosSnap = leerMapa(KEY_DEST_DATOS);
  cerrados.forEach(function (it) {
    delete m[it.clave];
    delete datosSnap[it.clave];
  });
  guardarMapa(KEY_DESTACADOS, m);
  guardarMapa(KEY_DEST_DATOS, datosSnap);
}

// --- Estados / navegación --------------------------------------------------

function estado(txt) { return el('div', 'estado', txt); }

function fechaCorta(d) {
  try {
    return d.toLocaleString('es-UY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

function enrutar() {
  var h = location.hash || '#/';
  var enDetalle = /^#\/r\/(.+)$/.test(h);
  if (h === '#/coleccion') {
    pantallaColeccion();
  } else {
    var m = h.match(/^#\/r\/(.+)$/);
    if (m) { pantallaDetalle(m[1]); }
    else { soloDestacados = false; pantallaLista(); }
  }
  // En el detalle mostramos la flecha "‹"; en el resto, la hamburguesa.
  btnMenu.hidden = enDetalle;
  window.scrollTo(0, 0);
}

// --- Menú lateral (hamburguesa) --------------------------------------------
function abrirMenu() {
  drawer.hidden = false; drawerFondo.hidden = false;
  // fuerza el reflow para que la transición de entrada corra
  void drawer.offsetWidth;
  drawer.classList.add('abierto'); drawerFondo.classList.add('visible');
  btnMenu.setAttribute('aria-expanded', 'true');
}
function cerrarMenu() {
  drawer.classList.remove('abierto'); drawerFondo.classList.remove('visible');
  btnMenu.setAttribute('aria-expanded', 'false');
  setTimeout(function () { drawer.hidden = true; drawerFondo.hidden = true; }, 220);
}
btnMenu.addEventListener('click', abrirMenu);
drawerFondo.addEventListener('click', cerrarMenu);
Array.prototype.slice.call(drawer.querySelectorAll('.drawer-item')).forEach(function (b) {
  b.addEventListener('click', function () {
    var a = b.getAttribute('data-accion');
    cerrarMenu();
    if (a === 'remates') location.hash = '#/';
    else if (a === 'coleccion') location.hash = '#/coleccion';
    else if (a === 'recorrida') iniciarRecorrida();
    else if (a === 'backup') dialogoBackup();
  });
});

btnAtras.addEventListener('click', function () {
  if (history.length > 1) history.back();
  else location.hash = '#/';
});

window.addEventListener('hashchange', enrutar);

// --- Recorrida: disparar una actualización manual --------------------------

function iniciarRecorrida() {
  if (corridaEnCurso) { mostrarAviso('Ya hay una actualización en curso…'); return; }
  var t = getToken();
  if (!t) { dialogoToken({ titulo: 'Conectar para actualizar' }); return; }
  dispararCorrida(t);
}

function dispararCorrida(token) {
  corridaEnCurso = true;
  var genAntes = generado;
  Cargando.mostrar({
    texto: 'Pidiendo la actualización…',
    sub: 'Puede tardar unos minutos. Podés dejar la app abierta.'
  });
  var url = 'https://api.github.com/repos/' + REPO + '/actions/workflows/' +
    WORKFLOW + '/dispatches';
  fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({ ref: 'main' })
  }).then(function (resp) {
    if (resp.status === 204) {
      // Aceptado. Ahora esperamos a que la corrida publique datos nuevos.
      Cargando.texto('Recorriendo los remates…');
      pollActualizacion(genAntes, 24); // ~6 min (24 × 15s)
      return;
    }
    corridaEnCurso = false;
    Cargando.ocultar();
    // Manejo CLARO de errores (nada de fallar en silencio).
    if (resp.status === 401) {
      setToken(''); // token vencido/ inválido: lo borramos para que ponga otro
      dialogoToken({
        titulo: 'El token venció',
        error: '⚠️ El token venció o es inválido. Generá uno nuevo (dura 1 año) y pegalo acá.'
      });
    } else if (resp.status === 403) {
      dialogoToken({
        titulo: 'Permiso rechazado',
        error: '⚠️ GitHub rechazó el pedido (permisos o límite). Revisá que el token ' +
          'tenga permiso de Actions (lectura y escritura) sobre este repositorio.'
      });
    } else if (resp.status === 404) {
      dialogoToken({
        titulo: 'No encontrado',
        error: '⚠️ No se encontró la acción. Revisá que el token tenga acceso a ' +
          'este repositorio (marcá "Only select repositories" → este repo).'
      });
    } else {
      mostrarAviso('GitHub respondió ' + resp.status + '. Probá de nuevo en un rato.');
    }
  }).catch(function () {
    corridaEnCurso = false;
    Cargando.ocultar();
    mostrarAviso('No se pudo conectar con GitHub. Revisá tu conexión e intentá de nuevo.');
  });
}

// Sondea vinilos.json hasta que aparezca una generación NUEVA (distinta a la que
// había al disparar). Cuando llega, recarga la lista. Si tarda demasiado, avisa.
function pollActualizacion(genAntes, intentos) {
  fetch('vinilos.json?ts=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (json) {
      var g = json && json.generado ? json.generado : null;
      if (g && g !== genAntes) {
        try {
          localStorage.setItem('vinilos-data', JSON.stringify(json));
          localStorage.setItem('vinilos-fecha', new Date().toISOString());
        } catch (e) { /* nada */ }
        actualizado = new Date();
        datos = prepararDatos(json); // actualiza también `generado` y `fallos`
        corridaEnCurso = false;
        Cargando.ocultar();
        mostrarAviso('✅ ¡Datos actualizados!');
        enrutar(); // redibuja la pantalla actual con los datos nuevos
        return;
      }
      seguirPoll(genAntes, intentos);
    })
    .catch(function () { seguirPoll(genAntes, intentos); });
}
function seguirPoll(genAntes, intentos) {
  if (intentos <= 0) {
    corridaEnCurso = false;
    Cargando.ocultar();
    mostrarAviso('La actualización está tardando. Va a aparecer sola; si no, ' +
      'probá "Recorrida" de nuevo en unos minutos.');
    return;
  }
  setTimeout(function () { pollActualizacion(genAntes, intentos - 1); }, 15000);
}

// ===========================================================================
// Cargando — ÚNICO indicador de carga del proyecto: el vinilo girando.
//
// ESTÁNDAR DEL PROYECTO: toda espera VISIBLE de la app (presente o futura) debe
// usar este componente. No crear otros spinners/animaciones de carga: si algo
// tarda y el usuario tiene que esperar mirando la pantalla, se muestra ESTE
// vinilo girando. Es el mismo elemento en todos lados (identidad de la app).
//
// Uso:
//   Cargando.mostrar({ texto: '…', sub: '…', splash: true|false })
//   Cargando.texto('nuevo texto')   // cambia el texto sin recrear
//   Cargando.ocultar()
//
// Cuándo NO usarlo: acciones instantáneas (abrir una pantalla que ya tiene los
// datos en memoria, guardar una estrella, etc.). Ahí el vinilo aparecería y
// desaparecería de golpe (parpadeo), así que no se pone.
// ===========================================================================
var Cargando = (function () {
  var actual = null;
  function mostrar(opts) {
    opts = opts || {};
    ocultar();
    var o = el('div', 'spinner-overlay' + (opts.splash ? ' splash' : ''));
    var img = document.createElement('img');
    img.className = 'spinner-vinilo';
    img.src = LOGO_VINILO;
    img.alt = '';
    o.appendChild(img);
    o.appendChild(el('p', 'spinner-txt', opts.texto || 'Cargando…'));
    if (opts.sub) o.appendChild(el('p', 'spinner-sub', opts.sub));
    document.body.appendChild(o);
    actual = o;
    return o;
  }
  function texto(t) {
    if (!actual) return;
    var p = actual.querySelector('.spinner-txt');
    if (p) p.textContent = t;
  }
  function ocultar() {
    if (actual) { actual.remove(); actual = null; }
  }
  return { mostrar: mostrar, texto: texto, ocultar: ocultar };
})();

// Diálogo para pegar el token (primera vez, o cuando venció/es inválido).
var dialogoActual = null;
function cerrarDialogo() {
  if (dialogoActual) { dialogoActual.remove(); dialogoActual = null; }
}
function dialogoToken(opts) {
  opts = opts || {};
  cerrarDialogo();
  var fondo = el('div', 'modal-fondo');
  var caja = el('div', 'modal');
  caja.appendChild(el('h2', 'modal-titulo', opts.titulo || 'Conectar para actualizar'));
  if (opts.error) caja.appendChild(el('p', 'modal-error', opts.error));
  caja.appendChild(el('p', 'modal-texto',
    'Para actualizar desde la app necesitás un token de GitHub. Se guarda SOLO en ' +
    'este teléfono y nunca se comparte. Creá uno con permiso de Actions (dura 1 año) ' +
    'siguiendo la guía.'));
  var guia = el('a', 'modal-guia', 'Abrir GitHub para crear el token ↗');
  guia.href = GUIA_TOKEN; guia.target = '_blank'; guia.rel = 'noopener';
  caja.appendChild(guia);
  var input = el('input', 'modal-input');
  input.type = 'password';
  input.placeholder = 'Pegá acá el token (github_pat_…)';
  input.setAttribute('autocomplete', 'off');
  input.spellcheck = false;
  caja.appendChild(input);
  var acciones = el('div', 'modal-acciones');
  var cancelar = el('button', 'modal-btn', 'Cancelar'); cancelar.type = 'button';
  var guardar = el('button', 'modal-btn primario', 'Guardar y actualizar'); guardar.type = 'button';
  cancelar.addEventListener('click', cerrarDialogo);
  guardar.addEventListener('click', function () {
    var t = (input.value || '').trim();
    if (!t) { input.focus(); return; }
    setToken(t);
    cerrarDialogo();
    dispararCorrida(t);
  });
  acciones.appendChild(cancelar);
  acciones.appendChild(guardar);
  caja.appendChild(acciones);
  fondo.appendChild(caja);
  fondo.addEventListener('click', function (ev) { if (ev.target === fondo) cerrarDialogo(); });
  document.body.appendChild(fondo);
  dialogoActual = fondo;
  setTimeout(function () { input.focus(); }, 60);
}

// --- Copia de seguridad (exportar / importar estrellas y corazones) --------

// Junta TODO lo que el usuario creó (puntuaciones, destacados y sus snapshots)
// en un texto para guardar o compartir. Importar lo vuelve a cargar.
function armarBackup() {
  return {
    app: 'DigBin', v: 1, fecha: new Date().toISOString(),
    puntuaciones: leerMapa(KEY_PUNTOS),
    destacados: leerMapa(KEY_DESTACADOS),
    destacados_datos: leerMapa(KEY_DEST_DATOS)
  };
}
function contarBackup(b) {
  var estrellas = b.puntuaciones ? Object.keys(b.puntuaciones).length : 0;
  var corazones = b.destacados ? Object.keys(b.destacados).length : 0;
  return { estrellas: estrellas, corazones: corazones };
}
// Importa FUSIONANDO (no borra lo que ya tenés): lo importado se suma / pisa
// las mismas claves, y se conserva todo lo demás.
function importarBackup(obj) {
  if (!obj || typeof obj !== 'object' ||
      (!obj.puntuaciones && !obj.destacados && !obj.destacados_datos)) {
    throw new Error('El texto no parece una copia de DigBin.');
  }
  var p = leerMapa(KEY_PUNTOS), d = leerMapa(KEY_DESTACADOS), dd = leerMapa(KEY_DEST_DATOS);
  if (obj.puntuaciones) Object.keys(obj.puntuaciones).forEach(function (k) { p[k] = obj.puntuaciones[k]; });
  if (obj.destacados) Object.keys(obj.destacados).forEach(function (k) { d[k] = obj.destacados[k]; });
  if (obj.destacados_datos) Object.keys(obj.destacados_datos).forEach(function (k) { dd[k] = obj.destacados_datos[k]; });
  guardarMapa(KEY_PUNTOS, p);
  guardarMapa(KEY_DESTACADOS, d);
  guardarMapa(KEY_DEST_DATOS, dd);
}

function dialogoBackup() {
  cerrarDialogo();
  var backup = armarBackup();
  var texto = JSON.stringify(backup);
  var c = contarBackup(backup);

  var fondo = el('div', 'modal-fondo');
  var caja = el('div', 'modal');
  caja.appendChild(el('h2', 'modal-titulo', 'Copia de seguridad'));
  caja.appendChild(el('p', 'modal-texto',
    'Tus estrellas y corazones se guardan en este teléfono. Acá podés hacer una ' +
    'copia (para no perderlos si reinstalás o cambiás de teléfono) y volver a ' +
    'cargarla.'));

  // --- Exportar ---
  caja.appendChild(el('p', 'modal-seccion',
    '📤 Guardar copia (' + c.estrellas + ' con estrella · ' + c.corazones + ' con corazón)'));
  var salida = el('textarea', 'modal-area');
  salida.readOnly = true; salida.value = texto; salida.rows = 3;
  caja.appendChild(salida);

  var accExport = el('div', 'modal-acciones');
  var copiar = el('button', 'modal-btn primario', 'Copiar'); copiar.type = 'button';
  copiar.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(
        function () { mostrarAviso('Copia copiada. Pegala en una nota o mensaje para guardarla.'); },
        function () { salida.select(); mostrarAviso('Seleccioná el texto y copialo a mano.'); });
    } else { salida.select(); mostrarAviso('Seleccioná el texto y copialo a mano.'); }
  });
  accExport.appendChild(copiar);
  if (navigator.share) {
    var compartir = el('button', 'modal-btn', 'Compartir'); compartir.type = 'button';
    compartir.addEventListener('click', function () {
      navigator.share({ title: 'Copia DigBin', text: texto }).catch(function () { /* cancelado */ });
    });
    accExport.appendChild(compartir);
  }
  caja.appendChild(accExport);

  // --- Importar ---
  caja.appendChild(el('p', 'modal-seccion', '📥 Restaurar una copia'));
  var entrada = el('textarea', 'modal-area');
  entrada.placeholder = 'Pegá acá una copia que hayas guardado…'; entrada.rows = 3;
  caja.appendChild(entrada);

  var accImport = el('div', 'modal-acciones');
  var cerrar = el('button', 'modal-btn', 'Cerrar'); cerrar.type = 'button';
  cerrar.addEventListener('click', cerrarDialogo);
  var importar = el('button', 'modal-btn primario', 'Importar'); importar.type = 'button';
  importar.addEventListener('click', function () {
    var t = (entrada.value || '').trim();
    if (!t) { entrada.focus(); return; }
    var obj;
    try { obj = JSON.parse(t); } catch (e) { mostrarAviso('El texto no es válido. ¿Lo pegaste completo?'); return; }
    try {
      importarBackup(obj);
      var cc = contarBackup(obj);
      cerrarDialogo();
      mostrarAviso('✅ Copia restaurada (' + cc.estrellas + ' estrellas, ' + cc.corazones + ' corazones).');
      enrutar();
    } catch (e) { mostrarAviso('⚠️ ' + e.message); }
  });
  accImport.appendChild(cerrar);
  accImport.appendChild(importar);
  caja.appendChild(accImport);

  fondo.appendChild(caja);
  fondo.addEventListener('click', function (ev) { if (ev.target === fondo) cerrarDialogo(); });
  document.body.appendChild(fondo);
  dialogoActual = fondo;
}

// --- Arranque --------------------------------------------------------------

// Pantalla de inicio: el MISMO vinilo girando que en la Recorrida, para que la
// app tenga identidad desde que abre. Se cierra al cargar los datos (con un
// mínimo de tiempo visible para que no titile si carga instantáneo).
var splashInicio = Date.now();
Cargando.mostrar({ texto: 'DigBin', splash: true });
function cerrarSplash() {
  var espera = Math.max(0, 700 - (Date.now() - splashInicio));
  setTimeout(Cargando.ocultar, espera);
}

cargarDatos()
  .then(function (json) {
    datos = prepararDatos(json);
    enrutar();
    cerrarSplash();
  })
  .catch(function () {
    Cargando.ocultar();
    contenido.innerHTML = '';
    contenido.appendChild(estado(
      'No se pudieron cargar los datos y no hay copia guardada. ' +
      'Conectate a internet y volvé a abrir la app.'));
  });

if ('serviceWorker' in navigator) {
  // Si aparece una versión nueva del service worker (código nuevo), recargar
  // una vez para no quedar viendo la versión vieja. No recarga en la primera
  // instalación (cuando todavía no había un SW controlando la página).
  var teniaControlador = !!navigator.serviceWorker.controller;
  var recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!teniaControlador || recargando) return;
    recargando = true;
    location.reload();
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin SW igual anda online */ });
  });
}
