/*
 * Add the assistant to any website with one line before </body>:
 *   <script src="https://YOUR-DOMAIN/widget.js" data-company="fixlab-demo" async></script>
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute("data-company");
  if (!slug) return console.warn("[assistant] data-company is missing on the widget script tag");
  var origin = new URL(script.src).origin;
  var label = script.getAttribute("data-label") || "კითხვა გაქვთ?";

  var button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-expanded", "false");
  button.style.cssText =
    "position:fixed;right:20px;bottom:20px;z-index:2147483000;padding:12px 18px;border:0;border-radius:999px;" +
    "background:#1f3d2b;color:#fff;font:600 15px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.18)";

  var frame = document.createElement("iframe");
  frame.src = origin + "/embed/" + encodeURIComponent(slug);
  frame.title = "AI ასისტენტი";
  frame.style.cssText =
    "position:fixed;right:20px;bottom:76px;z-index:2147483000;width:min(380px,calc(100vw - 40px));" +
    "height:min(600px,calc(100vh - 110px));border:0;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.2);display:none;background:#fff";

  button.addEventListener("click", function () {
    var open = frame.style.display === "none";
    frame.style.display = open ? "block" : "none";
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "დახურვა" : label;
  });

  document.body.appendChild(frame);
  document.body.appendChild(button);
})();
