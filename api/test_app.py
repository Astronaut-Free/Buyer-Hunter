from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from api.app import app
from pipeline.build_opportunity_store_v1 import build_store


class OpportunityApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        cls.db_path = Path(cls.temp.name) / "buyer_hunter.db"
        build_store(db_path=cls.db_path)
        os.environ["BUYER_HUNTER_DB"] = str(cls.db_path)
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client.close()
        os.environ.pop("BUYER_HUNTER_DB", None)
        cls.temp.cleanup()

    def test_health(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["decision_count"], 51)

    def test_today_returns_ranked_top_five(self) -> None:
        response = self.client.get("/api/v1/opportunities/today", params={"seller_profile_id": "seller-guizhou-specialty-demo"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["items"]), 5)
        self.assertEqual([item["rank"] for item in body["items"]], [1, 2, 3, 4, 5])
        self.assertEqual(body["data_mode"], "LIVE_PIPELINE")

    def test_category_filter_recalculates_rank(self) -> None:
        response = self.client.get(
            "/api/v1/opportunities/today",
            params={"seller_profile_id": "seller-guizhou-specialty-demo", "category_code": "MATCHA"},
        )
        self.assertEqual(response.status_code, 200)
        items = response.json()["items"]
        self.assertGreater(len(items), 0)
        self.assertTrue(all(item["category_code"] == "MATCHA" for item in items))
        self.assertEqual([item["rank"] for item in items], list(range(1, len(items) + 1)))

    def test_category_and_market_filter_can_return_empty(self) -> None:
        response = self.client.get(
            "/api/v1/opportunities/today",
            params={"seller_profile_id": "seller-guizhou-specialty-demo", "category_code": "ROSA_ROXBURGHII", "market_code": "US"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["items"], [])
    def test_free_detail_is_summary_only(self) -> None:
        item = self.client.get("/api/v1/opportunities/today", params={"seller_profile_id": "seller-guizhou-specialty-demo"}).json()["items"][0]
        response = self.client.get(f"/api/v1/opportunities/{item['id']}/decision")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["decision_access"], "SUMMARY")
        self.assertNotIn("component_scores", response.json())

    def test_member_detail_has_decision_evidence(self) -> None:
        item = self.client.get("/api/v1/opportunities/today", params={"seller_profile_id": "seller-guizhou-specialty-demo"}).json()["items"][0]
        response = self.client.get(f"/api/v1/opportunities/{item['id']}/decision", headers={"X-Demo-Member": "true"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["decision_access"], "FULL")
        self.assertTrue(response.json()["evidence"])
        components = response.json()["component_scores"]
        self.assertEqual(
            set(components),
            {"timing", "seller_fit", "commercial_execution", "procurement_channel_actionability", "market_access"},
        )
        self.assertNotIn("buyer_strength", components)

    def test_lead_access_is_separate_and_locked(self) -> None:
        item = self.client.get("/api/v1/opportunities/today", params={"seller_profile_id": "seller-guizhou-specialty-demo"}).json()["items"][0]
        response = self.client.get(f"/api/v1/opportunities/{item['id']}/access-channels")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
