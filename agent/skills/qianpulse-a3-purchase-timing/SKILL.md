---
name: qianpulse-a3-purchase-timing
description: Evidence-safe, deterministic purchase-window evaluation for a QianPulse Opportunity.
---

# A3 Purchase Timing

Use this capability when an Opportunity needs a purchase-timing refresh. Route `PURCHASE_TIMING_REFRESH` to `qianpulse.a3.purchase_timing`.

The business specification lives here; the only executable domain runtime is `pipeline/skills/a3_purchase_timing.py`. Node code may normalize, validate, route, trace, and persist results, but must not reproduce timing rules.

Required input: `opportunity_id`, explicit `evaluated_at`, timing fields, the latest buyer message, and evidence references. Missing timing evidence returns `MORE_EVIDENCE` with `window_status=UNKNOWN`; an evidence-backed expired/closed signal returns `CLOSED`. Never infer age with a sentinel or the system clock.

Every conclusion must be traceable through `field`, `value`, `evidence_ref`, `rule`, and `result` in `why_now` or `counter_evidence`.
