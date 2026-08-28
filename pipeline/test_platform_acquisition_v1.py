from __future__ import annotations

import importlib
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
ungm = importlib.import_module("collect_ungm_public")


class PlatformPolicyTests(unittest.TestCase):
    def test_every_platform_has_one_unambiguous_route(self):
        policy = json.loads((PIPELINE / "platform_acquisition_policy_v1.json").read_text(encoding="utf-8"))
        codes = [item["code"] for item in policy["rules"]]
        self.assertEqual(len(codes), len(set(codes)))

    def test_volza_has_no_scraping_fallback(self):
        policy = json.loads((PIPELINE / "platform_acquisition_policy_v1.json").read_text(encoding="utf-8"))
        volza = next(item for item in policy["rules"] if item["code"] == "volza")
        self.assertEqual(volza["mode"], "PAID_API_ONLY")
        self.assertEqual(volza["fallback"], "PROHIBITED")


class UngmParserTests(unittest.TestCase):
    def test_transient_network_error_is_retried(self):
        response = Mock(status_code=200, content=b"<div></div>")
        session = Mock()
        session.post.side_effect = [ungm.requests.exceptions.SSLError("tls eof"), response]
        with patch.object(ungm.time, "sleep"):
            actual, attempts = ungm.fetch_results(session, {"Title": "tea"})
        self.assertIs(actual, response)
        self.assertEqual(len(attempts), 2)
        self.assertIn("SSLError", attempts[0]["error"])

    def test_parses_public_notice_fragment(self):
        html = b"""
        <div role="row" data-noticeid="311839" class="tableRow dataRow notice-table">
          <div class="tableCell resultOptions"></div>
          <div class="tableCell resultTitle"><span class="ungm-title">Tea supply RFQ</span>
            <a href="/Public/Notice/311839"></a></div>
          <div class="tableCell resultInfo1 deadline"><span>11-Sep-2026 17:00</span></div>
          <div class="tableCell"><span>21-Aug-2026</span></div>
          <div class="tableCell resultAgency"><span>ILO</span></div>
          <div class="tableCell"><span>Request for quotation</span></div>
          <div class="tableCell resultInfo1"><span>rfx_9835_ROAF</span></div>
          <div class="tableCell"><span>Uganda</span></div>
        </div>
        """
        rows = ungm.parse_results(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["notice_id"], "311839")
        self.assertEqual(rows[0]["agency"], "ILO")
        self.assertEqual(rows[0]["buyer_country_raw"], "Uganda")
        self.assertEqual(rows[0]["source_url"], "https://www.ungm.org/Public/Notice/311839")

    def test_payload_only_requests_active_notices(self):
        from datetime import datetime
        payload = ungm.search_payload("tea", 0, 15, datetime(2026, 8, 28))
        self.assertTrue(payload["IsActive"])
        self.assertEqual(payload["DeadlineFrom"], "28-Aug-2026")
        self.assertEqual(payload["Title"], "tea")


if __name__ == "__main__":
    unittest.main(verbosity=2)
