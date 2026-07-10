/**
 * Lincah.AI Live Chat Widget Loader (Fase E3)
 *
 * Pasang di website dengan:
 *   <script src="https://APP_DOMAIN/widget.js" data-bot-id="BOT_ID" defer></script>
 *
 * Skrip ini menambahkan tombol chat mengambang + iframe ke /widget/<botId>.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var botId = script.getAttribute('data-bot-id');
  if (!botId) {
    console.error('[Lincah Widget] data-bot-id is required');
    return;
  }
  var origin = new URL(script.src).origin;
  var accent = script.getAttribute('data-color') || '#2563eb';

  // Tombol mengambang
  var button = document.createElement('button');
  button.setAttribute('aria-label', 'Buka live chat');
  button.style.cssText =
    'position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;' +
    'background:' + accent + ';border:none;cursor:pointer;z-index:999998;' +
    'box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;' +
    'transition:transform .15s ease';
  button.onmouseenter = function () { button.style.transform = 'scale(1.06)'; };
  button.onmouseleave = function () { button.style.transform = 'scale(1)'; };
  button.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  // Iframe chat
  var frame = document.createElement('iframe');
  frame.src = origin + '/widget/' + encodeURIComponent(botId);
  frame.title = 'Live chat';
  frame.style.cssText =
    'position:fixed;bottom:88px;right:20px;width:370px;height:560px;max-height:calc(100vh - 110px);' +
    'max-width:calc(100vw - 40px);border:none;border-radius:16px;z-index:999999;' +
    'box-shadow:0 8px 40px rgba(0,0,0,.25);display:none;background:#fff';

  var open = false;
  button.onclick = function () {
    open = !open;
    frame.style.display = open ? 'block' : 'none';
    button.innerHTML = open
      ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  };

  document.body.appendChild(button);
  document.body.appendChild(frame);
})();
