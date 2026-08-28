"""Credential-gated connectors for Buyer Hunter sales-intelligence providers.

The module deliberately separates three states: code available, credentials
configured, and a live upstream connection verified.  It never treats missing
credentials or an undocumented commercial endpoint as a successful connection.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urljoin

import requests


TRANSIENT_STATUS = {429, 500, 502, 503, 504}


@dataclass(frozen=True)
class ConnectorHealth:
    provider: str
    status: str
    configured: bool
    live_verified: bool
    message: str
    checked_at: str
    http_status: int | None = None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _health(provider: str, status: str, configured: bool, verified: bool,
            message: str, http_status: int | None = None) -> ConnectorHealth:
    return ConnectorHealth(provider, status, configured, verified, message, utc_now(), http_status)


class JsonHttpClient:
    """Small retrying JSON client. Credentials are never included in errors."""

    def __init__(self, session: requests.Session | None = None, retries: int = 2):
        self.session = session or requests.Session()
        self.retries = max(0, retries)

    def request(self, method: str, url: str, *, headers: dict[str, str] | None = None,
                params: dict[str, Any] | None = None, payload: dict[str, Any] | None = None,
                form: dict[str, Any] | None = None,
                timeout: tuple[int, int] = (7, 30)) -> tuple[int, Any]:
        response: requests.Response | None = None
        for attempt in range(self.retries + 1):
            response = self.session.request(
                method, url, headers=headers, params=params, json=payload, data=form,
                timeout=timeout, allow_redirects=True,
            )
            if response.status_code not in TRANSIENT_STATUS or attempt == self.retries:
                break
            time.sleep(2 ** attempt)
        assert response is not None
        try:
            body: Any = response.json()
        except ValueError:
            body = {"message": (response.text or "")[:500]}
        return response.status_code, body


def status_from_http(provider: str, code: int, body: Any) -> ConnectorHealth:
    if 200 <= code < 300:
        return _health(provider, "HEALTHY", True, True, "Upstream authentication verified.", code)
    if code in (401, 403):
        return _health(provider, "AUTH_FAILED", True, False, "Credential rejected or scope unavailable.", code)
    if code == 429:
        return _health(provider, "RATE_LIMITED", True, False, "Upstream rate limit reached.", code)
    return _health(provider, "UPSTREAM_ERROR", True, False, "Upstream health check failed.", code)


class ApolloConnector:
    provider = "apollo"
    base_url = "https://api.apollo.io/api/v1/"

    def __init__(self, api_key: str | None = None, client: JsonHttpClient | None = None):
        self.api_key = api_key or os.getenv("APOLLO_API_KEY", "")
        self.client = client or JsonHttpClient()

    @property
    def headers(self) -> dict[str, str]:
        return {"x-api-key": self.api_key, "Content-Type": "application/json"}

    def health(self) -> ConnectorHealth:
        if not self.api_key:
            return _health(self.provider, "WAITING_CREDENTIALS", False, False, "Set APOLLO_API_KEY.")
        code, body = self.client.request("GET", urljoin(self.base_url, "auth/health"), headers=self.headers)
        return status_from_http(self.provider, code, body)

    def search_companies(self, *, name: str | None = None, domains: list[str] | None = None,
                         keywords: list[str] | None = None, locations: list[str] | None = None,
                         page: int = 1, per_page: int = 25) -> tuple[int, Any]:
        params: dict[str, Any] = {"page": page, "per_page": min(max(per_page, 1), 100)}
        if name:
            params["q_organization_name"] = name
        if domains:
            params["q_organization_domains_list[]"] = domains
        if keywords:
            params["q_organization_keyword_tags[]"] = keywords
        if locations:
            params["organization_locations[]"] = locations
        return self.client.request(
            "POST", urljoin(self.base_url, "mixed_companies/search"),
            headers=self.headers, params=params,
        )

    def enrich_organization(self, domain: str) -> tuple[int, Any]:
        if not domain:
            raise ValueError("domain is required by Apollo organization enrichment")
        return self.client.request(
            "GET", urljoin(self.base_url, "organizations/enrich"),
            headers=self.headers, params={"domain": domain},
        )

    def enrich_person(self, *, name: str | None = None, email: str | None = None,
                      domain: str | None = None, linkedin_url: str | None = None) -> tuple[int, Any]:
        params = {k: v for k, v in {
            "name": name, "email": email, "domain": domain, "linkedin_url": linkedin_url,
            "reveal_personal_emails": False, "reveal_phone_number": False,
        }.items() if v is not None}
        if not any(params.get(key) for key in ("name", "email", "linkedin_url")):
            raise ValueError("name, email, or linkedin_url is required")
        return self.client.request(
            "POST", urljoin(self.base_url, "people/match"),
            headers=self.headers, params=params,
        )

    @staticmethod
    def buying_intent_api_status() -> dict[str, str]:
        return {
            "status": "NOT_EXPOSED_IN_PUBLIC_OPENAPI",
            "message": "Do not fabricate Buying Intent API data; use plan-enabled export/UI or a vendor-approved endpoint.",
        }


class AlibabaRfqConnector:
    """Authorized Alibaba ICBU RFQ API client using TOP HMAC-MD5 signing."""

    provider = "alibaba_rfq"
    endpoint = "https://eco.taobao.com/router/rest"
    search_method = "alibaba.icbu.rfq.search"
    detail_method = "alibaba.icbu.rfqdetail.get"

    def __init__(self, app_key: str | None = None, app_secret: str | None = None,
                 session_key: str | None = None, client: JsonHttpClient | None = None):
        self.app_key = app_key or os.getenv("ALIBABA_ICBU_APP_KEY", "")
        self.app_secret = app_secret or os.getenv("ALIBABA_ICBU_APP_SECRET", "")
        self.session_key = session_key or os.getenv("ALIBABA_ICBU_SESSION_KEY", "")
        self.client = client or JsonHttpClient()

    @property
    def configured(self) -> bool:
        return bool(self.app_key and self.app_secret and self.session_key)

    def health(self) -> ConnectorHealth:
        if not self.configured:
            return _health(
                self.provider, "WAITING_CREDENTIALS", False, False,
                "Set ALIBABA_ICBU_APP_KEY, ALIBABA_ICBU_APP_SECRET, and ALIBABA_ICBU_SESSION_KEY.",
            )
        return _health(
            self.provider, "CONFIGURED_UNVERIFIED", True, False,
            "Credentials are present; run an explicit RFQ search smoke test to verify API scope.",
        )

    @staticmethod
    def sign(params: dict[str, Any], app_secret: str) -> str:
        canonical = "".join(f"{key}{params[key]}" for key in sorted(params) if key != "sign")
        return hmac.new(
            app_secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.md5,
        ).hexdigest().upper()

    def _execute(self, method: str, business_params: dict[str, Any]) -> tuple[int, Any]:
        if not self.configured:
            raise RuntimeError("Alibaba ICBU App Key, App Secret, and Session Key are required")
        params: dict[str, Any] = {
            "method": method,
            "app_key": self.app_key,
            "session": self.session_key,
            "timestamp": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S"),
            "format": "json",
            "v": "2.0",
            "sign_method": "hmac",
            **business_params,
        }
        params["sign"] = self.sign(params, self.app_secret)
        return self.client.request(
            "POST", self.endpoint,
            headers={"Content-Type": "application/x-www-form-urlencoded;charset=utf-8"},
            form=params,
        )

    def search(self, search_text: str, *, page: int = 1, page_size: int = 20,
               country: str | None = None, category_id: str | None = None) -> tuple[int, Any]:
        if not search_text.strip():
            raise ValueError("search_text is required")
        cond: dict[str, Any] = {
            "search_text": search_text.strip(),
            "current_page": max(1, page),
            "page_size": min(max(1, page_size), 100),
        }
        if country:
            cond["country"] = country
        if category_id:
            cond["category_id"] = category_id
        return self._execute(self.search_method, {"cond": json.dumps(cond, separators=(",", ":"))})

    def get_detail(self, rfq_id: str) -> tuple[int, Any]:
        if not rfq_id.strip():
            raise ValueError("rfq_id is required")
        query = json.dumps({"rfq_id": rfq_id.strip()}, separators=(",", ":"))
        return self._execute(self.detail_method, {"rfq_query_dto": query})


class VolzaConnector:
    provider = "volza"
    base_url = "https://backend.volza.com/api/v1/"

    def __init__(self, token: str | None = None, client: JsonHttpClient | None = None):
        self.token = token or os.getenv("VOLZA_API_TOKEN", "")
        self.client = client or JsonHttpClient()

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def health(self) -> ConnectorHealth:
        if not self.token:
            return _health(self.provider, "WAITING_CREDENTIALS", False, False, "Set VOLZA_API_TOKEN.")
        code, body = self.client.request(
            "GET", urljoin(self.base_url, "countries/list"), headers=self.headers,
        )
        return status_from_http(self.provider, code, body)

    def contracted_request(self, operation: str, *, params: dict[str, Any] | None = None,
                           payload: dict[str, Any] | None = None) -> tuple[int, Any]:
        env_name = "VOLZA_" + operation.upper() + "_PATH"
        path = os.getenv(env_name, "").strip()
        if not path:
            raise RuntimeError(f"{env_name} is required from the activated Volza API contract")
        method = "GET" if payload is None else "POST"
        return self.client.request(
            method, urljoin(self.base_url, path.lstrip("/")), headers=self.headers,
            params=params, payload=payload,
        )


class TrademoConnector:
    provider = "trademo"

    def __init__(self, api_key: str | None = None, base_url: str | None = None,
                 client: JsonHttpClient | None = None):
        self.api_key = api_key or os.getenv("TRADEMO_API_KEY", "")
        self.base_url = (base_url or os.getenv("TRADEMO_API_BASE_URL", "")).rstrip("/") + "/"
        self.client = client or JsonHttpClient()

    def health(self) -> ConnectorHealth:
        if not self.api_key or self.base_url == "/":
            return _health(
                self.provider, "WAITING_COMMERCIAL_API_CONTRACT", False, False,
                "Set TRADEMO_API_KEY and TRADEMO_API_BASE_URL from Trademo onboarding.",
            )
        health_path = os.getenv("TRADEMO_HEALTH_PATH", "").strip()
        if not health_path:
            return _health(
                self.provider, "CONFIGURED_UNVERIFIED", True, False,
                "Credentials are present; set TRADEMO_HEALTH_PATH from the vendor contract.",
            )
        header_name = os.getenv("TRADEMO_AUTH_HEADER", "Authorization")
        prefix = os.getenv("TRADEMO_AUTH_PREFIX", "Bearer ")
        code, body = self.client.request(
            "GET", urljoin(self.base_url, health_path.lstrip("/")),
            headers={header_name: prefix + self.api_key, "Content-Type": "application/json"},
        )
        return status_from_http(self.provider, code, body)

    def contracted_request(self, operation: str, payload: dict[str, Any]) -> tuple[int, Any]:
        path_env = "TRADEMO_" + operation.upper() + "_PATH"
        path = os.getenv(path_env, "").strip()
        if not path:
            raise RuntimeError(f"{path_env} is required from the activated Trademo API contract")
        header_name = os.getenv("TRADEMO_AUTH_HEADER", "Authorization")
        prefix = os.getenv("TRADEMO_AUTH_PREFIX", "Bearer ")
        return self.client.request(
            "POST", urljoin(self.base_url, path.lstrip("/")),
            headers={header_name: prefix + self.api_key, "Content-Type": "application/json"},
            payload=payload,
        )


class ClayConnector:
    provider = "clay"

    def __init__(self, webhook_url: str | None = None, auth_token: str | None = None,
                 client: JsonHttpClient | None = None):
        self.webhook_url = webhook_url or os.getenv("CLAY_WEBHOOK_URL", "")
        self.auth_token = auth_token or os.getenv("CLAY_WEBHOOK_TOKEN", "")
        self.client = client or JsonHttpClient()

    def health(self) -> ConnectorHealth:
        if not self.webhook_url:
            return _health(self.provider, "WAITING_WEBHOOK", False, False, "Set CLAY_WEBHOOK_URL.")
        if not self.webhook_url.startswith("https://"):
            return _health(self.provider, "INVALID_CONFIGURATION", True, False, "Clay webhook must use HTTPS.")
        return _health(
            self.provider, "CONFIGURED_UNVERIFIED", True, False,
            "Webhook configured; use --send-clay-test for an explicit external write test.",
        )

    @property
    def headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.auth_token:
            header_name = os.getenv("CLAY_AUTH_HEADER", "Authorization")
            prefix = os.getenv("CLAY_AUTH_PREFIX", "Bearer ")
            headers[header_name] = prefix + self.auth_token
        return headers

    def send_opportunity(self, opportunity: dict[str, Any], *, send: bool = False) -> tuple[int, Any]:
        payload = normalize_opportunity(opportunity)
        if not send:
            return 0, {"status": "DRY_RUN", "payload": payload}
        if not self.webhook_url:
            raise RuntimeError("CLAY_WEBHOOK_URL is required")
        return self.client.request("POST", self.webhook_url, headers=self.headers, payload=payload)


def normalize_opportunity(source: dict[str, Any]) -> dict[str, Any]:
    """Build the minimum stable payload shared by all four providers."""
    return {
        "schema_version": "sales-intelligence-connector-v1",
        "signal_id": source.get("signal_id"),
        "category_code": source.get("category_code"),
        "product_terms": source.get("product_terms", []),
        "hs_codes": source.get("hs_codes", []),
        "buyer": {
            "name": source.get("buyer_name"),
            "domain": source.get("buyer_domain"),
            "country_code": source.get("buyer_country_code"),
        },
        "demand": {
            "title": source.get("title"),
            "description": source.get("description"),
            "published_at": source.get("published_at"),
            "source_url": source.get("source_url"),
        },
        "truth": {
            "score": source.get("truth_score"),
            "level": source.get("truth_level"),
            "dimensions": source.get("truth_dimensions", {}),
        },
        "enrichment": source.get("enrichment", {}),
        "exported_at": utc_now(),
    }


def all_health() -> list[ConnectorHealth]:
    return [
        AlibabaRfqConnector().health(), ApolloConnector().health(), VolzaConnector().health(),
        TrademoConnector().health(), ClayConnector().health(),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Buyer Hunter sales-intelligence connector control")
    parser.add_argument("--health", action="store_true")
    parser.add_argument("--send-clay-test", action="store_true")
    args = parser.parse_args()
    if args.send_clay_test:
        code, body = ClayConnector().send_opportunity({
            "signal_id": "connector-smoke-test", "category_code": "MATCHA",
            "title": "Buyer Hunter connector smoke test",
        }, send=True)
        print(json.dumps({"provider": "clay", "http_status": code, "response": body}, ensure_ascii=False, indent=2))
        return 0 if 200 <= code < 300 else 1
    if args.health or not args.send_clay_test:
        print(json.dumps([asdict(item) for item in all_health()], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
