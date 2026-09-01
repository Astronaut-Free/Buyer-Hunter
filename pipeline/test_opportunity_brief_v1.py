"""《全球采购商机简报》PDF 渲染测试。

重点不是排版，而是**诚实性**：未知项必须显式标注、买方主体未核验必须警示、
每页必须带生成时间/数据模式/证据来源。简报绝不能比底层数据更自信。
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from opportunity_brief_v1 import UNKNOWN, find_cjk_font, render_brief  # noqa: E402


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    import io

    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _page_count(data: bytes) -> int:
    from pypdf import PdfReader
    import io

    return len(PdfReader(io.BytesIO(data)).pages)


FULL = {
    "id": "opp-test-0001",
    "rank": 1,
    "buyer_display_name": "Japan 抹茶采购方（联系人：Mr. Koseko）",
    "country_code": "JP",
    "demand_title": "Looking for organic culinary matcha powder",
    "category_code": "MATCHA",
    "quantity_raw": "2000 kg",
    "published_at": "2026-08-20",
    "decision_status": "VERIFY_FIRST",
    "opportunity_score": 68.4,
    "promotion_bonus": 10.0,
    "truth_score": 74.0,
    "data_mode": "LIVE",
    "ruleset_version": "opportunity-v1.1.0",
    "buyer_identity_status": "PLATFORM_ACCOUNT",
    "access_status": "CONDITIONAL",
    "why_now": ["7 天内发布公开 RFQ", "买家账号本季度第 3 次采购同品类"],
    "component_scores": {
        "timing": 75.0,
        "seller_fit": 67.0,
        "commercial_execution": 40.0,
        "procurement_channel_actionability": 70.0,
        "market_access": 35.0,
    },
    "gaps": ["product.specification_text：买家未披露目数", "买方公司主体待核验"],
    "blockers": [],
    "risks": [
        {
            "code": "CERTIFICATION_GAP",
            "severity": "MEDIUM",
            "evidence": "FJS-BAK-STD: 缺少认证 ORGANIC",
            "reason": "买方所需认证与匹配 SKU 之间存在缺口",
            "mitigation": "报价前确认认证适用范围",
            "review_by": "报价前",
        },
        {
            "code": "IDENTITY_UNKNOWN",
            "severity": "HIGH",
            "evidence": "buyer_identity_status=PLATFORM_ACCOUNT",
            "reason": "买家公司法定主体未完成独立核验",
            "mitigation": "通过平台公开渠道索取企业抬头",
            "review_by": "触达前",
        },
    ],
    "evidence": [
        {
            "source_url": "https://sourcing.alibaba.com/rfq/detail/xyz",
            "claim": "We need 2000kg organic culinary matcha, delivery to Osaka by Q4.",
            "observed_at": "2026-08-21T04:10:00Z",
        }
    ],
    "seller_sku_fit": {
        "supply_pool_status": "CONDITIONAL_ONLY",
        "best_verdict": "CONDITIONAL",
        "best_fit_score": 67.0,
        "summary_zh": "贵州现有 5 款抹茶产品中 3 款条件性匹配",
        "eligible_matches": [
            {
                "company_name": "梵净山绿色食品合作社（示例）",
                "sku": "FJS-CUL-ORG",
                "product_name": "有机烹饪级抹茶粉 Organic culinary matcha",
                "grade": "culinary",
                "verdict": "CONDITIONAL",
                "fit_points": 67.0,
                "blockers": [],
                "gaps": ["目数待买家确认"],
            }
        ],
    },
    "next_action": {
        "action_type": "VERIFY_GAP",
        "summary": "先补齐关键缺口：product.specification_text",
        "checklist": ["向买家索取目数与包装要求", "确认企业抬头与主体信息"],
    },
    "buying_profile": {
        "category_continuity": {"value": "MATCHA", "tier": "FACT"},
        "quantity_range": {"value": "800-2000 kg", "tier": "DERIVED"},
        "markets": {"value": ["JP"], "tier": "FACT"},
        "repeat_post_count": {"value": 3, "tier": "FACT"},
    },
    "same_account_public_history": [
        {"observed_at": "2026-07-02", "demand_summary": "1200kg matcha, Osaka"},
        {"observed_at": "2026-05-18", "demand_summary": "800kg matcha, Osaka"},
    ],
}

SPARSE = {
    "id": "opp-test-0002",
    "decision_status": "WATCH",
    "opportunity_score": 41.0,
    "truth_score": 62.0,
    "data_mode": "LIVE",
}


class TestOpportunityBrief(unittest.TestCase):
    def test_renders_a_valid_two_to_three_page_pdf(self) -> None:
        data = render_brief(FULL)
        self.assertTrue(data.startswith(b"%PDF"), "missing PDF magic")
        self.assertGreater(len(data), 5000)
        self.assertIn(_page_count(data), (2, 3), "brief must be 2-3 pages")

    def test_carries_every_required_section(self) -> None:
        text = _pdf_text(render_brief(FULL))
        for probe in [
            "全球采购商机简报",
            "商机摘要与决策依据",
            "为什么是现在",
            "证据链",
            "当前需求与买方画像",
            "Buyer Buying Profile",
            "贵州供给匹配",
            "入围 Seller",
            "风险项",
            "下一步",
        ]:
            self.assertIn(probe, text, f"section missing: {probe}")

    def test_stamps_provenance_on_the_page(self) -> None:
        text = _pdf_text(render_brief(FULL, generated_at="2026-08-29 12:00 UTC"))
        self.assertIn("2026-08-29 12:00 UTC", text)
        self.assertIn("数据模式", text)
        self.assertIn("LIVE", text)
        self.assertIn("opportunity-v1.1.0", text)
        self.assertIn("sourcing.alibaba.com", text)

    def test_unverified_buyer_identity_is_called_out(self) -> None:
        """PLATFORM_ACCOUNT must never read as a confirmed company."""
        text = _pdf_text(render_brief(FULL))
        self.assertIn("平台账户", text)
        self.assertIn("法定主体尚未独立核验", text)

    def test_missing_fields_render_as_explicit_unknown_not_blank(self) -> None:
        text = _pdf_text(render_brief(SPARSE))
        self.assertIn(UNKNOWN, text)
        # a sparse record still produces every section, and says why it is empty
        self.assertIn("无可引用的原始证据", text)
        self.assertIn("暂无可靠的同账号历史采购记录", text)

    def test_renders_decision_risks_and_action(self) -> None:
        text = _pdf_text(render_brief(FULL))
        self.assertIn("补证后跟进", text)          # VERIFY_FIRST label
        self.assertIn("CERTIFICATION_GAP", text)
        self.assertIn("IDENTITY_UNKNOWN", text)
        self.assertIn("报价前", text)              # review_by
        self.assertIn("先补齐关键缺口", text)      # next_action summary
        self.assertIn("向买家索取目数与包装要求", text)  # checklist

    def test_buying_profile_shows_fact_tier(self) -> None:
        text = _pdf_text(render_brief(FULL))
        self.assertIn("品类连续性", text)
        self.assertIn("事实", text)   # FACT tier label
        self.assertIn("推导", text)   # DERIVED tier label

    def test_rejects_a_payload_without_an_opportunity_id(self) -> None:
        with self.assertRaises(ValueError):
            render_brief({"decision_status": "WATCH"})
        with self.assertRaises(ValueError):
            render_brief(None)  # type: ignore[arg-type]

    def test_is_deterministic_for_a_fixed_timestamp(self) -> None:
        a = render_brief(FULL, generated_at="2026-08-29 12:00 UTC")
        b = render_brief(FULL, generated_at="2026-08-29 12:00 UTC")
        self.assertEqual(_pdf_text(a), _pdf_text(b))

    def test_cjk_font_is_available_so_chinese_is_not_dropped(self) -> None:
        self.assertIsNotNone(find_cjk_font(), "no CJK TTF found; the brief would lose Chinese text")
        text = _pdf_text(render_brief(FULL))
        self.assertFalse(re.search(r"\?{4,}", text), "Chinese collapsed into '????'")



class TestMembershipTier(unittest.TestCase):
    """A SUMMARY payload must not read as "no match / no risk" -- it lacks the
    gated blocks entirely, so the brief has to say so."""

    def _summary_payload(self) -> dict:
        return {
            "id": "opp-test-0003",
            "decision_access": "SUMMARY",
            "decision_status": "PURSUE_NOW",
            "opportunity_score": 81.0,
            "truth_score": 77.0,
            "data_mode": "LIVE",
            "buyer_display_name": "US matcha buyer",
            "next_action_summary": "准备规格与报价资料",
        }

    def test_summary_brief_is_labelled_and_gates_section_three(self) -> None:
        text = _pdf_text(render_brief(self._summary_payload()))
        self.assertIn("摘要版", text)
        self.assertIn("决策会员", text)
        self.assertNotIn("贵州供给池暂无符合条件的产品", text)
        self.assertNotIn("未识别到显性风险项", text)

    def test_summary_brief_does_not_claim_absence(self) -> None:
        text = _pdf_text(render_brief(self._summary_payload()))
        self.assertIn("不代表「无匹配」或「无风险」", text)

    def test_full_brief_still_renders_the_findings(self) -> None:
        text = _pdf_text(render_brief(FULL))
        self.assertNotIn("摘要版", text)
        self.assertIn("入围 Seller", text)
        self.assertIn("CERTIFICATION_GAP", text)

if __name__ == "__main__":
    unittest.main()
