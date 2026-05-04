(function () {
  window.TwinFunnel = window.TwinFunnel || {};

  window.TwinFunnel.track = function (eventName, properties) {
    properties = properties || {};
    properties.page = window.location.pathname;
    properties.url = window.location.href;

    if (window.fbq) {
      window.fbq('trackCustom', eventName, properties);
    }

    if (window.Manychat) {
      try {
        if (typeof window.Manychat.track === 'function') {
          window.Manychat.track(eventName, properties);
        }
      } catch (error) {
        console.warn('ManyChat tracking event was not sent', error);
      }
    }

    window.dispatchEvent(new CustomEvent('twinfunnel:event', {
      detail: { eventName: eventName, properties: properties }
    }));
  };

  document.addEventListener('DOMContentLoaded', function () {
    window.TwinFunnel.track('TwinF_Page_View');

    var path = window.location.pathname.toLowerCase();

    if (path.indexOf('quiz') !== -1) {
      window.TwinFunnel.track('TwinF_Quiz_Page_View');
    }

    if (path.indexOf('bond') !== -1) {
      window.TwinFunnel.track('TwinF_Bond_Calculator_View');
    }

    if (path.indexOf('congratulations') !== -1) {
      window.TwinFunnel.track('TwinF_Result_View');
    }

    document.addEventListener('click', function (event) {
      var target = event.target.closest('a, button');
      if (!target) return;

      var text = (target.innerText || target.value || target.getAttribute('aria-label') || '').trim().slice(0, 120);
      var href = target.getAttribute('href') || '';
      var payload = { text: text, href: href };

      if (/gumroad|unlock|reading|checkout|purchase|buy/i.test(text + ' ' + href)) {
        window.TwinFunnel.track('TwinF_Purchase_Click', payload);
      } else if (/reveal bond|calculate|bond/i.test(text)) {
        window.TwinFunnel.track('TwinF_Bond_Button_Click', payload);
      } else if (/join|begin|sign up/i.test(text)) {
        window.TwinFunnel.track('TwinF_Signup_Click', payload);
      } else if (/enter|sign in|google/i.test(text)) {
        window.TwinFunnel.track('TwinF_Login_Click', payload);
      }
    }, true);
  });
})();
