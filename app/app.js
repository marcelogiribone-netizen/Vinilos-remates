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
var contenido = document.getElementById('contenido');
var barraTitulo = document.getElementById('tituloBarra');
var btnAtras = document.getElementById('btnAtras');
var aviso = document.getElementById('aviso');

var datos = [];         // remates con vinilos
var actualizado = null;  // fecha de la última descarga de datos
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
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* nada */ }
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
    sello: v.sello, anio: v.anio, moneda: v.moneda, base: v.base,
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

function precio(v) {
  if (v.base == null) return '';
  var n = Number(v.base);
  var num = isNaN(n) ? v.base : n.toLocaleString('es-UY');
  return (v.moneda || '') + num;
}

function nombreDisco(v) {
  if (v.artista && v.album) return v.artista + ' — ' + v.album;
  return v.titulo || v.album || v.artista || 'Disco';
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

function prepararDatos(json) {
  return (json || [])
    .filter(function (r) { return r.vinilos && r.vinilos.length > 0; })
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

  if (!activos.length) {
    contenido.appendChild(estado('No hay remates activos con vinilos en este momento.'));
    return;
  }

  var totalVinilos = activos.reduce(function (s, r) { return s + r.vinilos.length; }, 0);
  contenido.appendChild(el('p', 'actualizado',
    totalVinilos + ' vinilos en ' + activos.length + ' remates' +
    (actualizado ? ' · actualizado ' + fechaCorta(actualizado) : '')));

  activos.forEach(function (r) {
    var card = el('div', 'card-remate');

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
    fila.appendChild(texto);
    card.appendChild(fila);

    // Fila inferior: cantidad de vinilos + estrellas
    var pie = el('div', 'card-pie');
    var n = r.vinilos.length;
    pie.appendChild(el('span', 'badge', '🎵 ' + n + (n === 1 ? ' vinilo' : ' vinilos')));
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

  if (r.url) {
    var btn = el('a', 'btn-remate', 'Ver remate completo en la web ↗');
    btn.href = r.url; btn.target = '_blank'; btn.rel = 'noopener';
    cab.appendChild(btn);
  }
  contenido.appendChild(cab);

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
  datosP.appendChild(el('span', 'vinilo-precio', precio(v) || 'sin base'));
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
    activos.length + ' activos · ' + cerrados.length + ' cerrados'));

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
  if (h === '#/coleccion') {
    pantallaColeccion();
  } else {
    var m = h.match(/^#\/r\/(.+)$/);
    if (m) { pantallaDetalle(m[1]); }
    else { soloDestacados = false; pantallaLista(); }
  }
  actualizarTabbar(h);
  window.scrollTo(0, 0);
}

// Menú de navegación (pestañas de abajo): Remates / Colección.
var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
tabs.forEach(function (t) {
  t.addEventListener('click', function () { location.hash = t.getAttribute('data-hash'); });
});
function actualizarTabbar(h) {
  h = h || location.hash || '#/';
  var enColeccion = (h === '#/coleccion');
  tabs.forEach(function (t) {
    var esTabColeccion = (t.getAttribute('data-hash') === '#/coleccion');
    var activo = esTabColeccion ? enColeccion : !enColeccion;
    t.classList.toggle('activo', activo);
    t.setAttribute('aria-current', activo ? 'page' : 'false');
  });
}

btnAtras.addEventListener('click', function () {
  if (history.length > 1) history.back();
  else location.hash = '#/';
});

window.addEventListener('hashchange', enrutar);

// --- Arranque --------------------------------------------------------------

cargarDatos()
  .then(function (json) {
    datos = prepararDatos(json);
    enrutar();
  })
  .catch(function () {
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
