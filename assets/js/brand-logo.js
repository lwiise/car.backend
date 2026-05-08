// Site-wide brand logo, top-LEFT corner. Self-contained — runs on
// every page that loads this script. Injects its own CSS (a single
// <style> block) so we don't have to touch every page's stylesheet.
//
// The logo links to /index.html. The right side of the screen is left
// alone — .menu-trigger / .auth-cta keep their original positions
// without any !important overrides from this script.

(function initAtsBrandLogo() {
  if (document.getElementById("atsBrandLogo")) return;

  const LOGO_SRC = "/assets/ppm-logo.png";
  const STYLE_ID = "atsBrandLogoStyle";
  const LOGO_LEFT = 18;      // distance from left edge in px
  const LOGO_TOP = 14;       // distance from top in px
  const LOGO_SIZE = 44;      // square box, matches the menu-trigger size

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ats-brand-logo {
        position: fixed;
        top: ${LOGO_TOP}px;
        left: ${LOGO_LEFT}px;
        z-index: 95;
        width: ${LOGO_SIZE}px;
        height: ${LOGO_SIZE}px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
        text-decoration: none;
        line-height: 0;
        transition: transform 160ms ease, box-shadow 180ms ease;
      }
      .ats-brand-logo:hover {
        transform: translateY(-1px);
        box-shadow: 0 12px 26px rgba(0, 0, 0, 0.22);
      }
      .ats-brand-logo img {
        width: 70%;
        height: 70%;
        object-fit: contain;
        display: block;
      }
      /* Smaller screens: tighten the corner padding. */
      @media (max-width: 540px) {
        .ats-brand-logo {
          top: 10px;
          left: 12px;
          width: 38px;
          height: 38px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function injectLogo() {
    if (document.getElementById("atsBrandLogo")) return;
    const link = document.createElement("a");
    link.id = "atsBrandLogo";
    link.className = "ats-brand-logo";
    link.href = "/index.html";
    link.setAttribute("aria-label", "Go to home");
    const img = document.createElement("img");
    img.src = LOGO_SRC;
    img.alt = "ATS";
    img.decoding = "async";
    img.loading = "eager";
    link.appendChild(img);
    document.body.appendChild(link);
  }

  function init() {
    injectStyle();
    injectLogo();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
