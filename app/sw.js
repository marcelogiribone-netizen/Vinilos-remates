/* Service Worker del Detector de Vinilos.
   - Guarda la app (HTML/CSS/JS/íconos) para que abra sin internet.
   - Los datos (vinilos.json) usan "red primero": si hay internet trae lo
     último; si no, usa lo guardado.
   - Las fotos de los discos se guardan a medida que se ven (para verlas
     después sin conexión). */

var VERSION = 'vinilos-v1';
var APP_SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];
var IMG_HOST = 'static3.remotes.com.uy';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.map(function (k) {
        if (k !== VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 1) Datos: red primero, con respaldo a lo guardado.
  if (url.pathname.endsWith('vinilos.json')) {
    e.respondWith(
      fetch(req).then(function (resp) {
        var copia = resp.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copia); });
        return resp;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // 2) Fotos de los discos: guardado primero, y si no está, se baja y guarda.
  if (url.hostname === IMG_HOST) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (resp) {
          var copia = resp.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copia); });
          return resp;
        }).catch(function () { return hit; });
      })
    );
    return;
  }

  // 3) App (mismo origen): guardado primero, con respaldo a index.html.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).catch(function () {
          if (req.mode === 'navigate') return caches.match('index.html');
        });
      })
    );
  }
});
