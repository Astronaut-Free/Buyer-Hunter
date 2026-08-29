from pipeline.skills.a3_purchase_timing import run


BASE = {"opportunity_id": "opp-a3", "evaluated_at": "2026-08-29T00:00:00Z", "latest_buyer_message": {"content": "", "evidence_refs": []}}


def test_unknown_without_timing_evidence():
    result = run(BASE)
    assert result["run_status"] == "MORE_EVIDENCE"
    assert result["domain_result"]["window_status"] == "UNKNOWN"
    assert "purchase_timing_signal" in result["missing_evidence"]


def test_open_from_recent_public_rfq():
    result = run({**BASE, "published_at": "2026-08-27T00:00:00Z", "latest_buyer_message": {"content": "RFQ: we need matcha", "evidence_refs": ["ev1"]}})
    assert result["domain_result"]["window_status"] == "OPEN"


def test_timing_signal_without_evidence_cannot_open():
    result = run({**BASE, "latest_buyer_message": {"content": "Urgent delivery required ASAP", "evidence_refs": []}})
    assert result["run_status"] == "MORE_EVIDENCE"
    assert result["domain_result"]["window_status"] == "UNKNOWN"


def test_expired_deadline_without_evidence_cannot_close():
    result = run({**BASE, "deadline_at": "2026-08-28T00:00:00Z"})
    assert result["run_status"] == "MORE_EVIDENCE"
    assert result["domain_result"]["window_status"] == "UNKNOWN"


def test_seller_evidence_cannot_substitute_for_buyer_timing_evidence():
    result = run({**BASE, "deadline_at": "2026-08-28T00:00:00Z",
                  "seller_context": {"evidence_refs": ["seller-profile"]}})
    assert result["run_status"] == "MORE_EVIDENCE"
    assert result["domain_result"]["window_status"] == "UNKNOWN"


def test_urgent_has_evidence_backed_why_now():
    result = run({**BASE, "latest_buyer_message": {"content": "Urgent delivery required ASAP", "evidence_refs": ["ev2"]}})
    assert result["domain_result"]["urgency"] == "HIGH"
    assert result["domain_result"]["why_now"][0]["evidence_ref"] == "ev2"


def test_closed_when_deadline_passed():
    result = run({**BASE, "deadline_at": "2026-08-28T00:00:00Z", "evidence_refs": ["ev-deadline"]})
    assert result["run_status"] == "DONE"
    assert result["domain_result"]["window_status"] == "CLOSED"


def test_deterministic_for_fixed_evaluated_at():
    payload = {**BASE, "published_at": "2026-08-27T00:00:00Z", "latest_buyer_message": {"content": "RFQ matcha required", "evidence_refs": ["ev3"]}}
    expected = run(payload)
    assert all(run(payload) == expected for _ in range(100))
