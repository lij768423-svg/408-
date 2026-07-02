"use strict";

// Lightweight hash router for the pseudo multi-page shell.
// It only toggles top-level view visibility and nav state; quiz/auth/data
// lifecycle stays owned by the existing classic scripts.
(function () {
  const ROUTES = ["quiz", "wiki", "ask"];

  function currentRoute() {
    const match = /^#\/([^/?#]+)/.exec(window.location.hash || "");
    return match && ROUTES.includes(match[1]) ? match[1] : "quiz";
  }

  function applyRoute() {
    const route = currentRoute();
    document.body.dataset.route = route;

    $$("[data-route-view]").forEach(view => {
      const active = view.dataset.routeView === route;
      view.hidden = !active;
      view.setAttribute("aria-hidden", active ? "false" : "true");
    });

    $$("[data-route-link]").forEach(link => {
      const active = link.dataset.routeLink === route;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  window.applyRoute = applyRoute;
  window.addEventListener("hashchange", applyRoute);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyRoute);
  } else {
    applyRoute();
  }
})();
