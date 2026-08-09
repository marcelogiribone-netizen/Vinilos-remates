'use strict';

// ---------------------------------------------------------------------------
// Detector de Vinilos — lógica de la PWA.
// Lee vinilos.json (el que genera paso2_vinilos.js), muestra dos pantallas:
//  1) lista de remates con vinilos, 2) detalle de un remate con sus vinilos.
// Funciona sin internet: guarda la última copia de los datos en el celular.
// ---------------------------------------------------------------------------

var ICONO = 'icons/icon-192.png';
var contenido = document.getElementById('contenido');
var barraTitulo = document.getElementById('tituloBarra');
var btnAtras = document.getElementById('btnAtras');
var aviso = document.getElementById('aviso');

var datos = [];        // remates con vinilos
var actualizado = null; // fecha de la última descarga de datos

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
  // Si tenemos artista Y álbum, mostramos "Artista — Álbum" (limpio).
  if (v.artista && v.album) return v.artista + ' — ' + v.album;
  // Si no se pudo separar bien, mostramos el título completo (no perder info).
  return v.titulo || v.album || v.artista || 'Disco';
}

// --- Carga de datos (con respaldo offline) ---------------------------------

function cargarDatos() {
  return fetch('vinilos.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (json) {
      // Guardar copia local para uso sin internet.
      try {
        localStorage.setItem('vinilos-data', JSON.stringify(json));
        localStorage.setItem('vinilos-fecha', new Date().toISOString());
      } catch (e) { /* almacenamiento lleno o bloqueado: seguimos igual */ }
      actualizado = new Date();
      return json;
    })
    .catch(function () {
      // Sin internet: usar la última copia guardada.
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
  // Solo remates que tienen vinilos, ordenados por cierre más próximo.
  return (json || [])
    .filter(function (r) { return r.vinilos && r.vinilos.length > 0; })
    .sort(function (a, b) {
      return (a.timestamp || Infinity) - (b.timestamp || Infinity);
    });
}

// --- Pantalla 1: lista de remates ------------------------------------------

function pantallaLista() {
  barraTitulo.textContent = 'Vinilos en remates';
  btnAtras.hidden = true;
  contenido.innerHTML = '';

  if (!datos.length) {
    contenido.appendChild(estado('No hay remates con vinilos en este momento.'));
    return;
  }

  var totalVinilos = datos.reduce(function (s, r) { return s + r.vinilos.length; }, 0);
  var resumen = el('p', 'actualizado',
    totalVinilos + ' vinilos en ' + datos.length + ' remates' +
    (actualizado ? ' · actualizado ' + fechaCorta(actualizado) : ''));
  contenido.appendChild(resumen);

  datos.forEach(function (r) {
    var card = el('a', 'card-remate');
    card.href = '#/r/' + r.id;

    card.appendChild(el('p', 'card-nombre', r.nombre || 'Remate'));
    if (r.empresa) card.appendChild(el('p', 'card-empresa', r.empresa));

    var meta = el('p', 'card-meta');
    if (r.lugar) meta.appendChild(document.createTextNode('📍 ' + r.lugar));
    if (r.fecha) {
      if (r.lugar) meta.appendChild(sep());
      meta.appendChild(document.createTextNode('🕒 ' + r.fecha));
    }
    if (r.fechaDudosa) meta.appendChild(document.createTextNode('  ⚠️ fecha dudosa'));
    card.appendChild(meta);

    var n = r.vinilos.length;
    card.appendChild(el('span', 'badge', '🎵 ' + n + (n === 1 ? ' vinilo' : ' vinilos')));

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
  if (r.empresa) { var b = el('b', null, r.empresa); sub.appendChild(b); sub.appendChild(document.createElement('br')); }
  if (r.lugar) { sub.appendChild(document.createTextNode('📍 ' + r.lugar)); sub.appendChild(document.createElement('br')); }
  if (r.fecha) sub.appendChild(document.createTextNode('🕒 ' + r.fecha + (r.fechaDudosa ? '  ⚠️ fecha dudosa' : '')));
  cab.appendChild(sub);

  if (r.url) {
    var btn = el('a', 'btn-remate', 'Ver remate completo en la web ↗');
    btn.href = r.url;
    btn.target = '_blank';
    btn.rel = 'noopener';
    cab.appendChild(btn);
  }
  contenido.appendChild(cab);

  var n = r.vinilos.length;
  contenido.appendChild(el('p', 'conteo-vinilos', '🎵 ' + n + (n === 1 ? ' vinilo' : ' vinilos')));

  // Lista de vinilos
  r.vinilos.forEach(function (v) {
    var card = el('a', 'card-vinilo');
    if (v.enlaceLote) { card.href = v.enlaceLote; card.target = '_blank'; card.rel = 'noopener'; }

    var img = document.createElement('img');
    img.className = 'vinilo-foto';
    img.loading = 'lazy';
    img.alt = nombreDisco(v);
    img.src = v.imagen || ICONO;
    img.onerror = function () { this.onerror = null; this.src = ICONO; };
    card.appendChild(img);

    var info = el('div', 'vinilo-info');
    info.appendChild(el('p', 'vinilo-titulo', nombreDisco(v)));

    var datosP = el('p', 'vinilo-datos');
    datosP.appendChild(document.createTextNode('Lote ' + (v.lote != null ? v.lote : '?') + '  ·  '));
    var pr = el('span', 'vinilo-precio', precio(v) || 'sin base');
    datosP.appendChild(pr);
    info.appendChild(datosP);

    if (v.sello || v.anio) {
      var chips = el('div', 'chips');
      if (v.sello) chips.appendChild(el('span', 'chip', v.sello));
      if (v.anio) chips.appendChild(el('span', 'chip', v.anio));
      info.appendChild(chips);
    }
    card.appendChild(info);
    card.appendChild(el('span', 'flecha', '›'));

    contenido.appendChild(card);
  });
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
  var m = h.match(/^#\/r\/(.+)$/);
  if (m) pantallaDetalle(m[1]);
  else pantallaLista();
  window.scrollTo(0, 0);
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

// Registrar el service worker (para que funcione sin internet e instalable).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin SW: la app igual funciona online */ });
  });
}
