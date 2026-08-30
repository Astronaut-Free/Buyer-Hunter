"""Bridge v2 reverse channel: agent runtime outcomes -> Free SQLite decision store.

The Node agent runtime (A2/A6) persists its state to `agent/server/agent-state.json`
and, alongside it, writes `agent/db/agent-outcomes.json` (same file-exchange
pattern as the forward bridge). This script imports that file back into the
Free decision store:

  - A6 outcomes (WON / LOST / STOPPED)   -> `deal_outcome` (only for ids that
    exist in `opportunity` — bridged Free opportunities; A2-only ids are skipped)
  - A2 discovered targets                -> `agent_discovered_target` (upserted
    idempotently on `seed_key`)
  - domain entity resolution             -> targets whose domain matches a Free
    buyer get matched_free_buyer_id + a buyer_alias + an AUTO_MERGE audit row

    python scripts/import_agent_outcomes.py [--db PATH] [--in PATH] [--verbose]

The import is idempotent (stable row ids, upsert keys), so it can be replayed
after every store rebuild (`build_opportunity_store_v1.py` does a full atomic
replace; run.ps1 -Export / make up run the import after the export).

Contract: contracts/opportunity-bridge-v1.md (v2 reverse channel).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "runtime" / "buyer_hunter.db"
DEFAULT_IN = ROOT / "agent" / "db" / "agent-outcomes.json"

import sys

if str(ROOT / "pipeline") not in sys.path:
    sys.path.insert(0, str(ROOT / "pipeline"))

from promotion_v1 import apply_promotions  # noqa: E402

# A6 outcome -> deal_outcome.stage. STOPPED (halted outreach) is not a loss and
# not a win; it lands as NEGOTIATING with the reason prefixed, because the
# relationship is still open in the Free store's vocabulary.
OUTCOME_STAGE = {"WON": "WON", "LOST": "LOST", "STOPPED": "NEGOTIATING"}
VALID_STAGES = {"NEGOTIATING", "WON", "LOST"}


def _sha(value: str, length: int = 16) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:length]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _coerce_text(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _fail(message: str) -> None:
    """结构化报错：一行中文信息 + exit 1（run.ps1 依赖 $LASTEXITCODE fail-fast）。"""
    print(f"错误：{message}", file=sys.stderr)
    raise SystemExit(1)


def _expect_text(value: Any, where: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        _fail(f"{where} 必须是字符串或 null，实际类型 {type(value).__name__}")
    return value


def _json_col(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        return json.dumps(str(value), ensure_ascii=False)


def build_outcome_rows(entries: dict[str, Any]) -> list[dict[str, Any]]:
    """Pure transform: a6_outcomes entries -> deal_outcome rows.

    Malformed input (non-list, non-dict entries, wrong field types) is a
    structured one-line error + exit 1 -- never a bare traceback.
    """
    a6_entries = entries.get("a6_outcomes")
    if a6_entries is None:
        a6_entries = []
    if not isinstance(a6_entries, list):
        _fail("entries.a6_outcomes 必须是数组（不能是其他类型）")
    out: list[dict[str, Any]] = []
    for item in a6_entries:
        if not isinstance(item, dict):
            _fail("a6_outcomes 条目必须是 JSON 对象")
        outcome = _expect_text(item.get("outcome"), "a6_outcomes 条目 outcome")
        if outcome not in OUTCOME_STAGE:
            continue
        opportunity_id = _expect_text(item.get("opportunity_id"), "a6_outcomes 条目 opportunity_id")
        if not opportunity_id:
            continue
        reported_at = _expect_text(item.get("reported_at"), "a6_outcomes 条目 reported_at") or _now()
        stage = OUTCOME_STAGE[outcome]
        reason = _expect_text(item.get("reason"), "a6_outcomes 条目 reason") or ""
        if outcome == "STOPPED" and not reason.startswith("STOP_CONTACT"):
            reason = f"STOP_CONTACT: {reason}".strip()
        out.append(
            {
                "id": _sha(f"{opportunity_id}|{stage}|{reported_at}"),
                "opportunity_id": opportunity_id,
                "stage": stage,
                "reason": reason or None,
                "reported_at": reported_at,
            }
        )
    return out


def build_target_rows(entries: dict[str, Any]) -> list[dict[str, Any]]:
    """Pure transform: a2_targets opportunity rows -> agent_discovered_target rows."""
    a2_entries = entries.get("a2_targets")
    if a2_entries is None:
        a2_entries = []
    if not isinstance(a2_entries, list):
        _fail("entries.a2_targets 必须是数组（不能是其他类型）")
    out: list[dict[str, Any]] = []
    for opp in a2_entries:
        if not isinstance(opp, dict):
            _fail("a2_targets 条目必须是 JSON 对象")
        seed_key = _expect_text(opp.get("seed_key"), "a2_targets 条目 seed_key")
        if not seed_key:
            continue
        buyer = opp.get("buyer")
        if buyer is None:
            buyer = {}
        a2 = opp.get("a2")
        if a2 is None:
            a2 = {}
        if not isinstance(buyer, dict):
            _fail(f"a2_targets 条目 {seed_key!r} 的 buyer 必须是 JSON 对象（不能是其他类型）")
        if not isinstance(a2, dict):
            _fail(f"a2_targets 条目 {seed_key!r} 的 a2 必须是 JSON 对象（不能是其他类型）")
        rank_score = a2.get("rank_score")
        if rank_score is not None:
            if isinstance(rank_score, bool) or not isinstance(rank_score, (int, float)):
                _fail(f"a2_targets 条目 {seed_key!r} 的 a2.rank_score 必须是数字")
            if isinstance(rank_score, float) and not math.isfinite(rank_score):
                _fail(f"a2_targets 条目 {seed_key!r} 的 a2.rank_score 必须是有限数字")
        out.append(
            {
                "id": f"tgt_{_sha(seed_key)}",
                "seed_key": seed_key,
                "buyer_id": _expect_text(buyer.get("id"), f"{seed_key} 的 buyer.id") or seed_key,
                "buyer_name": _expect_text(buyer.get("name"), f"{seed_key} 的 buyer.name"),
                "country_code": _expect_text(
                    buyer.get("market") or buyer.get("country"), f"{seed_key} 的 buyer.country"
                ),
                "domain": _expect_text(buyer.get("domain"), f"{seed_key} 的 buyer.domain"),
                "contact_json": _json_col(opp.get("contact")),
                "status": _expect_text(opp.get("status"), f"{seed_key} 的 status"),
                "stage": _expect_text(opp.get("stage"), f"{seed_key} 的 stage"),
                "a2_rank_score": rank_score,
                "source": _expect_text(opp.get("source"), f"{seed_key} 的 source")
                or "A2_PROACTIVE_BUYER_DEVELOPMENT",
                "evidence_json": _json_col(opp.get("evidence_ids")),
                "seller_json": _json_col(opp.get("seller")),
                "first_seen_at": _expect_text(opp.get("created_at"), f"{seed_key} 的 created_at") or _now(),
                "last_seen_at": _expect_text(opp.get("updated_at"), f"{seed_key} 的 updated_at") or _now(),
            }
        )
    return out


def apply(conn: sqlite3.Connection, outcome_rows: list[dict[str, Any]], target_rows: list[dict[str, Any]]) -> dict[str, int]:
    """Idempotent apply: deal_outcome inserts + agent_discovered_target upserts."""
    inserted_outcomes = 0
    for row in outcome_rows:
        exists = conn.execute(
            "SELECT 1 FROM opportunity WHERE id = ?", (row["opportunity_id"],)
        ).fetchone()
        if not exists:
            continue  # A2-only opportunity id: no FK home in the Free store
        cur = conn.execute(
            "INSERT OR IGNORE INTO deal_outcome (id, opportunity_id, stage, reason, reported_at) "
            "VALUES (:id, :opportunity_id, :stage, :reason, :reported_at)",
            row,
        )
        inserted_outcomes += cur.rowcount

    inserted_targets = 0
    for row in target_rows:
        cur = conn.execute(
            """
            INSERT INTO agent_discovered_target
              (id, seed_key, buyer_id, buyer_name, country_code, domain, contact_json,
               status, stage, a2_rank_score, source, evidence_json, seller_json,
               matched_free_buyer_id, first_seen_at, last_seen_at)
            VALUES
              (:id, :seed_key, :buyer_id, :buyer_name, :country_code, :domain, :contact_json,
               :status, :stage, :a2_rank_score, :source, :evidence_json, :seller_json,
               NULL, :first_seen_at, :last_seen_at)
            ON CONFLICT(seed_key) DO UPDATE SET
              buyer_name = excluded.buyer_name,
              country_code = excluded.country_code,
              domain = excluded.domain,
              contact_json = excluded.contact_json,
              status = excluded.status,
              stage = excluded.stage,
              a2_rank_score = excluded.a2_rank_score,
              evidence_json = excluded.evidence_json,
              seller_json = excluded.seller_json,
              last_seen_at = excluded.last_seen_at
            """,
            row,
        )
        inserted_targets += 1

    return {"deal_outcome_inserted": inserted_outcomes, "target_upserted": inserted_targets}


def resolve_entities(conn: sqlite3.Connection, target_rows: list[dict[str, Any]]) -> int:
    """Domain entity resolution (contract v2 candidate #2).

    Casefold-match each A2 target's domain against Free `buyer.domain`; on a hit
    record the link (matched_free_buyer_id), an alias row and an AUTO_MERGE audit
    row. Idempotent (stable ids, OR IGNORE). Activates as buyer domains populate.
    """
    buyers: dict[str, dict[str, Any]] = {}
    for row in conn.execute(
        "SELECT id, canonical_name, domain FROM buyer WHERE domain IS NOT NULL AND domain != ''"
    ):
        buyers[row[2].casefold()] = {"id": row[0], "canonical_name": row[1]}

    links = 0
    for target in target_rows:
        domain = (target.get("domain") or "").strip()
        free_buyer = buyers.get(domain.casefold()) if domain else None
        if not free_buyer:
            continue
        conn.execute(
            "UPDATE agent_discovered_target SET matched_free_buyer_id = ? WHERE seed_key = ?",
            (free_buyer["id"], target["seed_key"]),
        )
        alias_normalized = (target.get("buyer_name") or "").strip().casefold() or target["seed_key"]
        conn.execute(
            "INSERT OR IGNORE INTO buyer_alias "
            "(id, buyer_id, alias_raw, alias_normalized, evidence_id, created_at) "
            "VALUES (?, ?, ?, ?, NULL, ?)",
            (
                _sha(f"alias|{free_buyer['id']}|{alias_normalized}"),
                free_buyer["id"],
                target.get("buyer_name"),
                alias_normalized,
                _now(),
            ),
        )
        conn.execute(
            "INSERT OR IGNORE INTO entity_merge_audit "
            "(id, kept_buyer_id, merged_buyer_id, score, feature_json, decision, decided_by, created_at) "
            "VALUES (?, ?, ?, ?, ?, 'AUTO_MERGE', 'reverse-bridge-v2', ?)",
            (
                _sha(f"merge|{free_buyer['id']}|{target['buyer_id']}|reverse-bridge-v2"),
                free_buyer["id"],
                target["buyer_id"],
                1.0,
                json.dumps(
                    {"domain_match": domain, "alias": target.get("buyer_name")},
                    ensure_ascii=False,
                ),
                _now(),
            ),
        )
        links += 1
    return links


def load_payload(in_path: Path) -> dict[str, Any] | None:
    if not in_path.exists():
        return None
    try:
        payload = json.loads(in_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        _fail(f"{in_path} 不是合法 JSON（截断或损坏，第 {exc.lineno} 行：{exc.msg}）")
    except UnicodeDecodeError as exc:
        _fail(f"{in_path} 不是 UTF-8 文本（{exc}）")
    except RecursionError:
        _fail(f"{in_path} 嵌套层级过深（超过解析器递归上限）")
    if not isinstance(payload, dict):
        _fail(f"{in_path} 根结构必须是 JSON 对象")
    entries = payload.get("entries", payload)
    if not isinstance(entries, dict):
        _fail(f"{in_path} 的 entries 必须是 JSON 对象")
    return entries


def import_outcomes(db_path: Path, in_path: Path) -> dict[str, Any]:
    if not db_path.exists():
        raise SystemExit(
            f"decision store not found: {db_path}\n"
            "run: python pipeline/build_opportunity_store_v1.py"
        )
    entries = load_payload(in_path)
    if entries is None:
        return {"skipped": True, "reason": "agent-outcomes.json missing", "entries": None}

    outcome_rows = build_outcome_rows(entries)
    target_rows = build_target_rows(entries)
    with sqlite3.connect(db_path) as conn:
        counts = apply(conn, outcome_rows, target_rows)
        entity_links = resolve_entities(conn, target_rows)
        promoted = apply_promotions(conn)
    return {
        "skipped": False,
        "a6_outcomes_read": len(entries.get("a6_outcomes", []) or []),
        "a2_targets_read": len(entries.get("a2_targets", []) or []),
        "entity_links": entity_links,
        "promoted": promoted,
        **counts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import agent outcomes into the decision store")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--in", dest="in_path", type=Path, default=DEFAULT_IN)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    result = import_outcomes(args.db, args.in_path)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
