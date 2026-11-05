/* Weirwise website assistant launcher.
 * Usage:
 *   <script src="https://your-weirwise-host/widget.js"
 *           data-assistant-id="..." data-key="..." defer></script>
 */
(function () {
  "use strict";

  if (window.__weirwiseWidgetLoaded) return;
  window.__weirwiseWidgetLoaded = true;

  var script =
    document.currentScript ||
    document.querySelector("script[data-assistant-id]");
  if (!script) return;

  var assistantId = script.getAttribute("data-assistant-id");
  if (!assistantId) return;

  var widgetKey = script.getAttribute("data-key") || "";
  var label = script.getAttribute("data-label") || "Open chat";
  var position = script.getAttribute("data-position") === "bottom-left" ? "bottom-left" : "bottom-right";
  var color = script.getAttribute("data-color") || "#1B4D3E";

  var base = script.getAttribute("data-base");
  if (!base) {
    try {
      base = new URL(script.src, window.location.href).origin;
    } catch (error) {
      return;
    }
  }
  try {
    base = new URL(base).origin;
  } catch (error) {
    return;
  }
  if (!/^https?:$/.test(new URL(base).protocol)) return;

  var embedSrc =
    base + "/embed/" + encodeURIComponent(assistantId) +
    (widgetKey ? "?key=" + encodeURIComponent(widgetKey) : "");

  var host = document.createElement("div");
  host.setAttribute("data-weirwise-widget", assistantId);
  document.body.appendChild(host);

  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent = [
    ":host { all: initial; }",
    ".ww-root { position: fixed; z-index: 2147483000; " + position + ": 20px; bottom: 20px;",
    "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }",
    ".ww-launcher { width: 56px; height: 56px; border-radius: 999px; border: 0; cursor: pointer;",
    "  display: flex; align-items: center; justify-content: center; color: #fff;",
    "  background: " + color + "; box-shadow: 0 10px 30px rgba(15, 23, 42, .28);",
    "  transition: transform .18s ease, box-shadow .18s ease; }",
    ".ww-launcher:hover { transform: translateY(-2px); box-shadow: 0 14px 36px rgba(15, 23, 42, .34); }",
    ".ww-launcher:focus-visible { outline: 3px solid #93C5FD; outline-offset: 3px; }",
    ".ww-launcher svg { width: 26px; height: 26px; }",
    ".ww-panel { position: absolute; bottom: 72px; " + position + ": 0; width: 380px; height: 600px;",
    "  max-width: calc(100vw - 28px); max-height: calc(100vh - 110px); border-radius: 18px; overflow: hidden;",
    "  background: #fff; box-shadow: 0 24px 70px rgba(15, 23, 42, .32); opacity: 0; transform: translateY(8px);",
    "  pointer-events: none; transition: opacity .18s ease, transform .18s ease; }",
    ".ww-panel.ww-open { opacity: 1; transform: translateY(0); pointer-events: auto; }",
    ".ww-panel iframe { width: 100%; height: 100%; border: 0; display: block; }",
    "@media (max-width: 480px) { .ww-panel { " + position + ": 0; width: calc(100vw - 28px); height: calc(100vh - 120px); } }",
    "@media (prefers-reduced-motion: reduce) { .ww-launcher, .ww-panel { transition: none; } }",
  ].join("\n");
  root.appendChild(style);

  var wrap = document.createElement("div");
  wrap.className = "ww-root";
  root.appendChild(wrap);

  var panel = document.createElement("div");
  panel.className = "ww-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Assistant");
  wrap.appendChild(panel);

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "ww-launcher";
  launcher.setAttribute("aria-label", label);
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.9 8.9 0 0 1-3.8-.8L4 21l1.8-4.5A8.4 8.4 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" ' +
    'stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
    "</svg>";
  wrap.appendChild(launcher);

  var isOpen = false;
  var iframeLoaded = false;

  function open() {
    if (!iframeLoaded) {
      var iframe = document.createElement("iframe");
      iframe.src = embedSrc;
      iframe.title = "Assistant chat";
      iframe.setAttribute("allow", "microphone; clipboard-write");
      panel.appendChild(iframe);
      iframeLoaded = true;
    }
    panel.classList.add("ww-open");
    launcher.setAttribute("aria-expanded", "true");
    isOpen = true;
    var frame = panel.querySelector("iframe");
    if (frame) frame.focus();
  }

  function close() {
    panel.classList.remove("ww-open");
    launcher.setAttribute("aria-expanded", "false");
    isOpen = false;
    launcher.focus();
  }

  launcher.addEventListener("click", function () {
    if (isOpen) close();
    else open();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen) close();
  });

  window.WeirwiseWidget = {
    open: open,
    close: close,
    isOpen: function () {
      return isOpen;
    },
  };
})();
