---
name: qianpulse-a5-trade-risk
description: Evidence-bounded destination-market access and trade-risk evaluation.
---

# A5 Trade Risk

Use this capability for `TRADE_RISK_REFRESH` and whenever A6 invalidates destination, certification, payment, origin, or delivery terms.

The only executable domain runtime is `pipeline/skills/a5_trade_risk.py`. Keep `buyer_country` and `destination_market` separate. Missing destination returns `UNKNOWN + MORE_EVIDENCE`. Only an evidence-backed regulatory prohibition or an evidence-backed SKU hard gap may return `BLOCK`.

Risk codes are closed to: `IDENTITY_UNKNOWN`, `PLATFORM_ONLY_CONTACT`, `QUANTITY_SUSPECT`, `SPECIFICATION_GAP`, `CERTIFICATION_GAP`, `MARKET_ACCESS_UNKNOWN`, `PAYMENT_TERM_RISK`, `ORIGIN_CONFLICT`, and `DELIVERY_CONFLICT`.
