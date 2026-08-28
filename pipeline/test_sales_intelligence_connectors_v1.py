from __future__ import annotations

import importlib
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
connectors = importlib.import_module("sales_intelligence_connectors_v1")


def response(status: int, body: dict) -> Mock:
    item = Mock(status_code=status, text="")
    item.json.return_value = body
    return item


class HttpClientTests(unittest.TestCase):
    def test_retries_only_transient_status(self):
        session = Mock()
        session.request.side_effect = [response(503, {}), response(200, {"ok": True})]
        client = connectors.JsonHttpClient(session, retries=2)
        with patch.object(connectors.time, "sleep"):
            code, body = client.request("GET", "https://example.test")
        self.assertEqual(code, 200)
        self.assertEqual(session.request.call_count, 2)

    def test_does_not_retry_auth_failure(self):
        session = Mock()
        session.request.return_value = response(401, {"error": "bad key"})
        code, _ = connectors.JsonHttpClient(session).request("GET", "https://example.test")
        self.assertEqual(code, 401)
        self.assertEqual(session.request.call_count, 1)


class ApolloTests(unittest.TestCase):
    def test_waits_without_key(self):
        with patch.dict(os.environ, {}, clear=True):
            item = connectors.ApolloConnector().health()
        self.assertEqual(item.status, "WAITING_CREDENTIALS")

    def test_health_uses_key_header(self):
        session = Mock()
        session.request.return_value = response(200, {"is_logged_in": True})
        item = connectors.ApolloConnector("secret", connectors.JsonHttpClient(session)).health()
        self.assertEqual(item.status, "HEALTHY")
        kwargs = session.request.call_args.kwargs
        self.assertEqual(kwargs["headers"]["x-api-key"], "secret")
        self.assertNotIn("secret", item.message)

    def test_organization_enrichment_requires_domain(self):
        with self.assertRaises(ValueError):
            connectors.ApolloConnector("secret").enrich_organization("")

    def test_public_openapi_does_not_claim_intent_endpoint(self):
        self.assertEqual(
            connectors.ApolloConnector.buying_intent_api_status()["status"],
            "NOT_EXPOSED_IN_PUBLIC_OPENAPI",
        )


class CommercialConnectorTests(unittest.TestCase):
    def test_volza_uses_bearer_token(self):
        session = Mock()
        session.request.return_value = response(200, {"countries": []})
        item = connectors.VolzaConnector("volza-secret", connectors.JsonHttpClient(session)).health()
        self.assertTrue(item.live_verified)
        self.assertEqual(session.request.call_args.kwargs["headers"]["Authorization"], "Bearer volza-secret")

    def test_trademo_requires_vendor_contract(self):
        with patch.dict(os.environ, {}, clear=True):
            item = connectors.TrademoConnector().health()
        self.assertEqual(item.status, "WAITING_COMMERCIAL_API_CONTRACT")

    def test_clay_is_dry_run_by_default(self):
        session = Mock()
        clay = connectors.ClayConnector("https://example.test/hook", client=connectors.JsonHttpClient(session))
        code, body = clay.send_opportunity({"signal_id": "sig-1"})
        self.assertEqual(code, 0)
        self.assertEqual(body["status"], "DRY_RUN")
        session.request.assert_not_called()

    def test_clay_send_requires_explicit_flag(self):
        session = Mock()
        session.request.return_value = response(200, {"ok": True})
        clay = connectors.ClayConnector("https://example.test/hook", "token", connectors.JsonHttpClient(session))
        code, _ = clay.send_opportunity({"signal_id": "sig-1"}, send=True)
        self.assertEqual(code, 200)
        self.assertEqual(session.request.call_args.args[:2], ("POST", "https://example.test/hook"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
