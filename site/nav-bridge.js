/*
 * nav-bridge.js — connects the static landing site to the running app.
 *
 * Vendored `site/` (origin/ui) is a standalone marketing site. In the integrated
 * repo it is the front door; the functional product is the Node agent frontend
 * under `/workspace/` (served at 3317). This shim points the "登录" control
 * and the primary CTA at that workspace so the whole product is walkable locally:
 *   site (4180) -> agent workspace (3317/workspace/#workspace).
 * (The old React demo at demo/4173 is retired — code kept for reference.)
 *
 * App URL resolution order:
 *   1. window.QIANPULSE_APP_URL          (set before this script runs)
 *   2. <meta name="qianpulse-app" content="...">
 *   3. same origin when served by the agent
 *   4. same host, port 3317 (standalone site via run.ps1 -Up / make up)
 *
 * This file is ours, not upstream's. If it is absent or the app is down, the
 * pages still render and every in-site link keeps working.
 */
(() => {
  "use strict";

  // Base origin of the agent app. The hash picks which surface we land on:
  //   #workspace -> the workbench   (从「即刻开始」进入)
  //   #auth      -> the sign-in page (从「登录」进入)
  function appOrigin() {
    const explicit = (typeof window.QIANPULSE_APP_URL === "string" && window.QIANPULSE_APP_URL)
      || document.querySelector('meta[name="qianpulse-app"]')?.content
      || "";
    if (explicit) return explicit.replace(/#.*$/, "").replace(/\/+$/, "");
    if (location.port === "3317") return location.origin;
    const host = location.hostname || "localhost";
    return `${location.protocol}//${host}:3317`;
  }

  const appUrl = (hash = "#workspace") => `${appOrigin()}/workspace/${hash}`;

  const goTo = hash => function (event) {
    if (event) event.preventDefault();
    window.location.assign(appUrl(hash));
  };

  function wire(id, hash, title) {
    const el = document.getElementById(id);
    if (!el) return;
    // replace the node so the page's own handler (e.g. the login text toggle,
    // or the CTA's in-page scroll) cannot fire alongside ours
    const node = el.cloneNode(true);
    el.parentNode.replaceChild(node, el);
    node.addEventListener("click", goTo(hash));
    node.setAttribute("title", title);
    if (node.tagName === "A") node.href = appUrl(hash);
  }

  function wireLogin() {
    // 登录 lands on the agent's sign-in screen, not straight in the workbench
    wire("loginButton", "#auth", "登录买家猎手");   // index.html
    wire("qpLogin", "#auth", "登录买家猎手");        // opportunities.html
  }

  function wireProtectedWorkspace(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const node = el.cloneNode(true);
    el.parentNode.replaceChild(node, el);
    let authenticated = false;
    function setLocked(locked) {
      node.disabled = locked;
      node.setAttribute("aria-disabled", String(locked));
      node.setAttribute("title", locked ? "请先使用右上角登录" : "进入买家猎手工作台");
    }
    setLocked(true);
    node.addEventListener("click", event => {
      event.preventDefault();
      if (authenticated) window.location.assign(appUrl("#workspace"));
    });
    (async () => {
      const token = localStorage.getItem("qianpulse-auth-token") || "";
      if (!token) return;
      try {
        const response = await fetch(`${appOrigin()}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("session expired");
        authenticated = true;
        setLocked(false);
      } catch {
        localStorage.removeItem("qianpulse-auth-token");
        localStorage.removeItem("qianpulse-auth-user");
      }
    })();
  }

  function wireWorkspaceCtas() {
    // 首页 heroCta 保留原始 href（opportunities.html），进入门户商机主页。
    // opportunities.html 内的两个产品入口仅在登录有效时进入工作台。
    wireProtectedWorkspace("qpHeroStart");
    wireProtectedWorkspace("qpGlassStart");
  }

  function init() {
    try {
      wireLogin();
      wireWorkspaceCtas();
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
