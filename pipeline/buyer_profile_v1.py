"""Buyer identity keys + public buying-profile aggregation (phase-1 rules).

Account association keys ONLY on a verifiable identifier: a buyer domain, a
platform member/account id, an official page, or a registration id. Name +
country, similar company names, or product similarity NEVER merge accounts
(.agents/skills/buyer-hunter-demand-understanding/SKILL.md — 处理顺序 4/5).

Every fact in a buying profile carries a provenance tier:
  FACT       directly present in the post(s)
  DERIVED    aggregated across >= 2 posts of the same account
  INFERENCE  a pattern guessed from the posts
  UNKNOWN    no basis
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any
from urllib.parse import urlparse

FACT = "FACT"
DERIVED = "DERIVED"
INFERENCE = "INFERENCE"
UNKNOWN = "UNKNOWN"

# platform URLs that carry a *buyer account* id (never a post / buylead id)
_PLATFORM_ACCOUNT_RE = (
    re.compile(r"go4worldbusiness\.com/(?:suppliers?|company|companies|members?|profile)/([a-z0-9][a-z0-9._-]+)", re.I),
    re.compile(r"tradekey\.com/(?:company|profile|members?|user)/([a-z0-9][a-z0-9._-]+)", re.I),
    re.compile(r"ec21\.com/(?:company|profile)/([a-z0-9][a-z0-9._-]+)", re.I),
    re.compile(r"(?:alibaba|1688)\.com/(?:company|member|shop)/([a-z0-9][a-z0-9._-]+)", re.I),
    re.compile(r"exporthub\.com/(?:company|companies|members?)/([a-z0-9][a-z0-9._-]+)", re.I),
    re.compile(r"globalsources\.com/(?:manufacturers?|company|si)/([a-z0-9][a-z0-9._-]+)", re.I),
)

_STAGE_RANK = {
    "INQUIRY": 0,
    "SPEC_CONFIRMATION": 1,
    "SAMPLE": 2,
    "TRIAL_ORDER": 3,
    "BULK_RFQ": 4,
    "LONG_TERM_SUPPLY": 5,
}

_SPEC_TOKENS = (
    "organic", "ceremonial", "culinary", "bakery", "beverage", "powder",
    "grade", "mesh", "usda", "eu organic", "haccp", "kosher", "halal",
)


# --------------------------------------------------------------------------- #
# identity key
# --------------------------------------------------------------------------- #
def _host(domain_or_url: str) -> str:
    raw = (domain_or_url or "").strip().lower()
    if not raw:
        return ""
    if "://" not in raw:
        raw = "http://" + raw
    host = urlparse(raw).netloc or ""
    host = host.split("@")[-1].split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    return host.strip("./")


def account_key(row: dict[str, Any]) -> str | None:
    """First reliable identity key for ``row``, or ``None``.

    NEVER derived from ``contact_person_raw`` + country or from similar names.
    """
    domain = str(row.get("buyer_domain") or "").strip()
    if domain:
        host = _host(domain)
        if host and "." in host:
            return f"domain:{host}"

    platform_id = str(row.get("platform_account_id") or "").strip()
    if platform_id:
        return f"platform:{platform_id.lower()}"

    source_url = str(row.get("source_url") or row.get("evidence_url") or "")
    for regex in _PLATFORM_ACCOUNT_RE:
        match = regex.search(source_url)
        if match:
            platform = _host(source_url) or "platform"
            return f"platform:{platform}:{match.group(1).lower()}"

    registration_id = str(row.get("registration_id") or "").strip()
    if registration_id:
        return f"reg:{registration_id.lower()}"

    return None


# --------------------------------------------------------------------------- #
# history grouping
# --------------------------------------------------------------------------- #
def _transaction_stage(row: dict[str, Any]) -> str:
    from build_opportunity_store_v1 import buying_window_fields

    return str(buying_window_fields(row).get("transaction_stage") or "INQUIRY")


def _history_record(row: dict[str, Any], key: str) -> dict[str, Any]:
    title = str(row.get("title") or "")
    return {
        "association_key": key,
        "observed_at": str(row.get("observed_at") or row.get("published_at") or ""),
        "demand_summary": title[:120],
        "evidence_url": str(row.get("source_url") or row.get("evidence_url") or ""),
        "category_code": str(row.get("category_code") or ""),
        "quantity_raw": str(row.get("quantity_raw") or ""),
        "transaction_stage": _transaction_stage(row),
    }


def group_account_history(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Group rows by ``account_key``; rows with no reliable key are dropped."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        key = account_key(row)
        if key is None:
            continue
        groups.setdefault(key, []).append(_history_record(row, key))
    for records in groups.values():
        records.sort(key=lambda record: (record["observed_at"], record["evidence_url"]))
    return groups


# --------------------------------------------------------------------------- #
# buying profile
# --------------------------------------------------------------------------- #
def _tier_for_aggregate(multi: bool) -> str:
    return DERIVED if multi else FACT


def summarize_buying_profile(history: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate ONE account's public posts into a tiered buying profile."""
    fields = (
        "category_continuity", "common_specs", "quantity_range", "markets",
        "transaction_stages", "long_term_signal", "future_volume_signal",
        "repeat_post_count",
    )
    if not history:
        return {name: {"value": None, "tier": UNKNOWN} for name in fields} | {"evidence": []}

    count = len(history)
    multi = count >= 2
    categories = [record["category_code"] for record in history if record.get("category_code")]
    quantities = [record["quantity_raw"] for record in history if record.get("quantity_raw")]
    stages = [record["transaction_stage"] for record in history if record.get("transaction_stage")]
    ranks = [_STAGE_RANK.get(stage, 0) for stage in stages]
    summaries = " ".join(record.get("demand_summary", "") for record in history).lower()
    evidence = list(dict.fromkeys(record["evidence_url"] for record in history if record.get("evidence_url")))

    category_counter = Counter(categories)
    if not categories:
        category_continuity = {"value": None, "tier": UNKNOWN}
    elif len(category_counter) == 1:
        category_continuity = {
            "value": {"category_code": categories[0], "post_count": count},
            "tier": _tier_for_aggregate(multi),
        }
    else:
        category_continuity = {"value": {"categories": dict(category_counter)}, "tier": DERIVED}

    spec_hits = sorted({token for token in _SPEC_TOKENS if token in summaries})
    if not spec_hits:
        common_specs = {"value": None, "tier": UNKNOWN}
    else:
        common_specs = {"value": spec_hits, "tier": INFERENCE if multi else FACT}

    if not quantities:
        quantity_range = {"value": None, "tier": UNKNOWN}
    else:
        distinct = sorted(set(quantities))
        quantity_range = {
            "value": {"observed": distinct},
            "tier": DERIVED if len(distinct) > 1 else FACT,
        }

    # destination is not part of a title-only history record
    markets = {"value": None, "tier": UNKNOWN}

    if not stages:
        transaction_stages = {"value": None, "tier": UNKNOWN}
    else:
        transaction_stages = {
            "value": {
                "observed": [stage for stage, _ in Counter(stages).most_common()],
                "latest": history[-1].get("transaction_stage"),
            },
            "tier": _tier_for_aggregate(multi),
        }

    has_long_term = any(rank == 5 for rank in ranks)
    if has_long_term:
        long_term_signal = {"value": True, "tier": _tier_for_aggregate(multi)}
    elif stages:
        long_term_signal = {"value": False, "tier": INFERENCE if multi else UNKNOWN}
    else:
        long_term_signal = {"value": None, "tier": UNKNOWN}

    escalating = len(ranks) >= 2 and ranks[-1] > ranks[0]
    if not stages:
        future_volume_signal = {"value": None, "tier": UNKNOWN}
    elif escalating or (ranks and max(ranks) >= 4):
        future_volume_signal = {
            "value": True,
            "tier": DERIVED if (multi and escalating) else _tier_for_aggregate(multi),
        }
    else:
        future_volume_signal = {"value": False, "tier": INFERENCE if multi else UNKNOWN}

    repeat_post_count = {"value": count, "tier": DERIVED if multi else FACT}

    return {
        "category_continuity": category_continuity,
        "common_specs": common_specs,
        "quantity_range": quantity_range,
        "markets": markets,
        "transaction_stages": transaction_stages,
        "long_term_signal": long_term_signal,
        "future_volume_signal": future_volume_signal,
        "repeat_post_count": repeat_post_count,
        "evidence": evidence,
    }


def build_buyer_context(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """``account_key -> {same_account_public_history, buying_profile}``.

    Rows whose ``account_key`` is ``None`` produce no entry — the caller falls
    back to an empty context for those.
    """
    context: dict[str, dict[str, Any]] = {}
    for key, history in group_account_history(rows).items():
        context[key] = {
            "same_account_public_history": history,
            "buying_profile": summarize_buying_profile(history) if history else None,
        }
    return context
