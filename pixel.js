/* Meta Pixel with consent for European visitors.
   Everyone else: loads exactly as before.
   Visitors whose browser time zone is in Europe: the pixel loads only after they press Accept.
   Calls to fbq() made before that are queued and sent after Accept, or dropped on Decline. */
(function () {
  var PIXEL_ID = '847407428375701';
  var KEY = 'ss_cookie_consent';

  // Standard Meta stub: queues fbq() calls until fbevents.js arrives
  !function (f) {
    if (f.fbq) return;
    var n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
  }(window);
  fbq('init', PIXEL_ID);
  fbq('track', 'PageView');

  function loadPixel() {
    if (window.__ssPixelLoaded) return;
    window.__ssPixelLoaded = true;
    var t = document.createElement('script');
    t.async = true;
    t.src = 'https://connect.facebook.net/en_US/fbevents.js';
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(t, s);
  }

  function isEurope() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      return /^Europe\//.test(tz) || /^Atlantic\/(Canary|Madeira|Azores|Reykjavik|Faroe)$/.test(tz);
    } catch (e) { return false; }
  }

  function getChoice() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  if (!isEurope()) { loadPixel(); return; }

  var choice = getChoice();
  if (choice === 'accept') { loadPixel(); return; }
  if (choice === 'decline') return;

  function showBanner() {
    var css = document.createElement('style');
    css.textContent =
      '#ss-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:560px;margin:0 auto;' +
      'background:#111;border:1px solid rgba(201,169,110,0.3);color:#C9C1B8;padding:18px 20px;' +
      'font:300 13px/1.6 Inter,-apple-system,Helvetica,Arial,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.5)}' +
      '#ss-consent a{color:#C9A96E}' +
      '#ss-consent .ss-row{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}' +
      '#ss-consent button{flex:1;min-width:120px;padding:11px 16px;cursor:pointer;background:transparent;' +
      'font:300 11px Inter,-apple-system,Helvetica,Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;' +
      'border:1px solid rgba(201,169,110,0.35);color:#C9A96E}' +
      '#ss-consent button.ss-no{border-color:rgba(255,255,255,0.12);color:#7A7672}';
    document.head.appendChild(css);

    var b = document.createElement('div');
    b.id = 'ss-consent';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Cookie consent');
    b.innerHTML =
      'We use a Meta cookie to measure our ads and show our content to people who may enjoy it. ' +
      'You choose. <a href="https://www.starseedsoultype.com/privacy.html">Privacy Policy</a>' +
      '<div class="ss-row"><button type="button" class="ss-yes">Accept</button>' +
      '<button type="button" class="ss-no">Decline</button></div>';
    document.body.appendChild(b);

    b.querySelector('.ss-yes').onclick = function () { setChoice('accept'); b.remove(); loadPixel(); };
    b.querySelector('.ss-no').onclick = function () { setChoice('decline'); b.remove(); };
  }

  if (document.body) showBanner();
  else document.addEventListener('DOMContentLoaded', showBanner);
})();
