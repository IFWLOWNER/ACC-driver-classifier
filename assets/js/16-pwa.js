/* IFWL app layer: registers the service worker (installable app + offline page) and offers an "Install app" bar on Android.
   Safe by design: does nothing if the browser does not support it, never blocks the page, and never touches login. */
(function () {
  'use strict';
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var standalone = false;
  try { standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) {}
  if (standalone) { try { document.documentElement.classList.add('ifwl-app'); } catch (e) {} }
  if (secure && 'serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {}
    });
  }
  /* Android app bar. If the APK file is on the site, offer it as a download ("Get the IFWL Android app"). If not, fall back to the browser's own Install bar. */
  var KEY = 'IFWL_INSTALL_DISMISSED', deferred = null, apkOk = null;
  var android = /Android/i.test(navigator.userAgent || '');
  function dismissed() { try { var t = Number(localStorage.getItem(KEY) || 0); return t && Date.now() - t < 14 * 864e5; } catch (e) { return false; } }
  function hide() { var b = document.getElementById('ifwlInstallBar'); if (b && b.parentNode) b.parentNode.removeChild(b); }
  function bar(html) {
    var b = document.createElement('div'); b.id = 'ifwlInstallBar'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'IFWL app');
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:300000;display:flex;align-items:center;gap:10px;background:#12161c;color:#e8eaf0;border:1px solid #1fd6bd;border-radius:14px;padding:10px 12px;box-shadow:0 8px 28px rgba(0,0,0,.45);font:600 14px/1.3 Inter,system-ui,Arial,sans-serif;max-width:520px;margin:0 auto';
    b.innerHTML = '<img src="icons/icon-192.png" alt="" width="40" height="40" style="border-radius:10px;flex:none"><span id="ifwlBarText" style="flex:1;min-width:0"></span>' + html
      + '<button type="button" id="ifwlInstallNo" aria-label="Not now" style="background:transparent;color:#aeb6c4;border:0;font:700 20px/1 system-ui,sans-serif;padding:4px 6px;cursor:pointer;flex:none">&times;</button>';
    document.body.appendChild(b);
    document.getElementById('ifwlInstallNo').onclick = function () { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} hide(); };
    return b;
  }
  var BTN = 'background:#1fd6bd;color:#06231f;border:0;border-radius:10px;padding:9px 14px;font:800 13px system-ui,sans-serif;cursor:pointer;flex:none;text-decoration:none;display:inline-block';
  function show() {
    if (standalone || dismissed() || !document.body || document.getElementById('ifwlInstallBar')) return;
    if (apkOk) {
      bar('<a id="ifwlApkGo" href="ifwl.apk" download="IFWL.apk" style="' + BTN + '">Download</a>');
      document.getElementById('ifwlBarText').textContent = 'Get the IFWL Android app for quick access to your licence, races and kit.';
      document.getElementById('ifwlApkGo').addEventListener('click', function () {
        setTimeout(function () { var t = document.getElementById('ifwlBarText'); if (t) t.textContent = 'Open the downloaded IFWL file and tap Install. If Android asks, allow installs from your browser.'; var g = document.getElementById('ifwlApkGo'); if (g) g.style.display = 'none'; }, 400);
      });
    } else if (deferred) {
      bar('<button type="button" id="ifwlInstallGo" style="' + BTN + '">Install</button>');
      document.getElementById('ifwlBarText').textContent = 'Install the IFWL app for quick access to your licence, races and kit.';
      document.getElementById('ifwlInstallGo').onclick = function () { var p = deferred; deferred = null; hide(); try { p.prompt(); p.userChoice.then(function () {}, function () {}); } catch (e) {} };
    }
  }
  if (android && !standalone && secure) {
    try {
      fetch('ifwl.apk', { method: 'HEAD', cache: 'no-store' }).then(function (r) { apkOk = !!(r && r.ok); setTimeout(show, 3500); }).catch(function () { apkOk = false; });
    } catch (e) {}
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; setTimeout(show, 4000); });
  window.addEventListener('appinstalled', function () { deferred = null; hide(); });
})();
