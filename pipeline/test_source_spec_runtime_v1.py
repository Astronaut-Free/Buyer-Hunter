from __future__ import annotations

import hashlib
import importlib
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
collector = importlib.import_module("collect_b2b_public_v3")


CORE_FIELDS = (
    "source_url",
    "listing_url",
    "title",
    "description_raw",
    "buyer_name_raw",
    "buyer_name_span",
    "contact_person_raw",
    "contact_person_span",
    "buyer_country_raw",
    "buyer_country_span",
    "quantity_raw",
    "quantity_span",
    "published_at_raw",
    "published_at_span",
    "contact_gate",
)


class FakeResponse:
    status_code = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class SourceSpecContractTests(unittest.TestCase):
    def test_registry_exposes_exactly_nine_migrated_listings(self):
        taxonomy = collector.load_taxonomy()
        listings = collector.load_source_specs(collector.DEFAULT_REGISTRY, taxonomy=taxonomy)
        self.assertEqual(len(listings), 9)
        counts = {}
        for item in listings:
            counts[item["source_code"]] = counts.get(item["source_code"], 0) + 1
        self.assertEqual(counts, {"tradekey": 4, "go4worldbusiness": 5})
        self.assertTrue(all(item["save_raw_snapshot"] for item in listings))
        self.assertTrue(all(item["max_response_bytes"] == 2 * 1024 * 1024 for item in listings))

    def test_runtime_consumes_source_spec_response_cap(self):
        listing = {
            "max_response_bytes": 12345,
        }
        response = FakeResponse()
        with patch.object(collector, "read_capped", return_value=(b"ok", False)) as read:
            body, oversized = collector.read_response_body(response, listing)
        self.assertEqual(body, b"ok")
        self.assertFalse(oversized)
        read.assert_called_once_with(response, cap=12345)

    def test_evidence_requires_raw_snapshot(self):
        registry = {
            "source_spec_contract": collector.SOURCE_SPEC_CONTRACT,
            "sources": [{
                "code": "x",
                "source_spec": {
                    "contract": collector.SOURCE_SPEC_CONTRACT,
                    "version": 1,
                    "runtime": "PUBLIC_HTTP",
                    "parser_adapter": "tradekey",
                    "fetch": {
                        "method": "GET",
                        "max_response_bytes": 1000,
                        "save_raw_snapshot": False,
                    },
                    "policy": {
                        "require_source_url": True,
                        "require_evidence": True,
                    },
                    "listings": [{"category_code": "MATCHA", "url": "https://example.test"}],
                },
            }],
        }
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "registry.json"
            path.write_text(json.dumps(registry), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "require_evidence requires save_raw_snapshot"):
                collector.load_source_specs(path, taxonomy={"MATCHA": {}})

    def test_unselected_invalid_source_does_not_block_selected_runtime(self):
        registry = {
            "source_spec_contract": collector.SOURCE_SPEC_CONTRACT,
            "sources": [
                {
                    "code": "good",
                    "source_spec": {
                        "contract": collector.SOURCE_SPEC_CONTRACT,
                        "runtime": "PUBLIC_HTTP",
                        "parser_adapter": "tradekey",
                        "fetch": {"method": "GET", "save_raw_snapshot": True},
                        "policy": {"require_source_url": True, "require_evidence": True},
                        "listings": [{"category_code": "MATCHA", "url": "https://example.test/good"}],
                    },
                },
                {
                    "code": "draft_bad",
                    "source_spec": {
                        "contract": collector.SOURCE_SPEC_CONTRACT,
                        "runtime": "PUBLIC_HTTP",
                        "parser_adapter": "missing_adapter",
                        "fetch": {"method": "GET", "save_raw_snapshot": True},
                        "policy": {"require_source_url": True, "require_evidence": True},
                        "listings": [{"category_code": "UNKNOWN_CATEGORY", "url": "https://example.test/bad"}],
                    },
                },
            ],
        }
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "registry.json"
            path.write_text(json.dumps(registry), encoding="utf-8")
            listings = collector.load_source_specs(
                path,
                selected_sources={"good"},
                taxonomy={"MATCHA": {}},
            )
        self.assertEqual([item["source_code"] for item in listings], ["good"])

    def test_unsafe_access_policy_fails_closed(self):
        registry = {
            "source_spec_contract": collector.SOURCE_SPEC_CONTRACT,
            "sources": [{
                "code": "unsafe",
                "source_spec": {
                    "contract": collector.SOURCE_SPEC_CONTRACT,
                    "runtime": "PUBLIC_HTTP",
                    "parser_adapter": "tradekey",
                    "fetch": {"method": "GET", "save_raw_snapshot": True},
                    "policy": {
                        "login_required": True,
                        "require_source_url": True,
                        "require_evidence": True,
                    },
                    "listings": [{"category_code": "MATCHA", "url": "https://example.test/unsafe"}],
                },
            }],
        }
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "registry.json"
            path.write_text(json.dumps(registry), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "forbidden access policy"):
                collector.load_source_specs(path, selected_sources={"unsafe"}, taxonomy={"MATCHA": {}})

    def test_selected_unknown_parser_fails_closed(self):
        registry = {
            "source_spec_contract": collector.SOURCE_SPEC_CONTRACT,
            "sources": [{
                "code": "bad",
                "source_spec": {
                    "contract": collector.SOURCE_SPEC_CONTRACT,
                    "runtime": "PUBLIC_HTTP",
                    "parser_adapter": "missing_adapter",
                    "fetch": {"method": "GET", "save_raw_snapshot": True},
                    "policy": {"require_source_url": True, "require_evidence": True},
                    "listings": [{"category_code": "MATCHA", "url": "https://example.test/bad"}],
                },
            }],
        }
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "registry.json"
            path.write_text(json.dumps(registry), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "unknown parser adapter"):
                collector.load_source_specs(path, selected_sources={"bad"}, taxonomy={"MATCHA": {}})


class SourceSpecABRegressionTests(unittest.TestCase):
    def _listing(self, source_code: str) -> dict:
        listings = collector.load_source_specs(
            collector.DEFAULT_REGISTRY,
            selected_sources={source_code},
            taxonomy=collector.load_taxonomy(),
        )
        return next(item for item in listings if item["source_code"] == source_code)

    def _assert_ab(self, source_code: str, fixture_name: str, old_parser) -> None:
        raw_dir = PIPELINE / "tests" / "fixtures" / "b2b_public_v3" / "raw"
        body = (raw_dir / fixture_name).read_bytes()
        listing = self._listing(source_code)

        output_a = old_parser(body, listing["url"])
        output_b = collector.parse_listing_payload(listing, body)

        self.assertGreater(len(output_a), 0)
        self.assertEqual(len(output_b), len(output_a))
        digest = hashlib.sha256(body).hexdigest()
        with TemporaryDirectory() as tmp:
            snapshot = collector.save_raw_snapshot(Path(tmp), listing, body, digest)
            self.assertIsNotNone(snapshot)
            self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), digest)

        total = 0
        equal = 0
        for left, right in zip(output_a, output_b):
            for field in CORE_FIELDS:
                total += 1
                if left.get(field) == right.get(field):
                    equal += 1
        consistency = equal / total if total else 1.0
        self.assertGreaterEqual(consistency, 0.95)
        self.assertEqual(output_b, output_a)

        evidence_fields = (
            "buyer_name_span",
            "contact_person_span",
            "buyer_country_span",
            "quantity_span",
            "published_at_span",
        )
        for left, right in zip(output_a, output_b):
            for field in evidence_fields:
                self.assertEqual(right.get(field), left.get(field))

    def test_tradekey_fixture_ab_matches_legacy_parser(self):
        self._assert_ab(
            "tradekey",
            "tradekey_listing_sample.html",
            collector.parse_tradekey,
        )

    def test_go4worldbusiness_fixture_ab_matches_legacy_parser(self):
        self._assert_ab(
            "go4worldbusiness",
            "go4worldbusiness_listing_sample.html",
            collector.parse_go4worldbusiness,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
