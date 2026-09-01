"""《全球采购商机简报》PDF —— 把一笔 Opportunity Package 渲染成 2–3 页可交付文档。

一期 P0 交付物。输入是 `/api/v1/opportunities/{id}/decision` 的会员版返回
（或等价 dict），输出 PDF 字节。

结构对齐 `.agents/skills/buyer-hunter-deal-action/SKILL.md`：
  ① 商机摘要 · 决策状态 · 为什么是现在 · 证据链
  ② 当前需求 · Buyer Buying Profile · 买方身份状态 · 公开响应渠道
  ③ 入围 Seller×SKU · 硬/软缺口 · 市场准入风险项 · 下一步行动

诚实性约束（简报不得比数据更自信）：
  - 未知字段一律显示【待核验】，绝不留空、绝不编造
  - 每页页脚带生成时间、数据模式、证据 URL
  - 买方主体未核验时明确标注，不得让读者误以为是已确认公司
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fpdf import FPDF

RULESET = "opportunity-brief-v1.0.0"
UNKNOWN = "【待核验】"

# 深绿 / 金 —— 与门户站点一致
GREEN = (18, 59, 50)
GOLD = (169, 126, 42)
INK = (29, 48, 39)
MUTED = (113, 128, 120)
LINE = (222, 228, 223)
BAND = (244, 247, 244)
RED = (184, 79, 67)

_DECISION_LABEL = {
    "PURSUE_NOW": "立即跟进",
    "VERIFY_FIRST": "补证后跟进",
    "WATCH": "持续观察",
    "PASS": "暂不投入",
}
_IDENTITY_LABEL = {
    "LEGAL_VERIFIED": "法定主体已核验",
    "DOMAIN_LINKED": "已关联企业域名",
    "PLATFORM_ACCOUNT": "平台账户（公司主体未核验）",
    "PERSON_ONLY": "仅联系人（公司主体未知）",
    "UNRESOLVED": "主体未解析",
}
_ACCESS_LABEL = {"PASS": "通过", "CONDITIONAL": "有条件", "BLOCK": "阻断", "UNKNOWN": "待核验"}
_SEVERITY_LABEL = {"HIGH": "高", "MEDIUM": "中", "LOW": "低"}
_VERDICT_LABEL = {"MATCH": "完全匹配", "CONDITIONAL": "条件性匹配", "BLOCK": "硬性不符", "NONE": "无"}
_POOL_LABEL = {"HAS_MATCH": "贵州有匹配供给", "CONDITIONAL_ONLY": "仅条件性匹配", "NO_MATCH": "暂无匹配供给"}
_TIER_LABEL = {"FACT": "事实", "DERIVED": "推导", "INFERENCE": "推断", "UNKNOWN": "未知"}
_COMPONENT_LABEL = {
    "timing": "采购时机",
    "seller_fit": "贵州供给匹配",
    "commercial_execution": "商业可执行度",
    "procurement_channel_actionability": "采购渠道可行动性",
    "market_access": "市场准入",
}

# 常见中文 TTF，按优先级探测（Windows / Linux / macOS）
_FONT_CANDIDATES = [
    # simhei first: a single-face .ttf subsets cleanly, .ttc collections do not
    ("C:/Windows/Fonts/simhei.ttf", "C:/Windows/Fonts/simhei.ttf"),
    ("C:/Windows/Fonts/msyh.ttc", "C:/Windows/Fonts/msyhbd.ttc"),
    ("C:/Windows/Fonts/simsun.ttc", "C:/Windows/Fonts/simsun.ttc"),
    ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
     "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/PingFang.ttc"),
]


def find_cjk_font() -> tuple[str, str] | None:
    for regular, bold in _FONT_CANDIDATES:
        if Path(regular).exists() and Path(bold).exists():
            return regular, bold
    return None


def _text(value: Any) -> str:
    """空/None 一律显式标注为待核验 —— 简报里不允许出现来历不明的空白。"""
    if value is None:
        return UNKNOWN
    s = str(value).strip()
    return s if s else UNKNOWN


def _num(value: Any, suffix: str = "") -> str:
    if value is None:
        return UNKNOWN
    try:
        f = float(value)
    except (TypeError, ValueError):
        return _text(value)
    return f"{int(f)}{suffix}" if f == int(f) else f"{f:g}{suffix}"


def _profile_value(entry: Any) -> str:
    """buying_profile 字段是 {value, tier}；带上事实层级，避免推断被当成事实。"""
    if entry is None:
        return UNKNOWN
    if isinstance(entry, dict):
        value = entry.get("value")
        tier = entry.get("tier")
        if isinstance(value, list):
            value = "、".join(str(v) for v in value) if value else None
        base = _text(value)
        if base != UNKNOWN and tier:
            return f"{base}（{_TIER_LABEL.get(tier, tier)}）"
        return base
    if isinstance(entry, list):
        return "、".join(str(v) for v in entry) if entry else UNKNOWN
    return _text(entry)


class _Brief(FPDF):
    def __init__(self, meta: dict[str, str]):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.meta = meta
        self.cjk = False
        self.set_auto_page_break(auto=True, margin=22)
        fonts = find_cjk_font()
        if fonts:
            regular, bold = fonts
            self.add_font("cjk", "", regular)
            self.add_font("cjk", "B", bold)
            self.cjk = True

    def body_width(self) -> float:
        return self.w - self.l_margin - self.r_margin

    def _f(self, style: str = "", size: float = 10) -> None:
        self.set_font("cjk" if self.cjk else "Helvetica", style, size)

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self._f("", 8)
        self.set_text_color(*MUTED)
        self.cell(self.body_width() / 2, 6, "黔脉 QianPulse · 全球采购商机简报")
        self.cell(self.body_width() / 2, 6, self.meta["opportunity_id"], align="R",
                  new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*LINE)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(3)

    def footer(self) -> None:
        self.set_y(-19)
        self.set_draw_color(*LINE)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(1.5)
        self._f("", 7)
        self.set_text_color(*MUTED)
        self.set_x(self.l_margin)
        self.multi_cell(
            0, 3.4,
            f"生成时间 {self.meta['generated_at']} · 数据模式 {self.meta['data_mode']}"
            f" · 规则版本 {self.meta['ruleset_version']}\n"
            f"未知项以 {UNKNOWN} 标注，不代表已核验。证据来源：{self.meta['evidence_url']}",
            align="L", new_x="LMARGIN", new_y="NEXT",
        )
        self.set_y(-8)
        self._f("", 7)
        self.cell(0, 4, f"第 {self.page_no()} / {{nb}} 页", align="R")

    # ---- building blocks -------------------------------------------------
    def h1(self, text: str) -> None:
        self.set_x(self.l_margin)
        self._f("B", 15)
        self.set_text_color(*GREEN)
        self.multi_cell(0, 7, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def section(self, index: str, title: str) -> None:
        if self.get_y() > self.h - 62:
            self.add_page()
        self.ln(2)
        self._f("B", 7)
        self.set_text_color(*GOLD)
        self.cell(0, 4, index, new_x="LMARGIN", new_y="NEXT")
        self._f("B", 12)
        self.set_text_color(*GREEN)
        self.cell(0, 6, title, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(*GOLD)
        self.set_line_width(0.4)
        self.line(self.l_margin, self.get_y() + 0.5, self.l_margin + 22, self.get_y() + 0.5)
        self.set_line_width(0.2)
        self.ln(3)

    def sub(self, text: str) -> None:
        self.set_x(self.l_margin)
        self._f("B", 9)
        self.set_text_color(*GREEN)
        self.cell(0, 5, text, new_x="LMARGIN", new_y="NEXT")

    def kv(self, label: str, value: Any, label_w: float = 34) -> None:
        self.set_x(self.l_margin)
        self._f("", 9)
        self.set_text_color(*MUTED)
        self.cell(label_w, 5, label)
        self.set_text_color(*INK)
        self.set_x(self.l_margin + label_w)
        self.multi_cell(self.body_width() - label_w, 5, _text(value), new_x="LMARGIN", new_y="NEXT")

    def bullets(self, items: list[Any], empty: str = "无") -> None:
        self.set_x(self.l_margin)
        self._f("", 9)
        if not items:
            self.set_text_color(*MUTED)
            self.multi_cell(0, 5, f"    {empty}", new_x="LMARGIN", new_y="NEXT")
            return
        for item in items:
            self.set_x(self.l_margin)
            self.set_text_color(*GOLD)
            self.cell(4, 5, "·")
            self.set_text_color(*INK)
            self.set_x(self.l_margin + 4)
            self.multi_cell(self.body_width() - 4, 5, _text(item), new_x="LMARGIN", new_y="NEXT")

    def band(self, text: str) -> None:
        self.set_x(self.l_margin)
        self.set_fill_color(*BAND)
        self._f("", 9)
        self.set_text_color(*INK)
        self.multi_cell(0, 5.5, text, fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def note(self, text: str, color: tuple[int, int, int] = GOLD) -> None:
        self.set_x(self.l_margin)
        self._f("", 8)
        self.set_text_color(*color)
        self.multi_cell(0, 4.4, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(0.5)


def _score_block(pdf: _Brief, decision: dict[str, Any]) -> None:
    label = _DECISION_LABEL.get(decision.get("decision_status"), _text(decision.get("decision_status")))
    score = _num(decision.get("opportunity_score"))
    bonus = decision.get("promotion_bonus") or 0
    total = score + (f" (+{_num(bonus)})" if bonus else "")
    pdf.set_fill_color(*GREEN)
    pdf.set_text_color(255, 255, 255)
    pdf._f("B", 11)
    pdf.cell(0, 9, f"   决策：{label}       机会分 {total}       真实性 {_num(decision.get('truth_score'))}",
             fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    comps = decision.get("component_scores") or {}
    if not comps:
        return
    pdf._f("", 7.5)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 4.5, "分项得分（权重 采购时机30 / 贵州供给30 / 商业可执行20 / 渠道可行动10 / 市场准入10）",
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(0.5)
    width = pdf.body_width() / len(comps)
    pdf._f("B", 10)
    for key in comps:
        pdf.set_text_color(*GREEN)
        pdf.cell(width, 5, _num(comps[key]), align="C")
    pdf.ln(5)
    pdf._f("", 7)
    for key in comps:
        pdf.set_text_color(*MUTED)
        pdf.cell(width, 4, _COMPONENT_LABEL.get(key, key), align="C")
    pdf.ln(6)


def render_brief(decision: dict[str, Any], *, generated_at: str | None = None) -> bytes:
    """把一笔机会决策渲染成简报 PDF，返回字节。纯函数：不触网、不读库。"""
    if not isinstance(decision, dict) or not decision.get("id"):
        raise ValueError("decision must be a dict carrying an opportunity id")

    evidence = decision.get("evidence") or []
    # /decision stamps decision_access; a SUMMARY payload simply lacks the gated
    # blocks, so the brief must say "gated" rather than render them as findings
    # ("no match" when the truth is "not visible to you" is worse than useless).
    full = decision.get("decision_access", "FULL") != "SUMMARY"
    stamp = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    pdf = _Brief({
        "opportunity_id": str(decision["id"]),
        "generated_at": stamp,
        "data_mode": _text(decision.get("data_mode")),
        "ruleset_version": _text(decision.get("ruleset_version") or RULESET),
        "evidence_url": _text(evidence[0].get("source_url") if evidence else None),
    })
    pdf.set_title(f"全球采购商机简报 {decision['id']}")
    pdf.set_author("黔脉 QianPulse")
    pdf.set_creator(RULESET)
    pdf.alias_nb_pages()
    pdf.add_page()

    # ---------- 抬头 ----------
    pdf._f("B", 8)
    pdf.set_text_color(*GOLD)
    pdf.cell(0, 4, "黔脉 QIANPULSE · GLOBAL SOURCING OPPORTUNITY BRIEF", new_x="LMARGIN", new_y="NEXT")
    pdf.h1("全球采购商机简报" + ("" if full else "（摘要版）"))
    pdf._f("", 9)
    pdf.set_text_color(*MUTED)
    rank = decision.get("rank")
    pdf.cell(0, 5, f"机会编号 {decision['id']}" + (f" · 今日排名 #{rank}" if rank else ""),
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    _score_block(pdf, decision)

    # ---------- ① 商机摘要 ----------
    pdf.section("01 / SUMMARY", "商机摘要与决策依据")
    pdf.kv("买方", decision.get("buyer_display_name"))
    pdf.kv("国家 / 地区", decision.get("country_code"))
    pdf.kv("采购需求", decision.get("demand_title"))
    pdf.kv("品类", decision.get("category_code"))
    pdf.kv("需求量", decision.get("quantity_raw"))
    pdf.kv("发布时间", decision.get("published_at"))
    if decision.get("blockers"):
        pdf.ln(1)
        pdf.sub("硬性阻断")
        pdf.bullets(decision["blockers"])
    pdf.ln(1)
    pdf.sub("为什么是现在")
    pdf.bullets(decision.get("why_now") or [], empty="采购窗口待进一步核验")
    pdf.ln(1)
    pdf.sub("证据链")
    if evidence:
        for item in evidence:
            pdf.band("“" + _text(item.get("claim"))[:300] + "”")
            pdf._f("", 7.5)
            pdf.set_text_color(*MUTED)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 4, f"来源 {_text(item.get('source_url'))}"
                                 f" · 采集于 {_text(item.get('observed_at'))}",
                           new_x="LMARGIN", new_y="NEXT")
            pdf.ln(1)
    else:
        pdf.bullets([], empty="无可引用的原始证据 —— 不可跟进")

    # ---------- ② 买方 ----------
    pdf.section("02 / BUYER", "当前需求与买方画像")
    identity = decision.get("buyer_identity_status")
    pdf.kv("买方身份状态", _IDENTITY_LABEL.get(identity, _text(identity)))
    if identity in ("PLATFORM_ACCOUNT", "PERSON_ONLY", "UNRESOLVED", None):
        pdf.note("    注意：买方法定主体尚未独立核验，公司名不可作为已确认事实使用；"
                 "请通过下方公开响应渠道联系，并在报价前完成主体确认。")
    pdf.kv("市场准入", _ACCESS_LABEL.get(decision.get("access_status"), _text(decision.get("access_status"))))
    pdf.kv("公开响应渠道", evidence[0].get("source_url") if evidence else None)

    pdf.ln(1)
    pdf.sub("Buyer Buying Profile（采购画像）")
    profile = decision.get("buying_profile")
    if isinstance(profile, dict) and profile:
        for key, label in (
            ("category_continuity", "品类连续性"),
            ("quantity_range", "数量区间"),
            ("markets", "涉及市场"),
            ("transaction_stages", "交易阶段"),
            ("common_specs", "常见规格"),
            ("repeat_post_count", "重复发帖次数"),
        ):
            if key in profile:
                pdf.kv(label, _profile_value(profile.get(key)), label_w=40)
    else:
        pdf._f("", 9)
        pdf.set_text_color(*MUTED)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, 5, f"    {UNKNOWN} —— 该买家暂无可靠的同账号历史采购记录，无法归纳采购画像"
                             "（按规则不以「姓名 + 国家」做主体合并）。",
                       new_x="LMARGIN", new_y="NEXT")

    history = decision.get("same_account_public_history") or []
    if history:
        pdf.ln(1)
        pdf.sub(f"同账号历史公开采购（{len(history)} 条）")
        pdf.bullets([f"{_text(h.get('observed_at'))} · {_text(h.get('demand_summary'))}" for h in history[:5]])

    # ---------- ③ 匹配 / 风险 / 行动 ----------
    pdf.section("03 / MATCH & ACTION", "贵州供给匹配 · 风险 · 下一步")
    if not full:
        pdf.band("本页为摘要版。完整的供需匹配矩阵、逐 SKU 判定、风险项与行动清单"
                 "属于决策会员内容，未在本简报中展示。")
        pdf.note("    说明：以上不代表「无匹配」或「无风险」，仅表示当前权限不展示。"
                 "开通决策会员后可获取完整判断。")
        pdf.ln(1)
        pdf.sub("下一步")
        pdf.bullets([_text(decision.get("next_action_summary"))])
        out = pdf.output()
        return bytes(out)

    fit = decision.get("seller_sku_fit") or {}
    pool = fit.get("supply_pool_status") or decision.get("supply_pool_status")
    pdf.kv("供给池结论", _POOL_LABEL.get(pool, _text(pool)))
    pdf.kv("最佳判定", _VERDICT_LABEL.get(fit.get("best_verdict"), _text(fit.get("best_verdict"))))
    if fit.get("summary_zh"):
        pdf.band(_text(fit.get("summary_zh")))

    matches = fit.get("eligible_matches") or []
    pdf.ln(1)
    pdf.sub(f"入围 Seller × SKU（{len(matches)}）")
    if matches:
        for m in matches[:5]:
            pdf._f("B", 9)
            pdf.set_text_color(*INK)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 5, f"{_text(m.get('company_name'))} · {_text(m.get('sku'))}"
                                 f"  [{_VERDICT_LABEL.get(m.get('verdict'), _text(m.get('verdict')))}"
                                 f" {_num(m.get('fit_points'))} 分]")
            pdf._f("", 8)
            pdf.set_text_color(*MUTED)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 4, f"    {_text(m.get('product_name'))} · 等级 {_text(m.get('grade'))}")
            for blocker in (m.get("blockers") or [])[:3]:
                pdf.note(f"    硬性阻断：{_text(blocker)}", RED)
            for gap in (m.get("gaps") or [])[:3]:
                pdf.note(f"    待补：{_text(gap)}")
            pdf.ln(0.5)
    else:
        pdf.bullets([], empty="贵州供给池暂无符合条件的产品")

    risks = decision.get("risks") or []
    pdf.ln(1)
    pdf.sub(f"风险项（{len(risks)}）")
    if risks:
        for r in risks:
            pdf._f("B", 8.5)
            pdf.set_text_color(*INK)
            sev = _SEVERITY_LABEL.get(r.get("severity"), _text(r.get("severity")))
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 4.6, f"[{sev}] {_text(r.get('code'))} — {_text(r.get('reason'))}")
            if r.get("mitigation"):
                tail = f"（{_text(r.get('review_by'))}复核）" if r.get("review_by") else ""
                pdf.note(f"    化解：{_text(r.get('mitigation'))}{tail}", MUTED)
    else:
        pdf.bullets([], empty="未识别到显性风险项")

    gaps = decision.get("gaps") or []
    if gaps:
        pdf.ln(1)
        pdf.sub(f"关键缺口（{len(gaps)}）")
        pdf.bullets(gaps[:6])

    action = decision.get("next_action") or {}
    summary = action.get("summary") or decision.get("next_action_summary")
    pdf.ln(2)
    pdf.set_fill_color(*GOLD)
    pdf.set_text_color(255, 255, 255)
    pdf._f("B", 10)
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(0, 7, f"   下一步：{_text(summary)}", fill=True, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.5)
    checklist = action.get("checklist") or []
    if checklist:
        pdf.sub("行动清单")
        pdf.bullets(checklist)

    out = pdf.output()
    return bytes(out)


def render_brief_to_file(decision: dict[str, Any], path: str | Path) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(render_brief(decision))
    return target


if __name__ == "__main__":  # pragma: no cover
    import sys

    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = render_brief_to_file(payload, sys.argv[2] if len(sys.argv) > 2 else "brief.pdf")
    print(f"wrote {out} ({out.stat().st_size} bytes)")
