(function () {
  function mcEvent(eventName) {
    if (window.fbq) {
      window.fbq('trackCustom', eventName, { page: window.location.pathname });
    }
    if (window.MC_PIXEL && typeof window.MC_PIXEL.fireLogConversionEvent === 'function') {
      window.MC_PIXEL.fireLogConversionEvent(eventName);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var path = window.location.pathname.toLowerCase();

    if (path.indexOf('quiz') !== -1 || path.indexOf('onboarding') !== -1) { mcEvent('tf_visited_quiz'); }
    if (path.indexOf('congratulations') !== -1) { mcEvent('tf_visited_result'); }
    if (path.indexOf('bond') !== -1) { mcEvent('tf_visited_bond'); }

    document.addEventListener('click', function (event) {
      var target = event.target.closest('a, button');
      if (!target) return;
      var href = target.getAttribute('href') || '';
      var text = (target.innerText || target.value || '').trim();
      var combined = text + ' ' + href;
      if (/telegram|t\.me/i.test(combined)) { mcEvent('tf_clicked_telegram'); }
      if (/gumroad|unlock|purchase|buy/i.test(combined)) { mcEvent('tf_clicked_buy'); }
    }, true);
  });
})();
