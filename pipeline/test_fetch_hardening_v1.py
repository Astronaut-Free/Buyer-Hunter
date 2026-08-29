"""Covers the shared fetch hardening:

- a credential passed as ``params`` never lands in the stored probe URL (F1);
- an oversized response is aborted mid-stream as ``TOO_LARGE`` (F6);
- parsers are injected as arguments, not by patching module globals (F2).
"""

from __future__ import annotations

import importlib
import os
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


PIPELINE = Path(__file__).resolve().parent
sys.path.insert(0, str(PIPELINE))
core = importlib.import_module("collect_samples")
v2 = importlib.import_module("collect_samples_v2")


class FakeResponse:
    def __init__(self, *, status=200, content=b"", headers=None, url="", text=""):
        self.status_code = status
        self._content = content
        self.headers = headers or {}
        self.url = url
        self.text = text

    @property
    def ok(self):
        return self.status_code < 400

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_content(self, chunk_size=1):
        for start in range(0, len(self._content), max(1, chunk_size)):
            yield self._content[start:start + chunk_size]


class FakeSession:
    def __init__(self, main_response):
        self.main_response = main_response
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        if url.endswith("/robots.txt"):
            return FakeResponse(status=404, text="")
        return self.main_response

    def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        return self.main_response

    def main_call(self):
        return next(c for c in self.calls if not c[1].endswith("/robots.txt"))


class FetchHardeningTests(unittest.TestCase):
    def test_credential_param_never_reaches_probe_url(self):
        response = FakeResponse(
            status=200,
            content=b'{"opportunitiesData": []}',
            headers={"content-type": "application/json"},
            url="https://api.sam.gov/opportunities/v2/search?api_key=SECRET123",
        )
        session = FakeSession(response)
        with TemporaryDirectory() as tmp:
            probe, _ = core.fetch_one(
                session,
                {"code": "sam_gov", "access": "official_api"},
                "https://api.sam.gov/opportunities/v2/search",
                Path(tmp),
                params={"api_key": "SECRET123"},
            )
        self.assertEqual(probe.url, "https://api.sam.gov/opportunities/v2/search")
        self.assertNotIn("SECRET123", probe.url)
        self.assertEqual(session.main_call()[2]["params"], {"api_key": "SECRET123"})

    def test_oversized_response_is_aborted(self):
        payload = b"x" * (core.MAX_BYTES + 4096)
        session = FakeSession(FakeResponse(
            status=200, content=payload,
            headers={"content-type": "text/html"}, url="https://example.test/huge",
        ))
        with TemporaryDirectory() as tmp:
            probe, records = core.fetch_one(
                session,
                {"code": "huge", "access": "public_html"},
                "https://example.test/huge",
                Path(tmp),
            )
            self.assertEqual(probe.status, "TOO_LARGE")
            self.assertEqual(records, [])
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_parser_is_injected_not_patched(self):
        marker = [{"source_code": "x", "marker": "injected"}]
        session = FakeSession(FakeResponse(
            status=200, content=b"<html>hi</html>",
            headers={"content-type": "text/html"}, url="https://example.test/x",
        ))
        original = core.parse_html_records
        with TemporaryDirectory() as tmp:
            _, records = core.fetch_one(
                session,
                {"code": "x", "access": "public_html"},
                "https://example.test/x",
                Path(tmp),
                html_parser=lambda code, url, body: marker,
            )
        self.assertEqual(records, marker)
        self.assertIs(core.parse_html_records, original)

    def test_v2_fetch_sends_credential_as_param(self):
        os.environ["FAKE_SAM_KEY"] = "TOPSECRET"
        self.addCleanup(os.environ.pop, "FAKE_SAM_KEY", None)
        session = FakeSession(FakeResponse(
            status=200, content=b'{"opportunitiesData": []}',
            headers={"content-type": "application/json"}, url="https://api.example/search",
        ))
        source = {"code": "sam_gov", "access": "official_api", "requires_env": "FAKE_SAM_KEY"}
        with TemporaryDirectory() as tmp:
            probe, _ = v2.fetch(session, source, "https://api.example/search", Path(tmp))
        self.assertEqual(probe.url, "https://api.example/search")
        self.assertNotIn("TOPSECRET", probe.url or "")
        self.assertEqual(session.main_call()[2]["params"], {"api_key": "TOPSECRET"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
