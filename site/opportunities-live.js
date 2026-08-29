/*
 * opportunities-live.js — renders real decision-API data on the "全球商机" page.
 *
 * The vendored page (origin/ui) ships hardcoded sample orders. In the integrated
 * repo the decision API (FastAPI, port 8000) is authoritative, so this shim
 * replaces the sample cards/rows with live data and leaves the static content in
 * place as a fallback, mirroring the demo app's "API 优先，失败回退" contract.
 *
 * Data-integrity rules (docs/16_真实数据到机会决策API闭环.md):
 *   - buyer names come from the API as-is (QUALIFIED_PENDING_ENTITY rows already
 *     render as "国家+品类采购方+待核验" — never fabricated);
 *   - fields with no API equivalent (生产标准 / 成交金额) show "—";
 *   - the signal code is the real opportunity id, never an invented #QP code.
 *
 * API base resolution order:
 *   1. window.QIANPULSE_API_URL          (set before this script runs)
 *   2. http://127.0.0.1:8000             (run.ps1 -Up / make up default)
 *
 * If the API is unreachable the page keeps its static content and only gains a
 * FALLBACK badge — no console noise, no layout changes.
 *
 * This file is ours, not upstream's (see site/PROVENANCE.md).
 */
(() => {
  "use strict";

  const API_BASE = (typeof window.QIANPULSE_API_URL === "string" && window.QIANPULSE_API_URL)
    ? window.QIANPULSE_API_URL.replace(/\/+$/, "")
    : "http://127.0.0.1:8000";
  const SELLER_PROFILE_ID = "seller-guizhou-specialty-demo";

  const COUNTRY_NAMES = {
    AE: "阿联酋", AU: "澳大利亚", CA: "加拿大", CN: "中国", DE: "德国", ES: "西班牙",
    FR: "法国", GB: "英国", GR: "希腊", HK: "中国香港", IT: "意大利", JP: "日本",
    KR: "韩国", LK: "斯里兰卡", MY: "马来西亚", NL: "荷兰", OM: "阿曼", SG: "新加坡",
    TH: "泰国", US: "美国", VN: "越南",
  };
  const CATEGORY_NAMES = {
    BLUEBERRY: "蓝莓原料", CHILI: "辣椒原料", MATCHA: "抹茶原料", TEA: "茶叶原料",
  };
  const STATUS_CHIP = {
    PURSUE_NOW: { text: "已核验", cls: "qp-status-confirmed" },
    VERIFY_FIRST: { text: "核验中", cls: "qp-status-verifying" },
    WATCH: { text: "跟进中", cls: "qp-status-tracking" },
    PASS: { text: "已核验", cls: "qp-status-confirmed" },
  };

  function flagOf(code) {
    if (typeof code !== "string" || code.length !== 2) return "🌐";
    try {
      return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
    } catch {
      return "🌐";
    }
  }

  function countryOf(code) {
    return COUNTRY_NAMES[code] || code || "未披露";
  }

  function categoryOf(code) {
    return CATEGORY_NAMES[code] || code || "";
  }

  function relTime(iso) {
    if (!iso) return "";
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return "";
    const minutes = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
    return `${Math.round(minutes / 1440)} 天前`;
  }

  function quantityTotal(items) {
    const parsed = [];
    for (const item of items) {
      const raw = String(item.quantity_raw || "").trim();
      if (!raw) continue;
      const m = raw.match(/^([\d.,]+)\s*(.*)$/);
      if (!m) return "—";
      const value = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(value)) return "—";
      parsed.push({ value, unit: m[2].replace(/\s+/g, " ").toLowerCase() || null });
    }
    if (!parsed.length) return "—";
    const unit = parsed[0].unit;
    if (parsed.some((p) => p.unit !== unit)) return "—";
    const sum = parsed.reduce((acc, p) => acc + p.value, 0);
    const fmt = Number.isInteger(sum) ? sum.toLocaleString("en-US") : sum.toFixed(1);
    return `${fmt}${unit ? ` ${unit}` : ""}`;
  }

  function dataChip(mode) {
    const chip = document.createElement("span");
    const live = mode !== "FALLBACK";
    chip.textContent = live ? `LIVE · ${mode} 实时数据` : "FALLBACK · 演示样例";
    chip.style.cssText = [
      "display:inline-flex", "align-items:center", "margin-left:10px",
      "padding:2px 9px", "border-radius:999px", "font-size:10px",
      "font-weight:700", "letter-spacing:.06em", "white-space:nowrap",
      live ? "color:#153D30;background:#CFE5D8;" : "color:#654A14;background:#F1DCA7;",
    ].join(";");
    return chip;
  }

  function markDataMode(mode) {
    for (const head of [document.querySelector(".qp-featured-head"), document.querySelector(".qp-board-head")]) {
      if (head && !head.querySelector(".qp-data-chip")) head.appendChild(dataChip(mode));
    }
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  // Cards are mutated in place: the page's stack-scroll script caches the
  // .qp-order-card nodes at init, so replacing them would detach the effect.
  function mutateCard(card, item) {
    setText(card.querySelector(".qp-order-flag"), flagOf(item.country_code));
    setText(card.querySelector(".qp-order-country"), item.buyer_display_name);
    setText(card.querySelector(".qp-order-category"), categoryOf(item.category_code) || "采购需求");
    setText(card.querySelector(".qp-order-updated"), `${relTime(item.published_at) || "—"}更新`);
    setText(card.querySelector(".qp-order-product"), item.demand_title);

    const req = card.querySelector(".qp-order-requirement");
    const why = Array.isArray(item.why_now) ? item.why_now.join("；") : "";
    if (req) {
      if (why) {
        req.style.display = "";
        const label = req.querySelector(".qp-order-requirement-label");
        if (label) label.textContent = "为何现在：";
        req.childNodes[req.childNodes.length - 1].textContent = why;
      } else {
        req.style.display = "none";
      }
    }

    const values = card.querySelectorAll(".qp-order-metric-value");
    // 需求量 / 目标地 / 生产标准 / 成交金额 — keep the page's cell order.
    if (values[0]) values[0].textContent = item.quantity_raw || "未披露";
    if (values[1]) {
      values[1].innerHTML = "";
      const flag = document.createElement("span");
      flag.className = "qp-order-target-flag";
      flag.setAttribute("role", "img");
      flag.textContent = flagOf(item.country_code);
      values[1].appendChild(flag);
      values[1].appendChild(document.createTextNode(countryOf(item.country_code)));
    }
    if (values[2]) values[2].textContent = "—";
    if (values[3]) values[3].textContent = "—";
  }

  function renderCards(items) {
    const list = document.querySelector(".qp-order-card-list");
    if (!list) return;
    const staticCards = Array.from(list.querySelectorAll(".qp-order-card"));
    if (!staticCards.length) return;
    const template = staticCards[0].cloneNode(true);

    staticCards.forEach((card, i) => {
      const item = items[i];
      if (!item) {
        card.style.display = "none";
        return;
      }
      card.style.display = "";
      mutateCard(card, item);
    });

    for (let i = staticCards.length; i < items.length; i += 1) {
      const card = template.cloneNode(true);
      mutateCard(card, items[i]);
      list.appendChild(card);
    }
  }

  function renderRows(items) {
    const list = document.getElementById("qpDemandList");
    if (!list) return;
    list.replaceChildren();
    items.forEach((item, i) => {
      const row = document.createElement("article");
      row.className = `qp-demand-row${i % 2 ? "" : " qp-demand-row-tint"}`;

      const buyerCell = document.createElement("div");
      const buyer = document.createElement("strong");
      buyer.className = "qp-buyer-name";
      buyer.textContent = item.buyer_display_name;
      const demand = document.createElement("span");
      demand.className = "qp-demand-name";
      demand.textContent = item.demand_title;
      buyerCell.append(buyer, demand);

      const codeCell = document.createElement("div");
      const code = document.createElement("strong");
      code.className = "qp-signal-code";
      code.textContent = `#${item.id.slice(0, 8)}`;
      code.title = item.id;
      const source = document.createElement("span");
      source.className = "qp-source-button";
      source.style.cssText = "cursor:default;border-bottom-color:transparent;";
      source.textContent = "公开采购信号";
      codeCell.append(code, source);

      const statusCell = document.createElement("div");
      const status = STATUS_CHIP[item.decision_status] || { text: "核验中", cls: "qp-status-verifying" };
      const chip = document.createElement("span");
      chip.className = `qp-status ${status.cls}`;
      chip.textContent = status.text;
      statusCell.appendChild(chip);

      const metaCell = document.createElement("div");
      const qty = document.createElement("strong");
      qty.className = "qp-quantity";
      qty.textContent = item.quantity_raw || "—";
      const time = document.createElement("time");
      time.className = "qp-time";
      time.textContent = relTime(item.observed_at || item.published_at) || "—";
      metaCell.append(qty, time);

      row.append(buyerCell, codeCell, statusCell, metaCell);
      list.appendChild(row);
    });
  }

  function renderKpis(cardItems, rowItems) {
    const kpis = document.querySelectorAll(".qp-demand-kpi-value");
    const values = [
      String(cardItems.length),
      "—",
      quantityTotal(cardItems),
      String(rowItems.length),
    ];
    kpis.forEach((kpi, i) => {
      if (values[i] !== undefined) kpi.textContent = values[i];
    });
  }

  async function fetchJson(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function init() {
    try {
      const [today, recent] = await Promise.all([
        fetchJson(`/api/v1/opportunities/today?seller_profile_id=${encodeURIComponent(SELLER_PROFILE_ID)}&limit=5`),
        fetchJson("/api/v1/opportunities/recent?limit=6"),
      ]);
      const cards = Array.isArray(today.items) ? today.items : [];
      const rows = Array.isArray(recent.items) ? recent.items : [];
      if (!cards.length && !rows.length) throw new Error("empty payload");
      renderCards(cards);
      renderRows(rows);
      renderKpis(cards, rows);
      markDataMode(today.data_mode || "LIVE");
    } catch {
      markDataMode("FALLBACK");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
