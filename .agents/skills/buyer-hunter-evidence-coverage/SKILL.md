---
name: buyer-hunter-evidence-coverage
description: >-
  审计 Buyer Hunter 机会的证据溯源、事实层级、实体去重、需求可信度与字段覆盖率，并将需求可信度和买家身份状态分开判断。用于决定数据能进入哪个状态；不负责创造缺失事实或替代业务验证。
---

# 证据覆盖与可信度审计

证据层分别回答两个问题：采购需求是否可信，以及买家法定身份查到什么程度。`buyer_identity_status=UNRESOLVED` 不等于虚假需求。

## 输入

- Current Demand、同账户公开历史、Buyer Buying Profile
- 原始 URL、正文快照、发布时间、抓取时间与字段级定位
- 实体候选、域名、平台账户、联系人和去重记录

## 审计顺序

1. 验证证据可访问、内容与字段一致、发布时间没有被抓取时间替代。
2. 审计产品精准度、采购动作、有效时间、数量/规格和响应渠道。
3. 单独输出 `demand_confidence`: `HIGH | MEDIUM | LOW`，不得混入公司规模或法定身份。
4. 单独输出 `buyer_identity_status`: `LEGAL_VERIFIED | DOMAIN_LINKED | PLATFORM_ACCOUNT | PERSON_ONLY | UNRESOLVED`。
5. Buyer Buying Profile 的每项结论标注 `FACT | DERIVED | INFERENCE | UNKNOWN`，并保留证据引用。
6. 去重只采用可靠键；姓名加国家不能作为法定公司归并依据。
7. 检查反证、字段冲突、陈旧页面和供应广告伪装成采购需求。

## 状态建议

- 需求可信且身份已解析：`FORMALLY_QUALIFIED`
- 需求可信但身份未解析：`QUALIFIED_PENDING_ENTITY`
- 证据不足但仍可能有价值：`NEEDS_VERIFICATION`
- 非采购、过期、产品不精准或不可追溯：`REJECTED`

公司身份未知不再是需求硬拒绝条件；产品不精准、无明确采购动作、窗口失效和无可追溯证据仍是硬门槛。

## 输出

- `demand_confidence` 及分项依据
- `buyer_identity_status` 及已确认/未确认字段
- `evidence_coverage`: 关键字段覆盖率、来源数、主证据和佐证
- `profile_evidence`: 画像项、事实层级、证据、更新时间
- `conflicts`、`counter_evidence`、`dedupe_decision`
- `qualification_status`、`missing_evidence`、`human_review_required`

## 边界与完成条件

- 不创造公司、邮箱、电话、采购历史或成交事实。
- 不因邮箱像个人邮箱就自动判定私人采购；邮箱仅提供账户类型线索。
- 每项高置信结论都有证据；推断不会升级为事实。
- 能明确说明数据为什么进入当前状态，以及还缺哪条证据。
