/*
 * nav-bridge.js — connects the static landing site to the running app.
 *
 * Vendored `site/` (origin/ui) is a standalone marketing site. In the integrated
 * repo it is the front door; the functional product is the Node agent frontend
 * in `agent/` (served at 3317). This shim points the "登录" control and the
 * primary CTA at the agent workspace so the whole product is walkable locally:
 *   site (4180) -> agent workspace (3317/#workspace).
 * (The old React demo at demo/4173 is retired — code kept for reference.)
 *
 * App URL resolution order:
 *   1. window.QIANPULSE_APP_URL          (set before this script runs)
 *   2. <meta name="qianpulse-app" content="...">
 *   3. same host, port 3317 (agent 工作台, run.ps1 -Up / make up default)
 *
 * This file is ours, not upstream's. If it is absent or the app is down, the
 * pages still render and every in-site link keeps working.
 */
(() => {
  "use strict";

  function appUrl() {
    if (typeof window.QIANPULSE_APP_URL === "string" && window.QIANPULSE_APP_URL) {
      return window.QIANPULSE_APP_URL;
    }
    const meta = document.querySelector('meta[name="qianpulse-app"]');
    if (meta && meta.content) return meta.content;
    const host = location.hostname || "localhost";
    return `${location.protocol}//${host}:3317/#workspace`;
  }

  function goToApp(event) {
    if (event) event.preventDefault();
    window.location.assign(appUrl());
  }

  function wireLogin() {
    // index.html -> #loginButton ; opportunities.html -> #qpLogin
    const controls = [
      document.getElementById("loginButton"),
      document.getElementById("qpLogin"),
    ].filter(Boolean);

    for (const el of controls) {
      const clone = el.cloneNode(true); // drop the page's own text-toggle listener
      el.parentNode.replaceChild(clone, el);
      clone.addEventListener("click", goToApp);
      clone.setAttribute("title", "进入买家猎手工作台");
      if (clone.tagName === "A") clone.href = appUrl();
    }
  }

  function wirePrimaryCta() {
    // opportunities.html final CTA "即刻开始" — send it into the app rather than
    // just scrolling. index.html hero CTA already routes to opportunities.html.
    const start = document.getElementById("qpGlassStart");
    if (start) {
      start.href = appUrl();
      start.addEventListener("click", goToApp);
    }
  }

  function init() {
    try {
      wireLogin();
      wirePrimaryCta();
    } catch (err) {
      console.warn("[nav-bridge] wiring skipped:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
