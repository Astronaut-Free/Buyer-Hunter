from pipeline.skills.a4_supply_match import run


def catalog(*, moq=100, capacity=5000, delivery=20, grade="beverage", specification=None,
            certifications=("HACCP",), include_certifications=True):
    sku = {"sku": "SKU-1", "product_name": "Matcha", "category_code": "MATCHA", "grade": "beverage",
           "moq_kg": moq, "monthly_capacity_kg": capacity, "delivery_days": delivery, "packaging": [],
           "oem": False, "private_label": False, "sample_available": False}
    if grade is None:
        sku.pop("grade")
    else:
        sku["grade"] = grade
    if specification is not None:
        sku["specification"] = specification
    if include_certifications:
        sku["certifications"] = list(certifications)
    return {"catalog_version": "test-v1", "data_mode": "LIVE", "sellers": [{"seller_id": "s1", "company_name": "Seller", "export_experience_markets": ["JP"], "skus": [sku]}]}


def payload(**demand):
    base = {"category_code": "MATCHA", "grade": "beverage", "quantity": "500 kg", "destination_market": "JP"}
    base.update(demand)
    return {"opportunity_id": "opp-a4", "evaluated_at": "2026-08-29T00:00:00Z", "demand": base, "seller_catalog": catalog()}


def test_fit_when_all_hard_gates_pass():
    result = run(payload())
    assert result["run_status"] == "DONE"
    assert result["domain_result"]["recommendation"] == "FIT"


def test_moq_fail_is_not_fit():
    result = run({**payload(quantity="50 kg"), "seller_catalog": catalog(moq=100)})
    assert result["domain_result"]["recommendation"] == "NOT_FIT"
    assert any(item["dimension"] == "moq" for item in result["domain_result"]["hard_gaps"])


def test_capacity_fail_is_not_fit():
    result = run({**payload(quantity="6000 kg"), "seller_catalog": catalog(capacity=5000)})
    assert result["domain_result"]["recommendation"] == "NOT_FIT"


def test_certification_missing_is_unknown():
    result = run({**payload(mandatory_certifications=["HACCP"]), "seller_catalog": catalog(include_certifications=False)})
    assert result["run_status"] == "MORE_EVIDENCE"
    assert result["domain_result"]["recommendation"] == "NEED_MORE_DATA"


def test_certification_explicitly_absent_is_fail():
    result = run({**payload(mandatory_certifications=["HACCP"]), "seller_catalog": catalog(certifications=())})
    assert result["domain_result"]["recommendation"] == "NOT_FIT"


def test_non_weight_unit_is_unknown_not_estimated():
    result = run(payload(quantity="5 pallets"))
    assert result["domain_result"]["recommendation"] == "NEED_MORE_DATA"
    assert any(item["dimension"] == "quantity_capacity" for item in result["domain_result"]["unknowns"])


def test_missing_seller_hard_facts_are_unknown_not_fail():
    for field, kwargs in (("grade", {"grade": None}), ("capacity", {"capacity": None}),
                          ("moq", {"moq": None}), ("delivery", {"delivery": None})):
        result = run({**payload(), "seller_catalog": catalog(**kwargs)})
        assert result["run_status"] == "MORE_EVIDENCE", field
        assert result["domain_result"]["recommendation"] == "NEED_MORE_DATA", field
        assert any(item["dimension"] in {"specification", "quantity_capacity", "moq", "lead_time"}
                   for item in result["domain_result"]["unknowns"]), field


def test_important_checks_have_field_value_evidence_rule_result():
    result = run(payload())
    checks = result["domain_result"]["checks"]
    assert checks
    assert all({"field", "value", "evidence_ref", "rule", "result"} <= set(item) for item in checks)


def test_specification_can_supply_comparable_grade_when_grade_alias_is_absent():
    result = run({**payload(), "seller_catalog": catalog(grade=None, specification="beverage")})
    assert result["domain_result"]["recommendation"] == "FIT"
    assert result["domain_result"]["eligible_skus"][0]["grade"] == "beverage"
