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

    var pages = [
      [/\/$|\/index\.html$/, 'tf_app_landing_visited'],
      [/\/login\.html$/,         'tf_app_login_visited'],
      [/\/quiz\.html$/,          'tf_app_quiz_page_visited'],
      [/\/onboarding\.html$/,    'tf_app_onboarding_started'],
      [/\/profile\.html$/,       'tf_app_profile_opened'],
      [/\/feed\.html$/,          'tf_app_feed_opened'],
      [/\/chats\.html$/,         'tf_app_chats_opened'],
      [/\/bond\.html$/,          'tf_app_bond_opened'],
      [/\/library\.html$/,       'tf_app_library_opened'],
      [/\/crystal\.html$/,       'tf_app_crystal_opened'],
      [/\/flipbook\.html$/,      'tf_app_flipbook_opened'],
      [/\/congratulations\.html$/, 'tf_app_result_viewed'],
    ];
    for (var i = 0; i < pages.length; i++) {
      if (pages[i][0].test(path)) { mcEvent(pages[i][1]); break; }
    }

    document.addEventListener('click', function (event) {
      var target = event.target.closest('a, button');
      if (!target) return;
      var href = target.getAttribute('href') || '';
      var text = (target.innerText || target.value || '').trim();
      var combined = text + ' ' + href;
      if (/telegram|t\.me/i.test(combined))              { mcEvent('tf_app_clicked_telegram'); }
      if (/gumroad|unlock|purchase|buy/i.test(combined)) { mcEvent('tf_app_clicked_buy'); }
      if (/sign[\s-]?up|create\s+account/i.test(text))  { mcEvent('tf_app_signup_clicked'); }
      if (/\blog[\s-]?in\b|sign[\s-]?in\b/i.test(text)) { mcEvent('tf_app_login_clicked'); }
    }, true);
  });
})();
