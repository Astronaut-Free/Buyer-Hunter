"""destination_v1: 目的市场只来自正文明确表述，绝不拿买家国家兜底（C2/C3）。

覆盖：resolve_market 别名/城市/裸 ISO2 安全性、extract_destination 各引导词、
destination_fields 行级封装、fixture 全量集成，以及 store / 桥接 / A4-A5 消费点
不再把 buyer country 当成 destination 的回归防线。
"""

from __future__ import annotations

import csv
import importlib
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "pipeline"
sys.path.insert(0, str(PIPELINE))
sys.path.insert(0, str(ROOT / "scripts"))

dest = importlib.import_module("destination_v1")
fit = importlib.import_module("supply_demand_fit_v1")
risk = importlib.import_module("risk_items_v1")
store = importlib.import_module("build_opportunity_store_v1")
bridge = importlib.import_module("export_opportunities_for_agent")

FIXTURE = PIPELINE / "tests" / "fixtures" / "full_collection" / "qualified_pending_entity_opportunities.csv"
ISO2 = dest._ISO2
UNKNOWN = dest.UNKNOWN


def fixture_rows() -> list[dict[str, str]]:
    with FIXTURE.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


class ResolveMarketTests(unittest.TestCase):
    def test_full_country_names(self):
        self.assertEqual(dest.resolve_market("United States"), "US")
        self.assertEqual(dest.resolve_market("Japan"), "JP")
        self.assertEqual(dest.resolve_market("Germany"), "DE")
        self.assertEqual(dest.resolve_market("United Arab Emirates"), "AE")

    def test_new_aliases(self):
        self.assertEqual(dest.resolve_market("Turkey"), "TR")
        self.assertEqual(dest.resolve_market("Greece"), "GR")
        self.assertEqual(dest.resolve_market("Ukraine"), "UA")
        self.assertEqual(dest.resolve_market("Viet Nam"), "VN")
        self.assertEqual(dest.resolve_market("Latvia"), "LV")

    def test_port_cities(self):
        self.assertEqual(dest.resolve_market("Rotterdam"), "NL")
        self.assertEqual(dest.resolve_market("Laem Chabang, Thailand"), "TH")
        self.assertEqual(dest.resolve_market("Jebel Ali, United Arab Emirates"), "AE")
        self.assertEqual(dest.resolve_market("Abu Dhabi, United Arab Emirates"), "AE")
        self.assertEqual(dest.resolve_market("Ho Chi Minh"), "VN")

    def test_bare_uppercase_iso2_resolves(self):
        self.assertEqual(dest.resolve_market("US"), "US")
        self.assertEqual(dest.resolve_market("DE"), "DE")
        self.assertEqual(dest.resolve_market("TR"), "TR")

    def test_bare_uk_maps_to_gb(self):
        self.assertEqual(dest.resolve_market("UK"), "GB")

    def test_lowercase_us_is_pronoun_not_country(self):
        self.assertIsNone(dest.resolve_market("us"))

    def test_unknown_bare_code_is_none(self):
        self.assertIsNone(dest.resolve_market("XX"))
        self.assertIsNone(dest.resolve_market("AB"))

    def test_word_boundary_protects_partial_matches(self):
        self.assertIsNone(dest.resolve_market("indiana"))

    def test_chinese_aliases(self):
        self.assertEqual(dest.resolve_market("美国"), "US")
        self.assertEqual(dest.resolve_market("荷兰"), "NL")
        self.assertEqual(dest.resolve_market("越南"), "VN")

    def test_empty_or_none_is_none(self):
        self.assertIsNone(dest.resolve_market(""))
        self.assertIsNone(dest.resolve_market(None))

    def test_fixture_shaped_noise_resolves(self):
        self.assertEqual(dest.resolve_market("Japan, Japan Looking for suppliers from"), "JP")
        self.assertEqual(dest.resolve_market("Sohar Port, Oman Looking for suppliers from"), "OM")


class ExtractDestinationTests(unittest.TestCase):
    def test_destination_cue(self):
        fields = dest.extract_destination("Wanted matcha. Destination: Japan")
        self.assertEqual(fields["destination_market"], "JP")
        self.assertEqual(fields["destination_raw"], "Japan")
        self.assertEqual(fields["destination_source_span"], "Destination: Japan")

    def test_destination_port_and_discharge_cues(self):
        self.assertEqual(dest.extract_destination("Destination Port : Germany")["destination_market"], "DE")
        self.assertEqual(dest.extract_destination("Port of Discharge: Rotterdam")["destination_market"], "NL")

    def test_ship_to_cue(self):
        self.assertEqual(dest.extract_destination("Please ship to Singapore")["destination_market"], "SG")

    def test_chinese_cues(self):
        self.assertEqual(dest.extract_destination("目的港：釜山")["destination_market"], "KR")
        self.assertEqual(dest.extract_destination("交货地：汉堡")["destination_market"], "DE")

    def test_no_cue_returns_unknown_triple(self):
        fields = dest.extract_destination("Wanted matcha powder 500 kg")
        self.assertEqual(fields, {"destination_raw": "", "destination_market": UNKNOWN, "destination_source_span": ""})

    def test_cue_without_resolvable_market_is_unknown(self):
        self.assertEqual(dest.extract_destination("Destination: Worldwide")["destination_market"], UNKNOWN)

    def test_destination_for_is_stripped(self):
        fields = dest.extract_destination("Wanted matcha. Destination for Germany. Quantity 500 kg")
        self.assertEqual(fields["destination_market"], "DE")
        self.assertEqual(fields["destination_raw"], "Germany")

    def test_trailing_platform_boilerplate_is_stripped(self):
        fields = dest.extract_destination("Destination: United Arab Emirates Looking for suppliers from: Worldwide")
        self.assertEqual(fields["destination_market"], "AE")
        self.assertEqual(fields["destination_raw"], "United Arab Emirates")

    def test_first_resolvable_match_wins(self):
        fields = dest.extract_destination("ship to Rotterdam ... destination: Canada")
        self.assertEqual(fields["destination_market"], "NL")


class DestinationFieldsTests(unittest.TestCase):
    def test_explicit_destination_raw_wins(self):
        row = {"title": "Wanted matcha", "description_raw": "beverage grade matcha"}
        fields = dest.destination_fields({**row, "destination_raw": "Los Angeles, California, United States"})
        self.assertEqual(fields["destination_market"], "US")

    def test_explicit_unresolvable_raw_falls_back_to_text(self):
        row = {"title": "Wanted matcha", "description_raw": "Wanted matcha. Destination: Japan",
               "destination_raw": "somewhere nice"}
        self.assertEqual(dest.destination_fields(row)["destination_market"], "JP")

    def test_extracts_from_title_and_description(self):
        row = {"title": "Wanted : Tea", "description_raw": "VERIFIED ... Destination Port : United Arab Emirates ..."}
        self.assertEqual(dest.destination_fields(row)["destination_market"], "AE")

    def test_never_falls_back_to_buyer_country(self):
        row = {"title": "Wanted matcha", "description_raw": "beverage grade matcha, no destination stated",
               "buyer_country_code": "US", "buyer_country_raw": "United States"}
        self.assertEqual(dest.destination_fields(row)["destination_market"], UNKNOWN)


class FixtureIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.resolved = [dest.destination_fields(r) for r in fixture_rows()]

    def test_fixture_resolves_22_of_51_rows(self):
        markets = [f["destination_market"] for f in self.resolved]
        self.assertEqual(sum(1 for m in markets if m != UNKNOWN), 22)
        self.assertEqual(sum(1 for m in markets if m == UNKNOWN), 29)

    def test_fixture_all_resolved_values_are_known_iso2(self):
        for f in self.resolved:
            self.assertIn(f["destination_market"], ISO2 | {UNKNOWN})

    def test_fixture_spot_checks(self):
        rows = fixture_rows()
        expected = {"TR": "CA", "GR": "GR", "UA": "UA", "VN": "VN", "LV": "LV",
                    "US": "US", "GB": "GB", "JP": "JP"}
        for dest_code, buyer_code in expected.items():
            found = any(
                dest.destination_fields(r)["destination_market"] == dest_code
                and r["buyer_country_code"] == buyer_code
                for r in rows
            )
            self.assertTrue(found, f"no row resolves {dest_code} for buyer {buyer_code}")

    def test_fixture_destination_differs_from_buyer_country(self):
        rows = fixture_rows()
        diverged = [
            (r["buyer_country_code"], dest.destination_fields(r)["destination_market"])
            for r in rows
            if dest.destination_fields(r)["destination_market"] not in {UNKNOWN, r["buyer_country_code"]}
        ]
        self.assertIn(("CA", "TR"), diverged)  # 买家在加拿大，目的地土耳其
        self.assertIn(("OM", "PH"), diverged)  # 买家在阿曼，目的地菲律宾


class StoreBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._tmp = tempfile.TemporaryDirectory()
        db_path = Path(cls._tmp.name) / "store.db"
        store.build_store(input_csv=FIXTURE, db_path=db_path)
        cls.conn = sqlite3.connect(db_path)
        cls.conn.row_factory = sqlite3.Row
        cls.rows = bridge.build_export_rows(cls.conn)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.conn.close()
        cls._tmp.cleanup()

    def test_parse_demand_uses_destination_not_buyer_country(self):
        row = {"category_code": "MATCHA", "title": "Wanted matcha", "description_raw": "beverage grade",
               "quantity_raw": "500 kg", "buyer_country_code": "US"}
        self.assertIsNone(fit.parse_demand(row).destination_market)
        row["description_raw"] = "Wanted matcha. Destination: Japan"
        self.assertEqual(fit.parse_demand(row).destination_market, "JP")
        row["destination_market"] = "DE"  # 行内已解析值优先
        self.assertEqual(fit.parse_demand(row).destination_market, "DE")

    def test_store_writes_destination_observations(self):
        rows = self.conn.execute(
            "SELECT raw_value, evidence_span FROM field_observation WHERE field_code='destination_market'"
        ).fetchall()
        self.assertEqual(len(rows), 51)
        resolved = [r for r in rows if r["raw_value"] is not None]
        self.assertEqual(len(resolved), 22)
        self.assertTrue(all(r["raw_value"] in ISO2 for r in resolved))
        self.assertTrue(all(r["evidence_span"] for r in resolved))  # 可回溯证据

    def test_bridge_exports_destination_not_buyer_country(self):
        for row in self.rows:
            self.assertIn(row["fields"]["destination"], ISO2 | {UNKNOWN})
        resolved_exported = {r["fields"]["destination"] for r in self.rows if r["fields"]["destination"] != UNKNOWN}
        # 每个导出的目的地都能在 field_observation 里找到证据行（绝非买家国家兜底）
        observed = {r["raw_value"] for r in self.conn.execute(
            "SELECT raw_value FROM field_observation WHERE field_code='destination_market' AND raw_value IS NOT NULL"
        ).fetchall()}
        self.assertTrue(resolved_exported <= observed)
        self.assertGreater(len(resolved_exported), 0)
        # fixture 里两个 CA 买家都没在正文里声明收货地在加拿大，不得出现 CA 目的地
        self.assertNotIn("CA", resolved_exported)

    def test_adapter_destination_is_not_buyer_country(self):
        items, _ = risk.classify_risk_items_from_context(category="MATCHA", destination="US")
        self.assertNotIn("MARKET_ACCESS_UNKNOWN", {i["code"] for i in items})
        items, _ = risk.classify_risk_items_from_context(category="MATCHA", destination="")
        self.assertIn("MARKET_ACCESS_UNKNOWN", {i["code"] for i in items})


if __name__ == "__main__":
    unittest.main(verbosity=2)
