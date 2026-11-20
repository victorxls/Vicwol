// Runs before the page paints so the chosen language shows without a flash.
(function () {
  var l = null;
  try { l = localStorage.getItem('lang'); } catch (e) { /* storage blocked */ }
  if (l !== 'hi' && l !== 'en') {
    l = (navigator.language || '').toLowerCase().indexOf('hi') === 0 ? 'hi' : 'en';
  }
  document.documentElement.setAttribute('data-lang', l);
})();
