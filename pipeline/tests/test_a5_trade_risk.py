from pipeline.skills.a5_trade_risk import run


BASE = {"opportunity_id": "opp-a5", "evaluated_at": "2026-08-29T00:00:00Z", "buyer_country": "US", "product": {}, "seller_sku": {}, "seller_policy": {}}


def allowed(market="JP"):
    return [{"market": market, "result": "ALLOWED", "evidence_ref": "reg-ok"}]


def test_destination_missing_is_unknown():
    result = run(BASE)
    assert result["run_status"] == "MORE_EVIDENCE"
    assert result["domain_result"]["access_status"] == "UNKNOWN"


def test_buyer_country_is_not_copied_to_destination():
    result = run({**BASE, "destination_market": "JP", "regulatory_evidence": allowed()})
    assert result["domain_result"]["buyer_country"] == "US"
    assert result["domain_result"]["destination_market"] == "JP"


def test_regulation_unknown_is_conditional():
    result = run({**BASE, "destination_market": "JP"})
    assert result["domain_result"]["access_status"] == "CONDITIONAL"
    assert "regulatory_evidence" in result["missing_evidence"]


def test_explicit_prohibition_with_evidence_blocks():
    result = run({**BASE, "destination_market": "JP", "regulatory_evidence": [{"market": "JP", "result": "PROHIBITED", "evidence_ref": "reg-block"}]})
    assert result["run_status"] == "BLOCKED"
    assert result["domain_result"]["access_status"] == "BLOCK"


def test_prohibition_without_evidence_is_not_a_block():
    result = run({**BASE, "destination_market": "JP",
                  "regulatory_evidence": [{"market": "JP", "result": "PROHIBITED"}]})
    assert result["run_status"] == "MORE_EVIDENCE"
    assert result["domain_result"]["access_status"] == "CONDITIONAL"


def test_other_market_prohibition_cannot_block_destination():
    result = run({**BASE, "destination_market": "JP",
                  "regulatory_evidence": [{"market": "US", "result": "PROHIBITED", "evidence_ref": "reg-us"}]})
    assert result["run_status"] == "MORE_EVIDENCE"
    assert result["domain_result"]["access_status"] == "CONDITIONAL"


def test_certification_gap_uses_fixed_code():
    result = run({**BASE, "destination_market": "JP", "regulatory_evidence": allowed(),
                  "product": {"mandatory_certifications": ["JAS"]}, "seller_sku": {"certifications": []}})
    assert any(item["code"] == "CERTIFICATION_GAP" for item in result["domain_result"]["risk_items"])


def test_payment_risk_uses_fixed_code():
    result = run({**BASE, "destination_market": "JP", "regulatory_evidence": allowed(),
                  "payment_terms": "OA90", "seller_policy": {"allowed_payment_terms": ["TT", "LC"]}})
    assert any(item["code"] == "PAYMENT_TERM_RISK" for item in result["domain_result"]["risk_items"])
