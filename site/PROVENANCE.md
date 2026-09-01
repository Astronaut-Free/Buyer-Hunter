# site/ — provenance

This directory is the **QianPulse public landing site** — a static two-page front
door (`index.html` homepage + `opportunities.html` global-demand showcase),
vendored wholesale from the `ui` branch of this repository.

| | |
|---|---|
| Source branch | `origin/ui` |
| Source commit | `8977260` (re-synced 2026-08-29; was `c7d5634`, `382f759`, `e619f0a`) |
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
surface (the Node agent runtime frontend in `agent/`, served at 3317). The old
React demo under `demo/` is deprecated — code kept for reference, no longer
started by `run.ps1 -Up` / `make up`.

## What was changed after vendoring

Navigation wiring plus live-data wiring — **no upstream content or layout changes**.

- `site/nav-bridge.js` (new, ours) — points the "登录" control and the primary
  call-to-action at the agent workspace (`window.QIANPULSE_APP_URL`, default
  `http://localhost:3317/#workspace`). Loaded by one added `<script>` line in each page.
- `site/opportunities-live.js` (new, ours) — renders the decision API's real
  data into the sample cards/rows/KPIs on `opportunities.html` (API 优先，失败
  回退 to the static sample content, FALLBACK badge; see
  `docs/16_真实数据到机会决策API闭环.md` for the integrity rules). Loaded by
  one added `<script>` line in `opportunities.html`.
- `site/PROVENANCE.md`, this file.

The pages still open and render identically when either script is absent or the
app/API is not running.

## Serving locally

```
python -m http.server 4180 --directory site
```

`run.ps1 -Up` / `make up` start this alongside the api and the agent runtime
(`demo/` is deprecated and not started). See
[`docs/18_整合架构与运行.md`](../docs/18_整合架构与运行.md).

## Upstream

`yayaw2826-oss` is still iterating on `origin/ui`. To pull a newer snapshot:

```
git fetch origin
git rm -r site/           # drop the old snapshot (keeps PROVENANCE.md + nav-bridge.js if staged elsewhere)
git read-tree --prefix=site/ -u origin/ui
git checkout -- site/PROVENANCE.md site/nav-bridge.js site/opportunities-live.js
```

Re-apply the `<script src="nav-bridge.js">` line per page (and
`<script src="opportunities-live.js">` in `opportunities.html`) if upstream
rewrote the `</body>` area.
