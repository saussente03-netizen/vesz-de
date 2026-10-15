/* VÉSZ · Deutsch – Installierbarkeit (Web-App) und Service Worker.
   - Android/Chrome/Edge: Hinweis mit „Installieren“-Knopf (beforeinstallprompt)
   - iPhone/iPad (Safari & Co.): Hinweis mit Anleitung (Teilen → Zum Home-Bildschirm)
   - Service Worker: Offline-Betrieb mit zuletzt geladenen Meldungen
   Wird auf jeder Seite eingebunden. Der Hinweis wird hier erzeugt (kein Markup pro Seite nötig);
   die Zeile „Als App installieren“ erscheint nur dort, wo #install-note / #install-btn existieren
   (Einstellungen). Keine Inline-Skripte, damit eine strenge CSP möglich bleibt. */
(function () {
  'use strict';

  var LS_DISMISS = 'vesz-install-dismissed';
  var LS_DONE = 'vesz-installed';
  var SNOOZE_MS = 7 * 24 * 3600 * 1000; // nach „Später“ erst in einer Woche wieder

  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* privat/gesperrt: egal */ } }

  var $ = function (id) { return document.getElementById(id); };

  var deferred = null;
  var bannerBuilt = false;

  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

  function snoozed() {
    var t = parseInt(lsGet(LS_DISMISS) || '0', 10);
    return !!t && Date.now() - t < SNOOZE_MS;
  }

  function canOffer() {
    if (isStandalone || lsGet(LS_DONE) === '1') return false;
    return !!deferred || isIOS;
  }

  /* ---------- Hinweis beim Öffnen ---------- */

  function buildBanner() {
    if (bannerBuilt || !document.body) return;
    bannerBuilt = true;
    var el = document.createElement('aside');
    el.className = 'install-banner';
    el.id = 'install-banner';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'App installieren');
    el.hidden = true;
    el.innerHTML =
      '<img src="/assets/icons/icon-192.png" alt="" width="44" height="44">' +
      '<div class="ib-text">' +
        '<strong>Als App installieren</strong>' +
        '<span id="ib-msg-default">Direkt vom Startbildschirm öffnen, ohne Browserleiste.</span>' +
        '<span id="ib-msg-ios" hidden>Tippe unten auf Teilen ' +
          '<svg class="i" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-share"/></svg>, ' +
          'dann auf „Zum Home-Bildschirm“ ' +
          '<svg class="i" aria-hidden="true"><use href="/assets/icons/sprite.svg#i-plus"/></svg>.</span>' +
      '</div>' +
      '<div class="ib-actions">' +
        '<button class="btn btn-accent" id="ib-install" type="button">Installieren</button>' +
        '<button class="btn btn-ghost" id="ib-later" type="button">Später</button>' +
      '</div>';
    document.body.appendChild(el);

    $('ib-install').addEventListener('click', install);
    $('ib-later').addEventListener('click', function () {
      lsSet(LS_DISMISS, String(Date.now()));
      hideBanner();
    });
  }

  function showBanner() {
    if (!canOffer() || snoozed()) return;
    buildBanner();
    if (!bannerBuilt) return;
    var iosMode = isIOS && !deferred;
    $('ib-msg-default').hidden = iosMode;
    $('ib-msg-ios').hidden = !iosMode;
    $('ib-install').hidden = iosMode;
    $('ib-later').textContent = iosMode ? 'Verstanden' : 'Später';
    $('install-banner').hidden = false;
  }

  function hideBanner() {
    var b = $('install-banner');
    if (b) b.hidden = true;
  }

  function install() {
    if (!deferred) return Promise.resolve();
    var p = deferred;
    deferred = null; // der Aufruf geht pro Ereignis nur einmal
    hideBanner();
    p.prompt();
    return p.userChoice.then(function (c) {
      if (c && c.outcome === 'accepted') lsSet(LS_DONE, '1');
      else lsSet(LS_DISMISS, String(Date.now()));
    }).catch(function () { /* Ablehnung/Abbruch */ }).then(renderSettingsRow);
  }

  /* ---------- Zeile in den Einstellungen ---------- */

  function renderSettingsRow() {
    var note = $('install-note');
    var btn = $('install-btn');
    if (!note || !btn) return;
    btn.hidden = true;
    if (isStandalone) {
      note.textContent = 'Du nutzt gerade die installierte App.';
    } else if (lsGet(LS_DONE) === '1' && !deferred) {
      note.textContent = 'Bereits installiert. Du findest die App auf dem Startbildschirm oder in der App-Liste.';
    } else if (deferred) {
      note.textContent = 'Ein Tipp genügt: Die App landet auf dem Startbildschirm und öffnet ohne Browserleiste.';
      btn.hidden = false;
    } else if (isIOS) {
      note.textContent = 'Tippe unten im Browser auf Teilen und dann auf „Zum Home-Bildschirm“.';
    } else {
      note.textContent = 'Dieser Browser bietet die Installation gerade nicht direkt an. In Chrome oder Edge: Menü (⋮) → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.';
    }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    renderSettingsRow();
    showBanner();
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    lsSet(LS_DONE, '1');
    hideBanner();
    renderSettingsRow();
  });

  function onReady() {
    var btn = $('install-btn');
    if (btn) btn.addEventListener('click', install);
    renderSettingsRow();
    // iOS kennt beforeinstallprompt nicht: Anleitung direkt zeigen
    if (isIOS) setTimeout(showBanner, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

  /* ---------- Service Worker ---------- */

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (e) {
        console.log('Service Worker nicht registriert: ' + (e && e.message ? e.message : e));
      });
    });
  }
})();
