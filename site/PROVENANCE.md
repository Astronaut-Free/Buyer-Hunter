# site/ — provenance

This directory is the **QianPulse public landing site** — a static two-page front
door (`index.html` homepage + `opportunities.html` global-demand showcase),
vendored wholesale from the `ui` branch of this repository.

| | |
|---|---|
| Source branch | `origin/ui` |
| Source commit | `382f759` (re-synced 2026-08-29; was `e619f0a`) |
| Vendored on | 2026-08-29 |
| Vendored into | `integration` branch, under `site/` |
| Method | `git read-tree --prefix=site/ -u origin/ui` (tree snapshot, no history) |
| Author of the vendored code | yayaw2826-oss |

## What this is

A self-contained marketing site — no build step, no framework. `index.html` is a
WebGL + canvas hero (rotating globe from the Americas to Guizhou); `opportunities.html`
presents the "全球商机" story (featured orders, a live-demand board, the A1/A2
platform-logic diagram). All page copy and sample rows are authored in the HTML;
the map data under `assets/` is bundled so the globe renders offline.

This is the **front door**, deliberately decoupled from the functional product
surface (the React app in `demo/`). It is not the same thing as `demo/` and does
not replace it.

## What was changed after vendoring

Only navigation wiring — **no content or layout changes** to the vendored pages.

- `site/nav-bridge.js` (new, ours) — points the "登录" control and the primary
  call-to-action at the running app (`window.QIANPULSE_APP_URL`, default
  `http://localhost:4173`). Loaded by one added `<script>` line in each page.
- `site/PROVENANCE.md`, this file.

The pages still open and render identically when `nav-bridge.js` is absent or the
app is not running.

## Serving locally

```
python -m http.server 4180 --directory site
```

`run.ps1 -Up` / `make up` start this alongside the api, agent, and demo. See
[`docs/18_整合架构与运行.md`](../docs/18_整合架构与运行.md).

## Upstream

`yayaw2826-oss` is still iterating on `origin/ui`. To pull a newer snapshot:

```
git fetch origin
git rm -r site/           # drop the old snapshot (keeps PROVENANCE.md + nav-bridge.js if staged elsewhere)
git read-tree --prefix=site/ -u origin/ui
git checkout -- site/PROVENANCE.md site/nav-bridge.js
```

Re-apply the one `<script src="nav-bridge.js">` line per page if upstream rewrote
the `</body>` area.
