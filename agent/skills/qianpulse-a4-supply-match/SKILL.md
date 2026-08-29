---
name: qianpulse-a4-supply-match
description: Hard-gate-first matching between buyer demand and the Seller x SKU catalog.
---

# A4 Supply Match

Use this capability for `SUPPLY_MATCH_REFRESH` and whenever A6 invalidates quantity, specification, certification, or delivery facts.

The only executable domain engine is `pipeline/supply_demand_fit_v1.py`, adapted by `pipeline/skills/a4_supply_match.py`. Node must not calculate fit. Evaluate hard gates in this order: category, specification, certification, quantity/capacity, MOQ, delivery. A hard `FAIL` cannot be offset by a score; missing evidence is `UNKNOWN`, never `FAIL`.

Input must contain buyer demand plus a versioned Seller x SKU catalog. Non-weight quantities such as pallets or containers remain `NON_WEIGHT_UNIT` unless an evidence-backed conversion is supplied; estimates never enter hard gates.
