---
name: buyer-hunter-evidence-coverage
description: >-
  审计 Buyer Hunter 机会中的证据溯源、事实层级、实体去重、可信度和字段覆盖率。用于判断数据是否足以进入下一状态，不负责创造缺失事实或替代业务验证。
---

# 证据与数据覆盖审查

对 Opportunity 全对象做证据审计，更新 `evidence` 与 `coverage`，决定是否需要 `MORE_EVIDENCE` 或人工复核。该 Skill 是质量门禁，不是给低质量线索加高分的工具。

## 输入

- Opportunity 的所有事实、派生值、推断和验证结果
- 原始来源、网页快照、证据片段、抓取时间和指纹
- 买家官网、域名、公司主体和子公司关系证据
- 去重结果、重复需求标识及清洗记录

## 事实层级

- `FACT`: 原始来源直接支持
- `DERIVED`: 可重复的规则或计算得到
- `INFERENCE`: AI 或分析模型推断
- `VALIDATION`: 人工核验或真实业务结果确认

不得将平台自称“Verified”自动升级为 `VALIDATION`；不得将抓取成功等同于需求真实有效。

## 四维真实性审查

按项目现有 Buyer Signal 规则输出四个可解释维度及总分：

1. 需求明确性：采购动作、产品、数量、规格与时限证据。
2. 主体真实性：公司、域名、国家地址和主体关系证据。
3. 时效与一致性：发布时间、状态、跨字段及跨来源一致性。
4. 可触达与可复核性：官方入口、公开商务渠道和可回查来源。

真实性分只代表证据可信度，不代表成交概率。

## 输出

- `evidence_refs`: 来源、片段、角色和指纹
- `confidence`: 总分、四维分项与规则版本
- `coverage`: 每个关键字段的 `COVERED | PARTIAL | MISSING | CONFLICT`
- `duplicate_demand_id`、实体解析状态
- `warnings`、`conflicts`、`stale_evidence`
- `human_review_required`、`missing_evidence`
- `next_state`: `MORE_EVIDENCE | MONITOR | WINDOW_OPEN | FIT_CHECK | ACCESS_CHECK | QUALIFIED | BLOCKED | ACTIONABLE`

## 判断边界

- 允许：溯源、去重审计、事实分层、覆盖率、可信度和质量门禁。
- 禁止：伪造来源、把推断升级为事实、以机会分替代真实性分、替上游补写需求或替下游决定成交动作。

## 完成条件

- 每个关键判断均标明事实层级与证据引用。
- 冲突、过期、缺失和需人工复核项被显式列出。
- 证据不足时输出 `MORE_EVIDENCE`，不得为了保持列表数量而放行。

字段与分值口径以 `contracts/buyer-signal-api-v1.yaml`、`db/schema.sql` 和 `pipeline/clean_and_score_buyer_signals_v1.py` 为准。
