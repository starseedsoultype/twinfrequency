(function () {
  function mcTag(tagName) {
    if (window.fbq) {
      window.fbq('trackCustom', tagName, { page: window.location.pathname });
    }
    if (window.Manychat && typeof window.Manychat.addTag === 'function') {
      window.Manychat.addTag(tagName);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var path = window.location.pathname.toLowerCase();

    if (path.indexOf('quiz') !== -1 || path.indexOf('onboarding') !== -1) {
      mcTag('tf_visited_quiz');
    }

    if (path.indexOf('congratulations') !== -1) {
      mcTag('tf_visited_result');
    }

    if (path.indexOf('bond') !== -1) {
      mcTag('tf_visited_bond');
    }

    document.addEventListener('click', function (event) {
      var target = event.target.closest('a, button');
      if (!target) return;

      var href = target.getAttribute('href') || '';
      var text = (target.innerText || target.value || '').trim();
      var combined = text + ' ' + href;

      if (/telegram|t\.me/i.test(combined)) {
        mcTag('tf_clicked_telegram');
      }

      if (/gumroad|unlock|purchase|buy/i.test(combined)) {
        mcTag('tf_clicked_buy');
      }
    }, true);
  });
})();
