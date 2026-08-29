---
name: buyer-hunter-market-access-risk
description: >-
  分离买家所在国与实际目的市场，按产品规格、认证、标签、食安、进口文件和商业冲突审查市场准入及风险，输出 PASS、CONDITIONAL 或 BLOCK。法规证据不足时要求人工复核。
---

# 市场准入与风险

`buyer_country` 只描述买家所在地，`destination_market` 才决定进口法规。两者不得互相替代。

## 输入

- Current Demand 的产品、用途、规格、数量、目的地、认证、包装、标签、付款和交付条件
- 入围 Seller×SKU 的真实能力、证书和证据日期
- 目的市场的适用法规、官方指南或人工确认记录
- 买家身份状态和公开响应渠道

## 风险项

- `IDENTITY_UNKNOWN`
- `PLATFORM_ONLY_CONTACT`
- `QUANTITY_SUSPECT`
- `SPECIFICATION_GAP`
- `CERTIFICATION_GAP`
- `MARKET_ACCESS_UNKNOWN`
- `PAYMENT_TERM_RISK`
- `ORIGIN_CONFLICT`
- `DELIVERY_CONFLICT`
- `CREDIT_UNKNOWN`　　（规则启发式：身份未解析且无信用锚点 → LOW，不阻断）
- `FRAUD_SIGNAL`　　（规则启发式：免费邮箱 + 主体未解析 → MEDIUM；叠加数量异常升 HIGH）
- `IP_CONFLICT`　　（规则启发式：需求提及品牌且无授权证据 → MEDIUM）
- `CONTRACT_RISK`　　（规则启发式：全款预付且无担保条款 → MEDIUM）

实现：`pipeline/risk_items_v1.py`（纯函数、确定性、无外部 Provider；接法规 Provider 后可在同一 taxonomy 内增强）。

身份未知不是自动高风险或自动 `BLOCK`。若存在平台公开响应渠道，机会可继续进入 `CONDITIONAL`，但报价或承诺前必须完成必要核验。

## 处理顺序

1. 明确区分买家所在国、交付地和最终目的市场；缺失时标记未知。
2. 先查目的市场硬性要求，再比较 SKU 证书、规格、标签和文件。
3. 审查数量、付款、原产地、交付条件与需求之间的冲突。
4. 每个风险项记录严重度、证据、责任方、补救动作和复核时间。
5. 只有可靠法规证据明确禁止或硬条件明确失败时输出 `BLOCK`。

## 输出

- `buyer_country`、`destination_market`
- `access_status`: `PASS | CONDITIONAL | BLOCK | UNKNOWN`
- `risk_items`: 风险代码、严重度、证据、原因、补救动作
- `required_documents`、`missing_evidence`
- `human_review_required`、`review_by`

## 边界与完成条件

- 不把买家所在地当进口目的国；不把身份未知当虚假需求。
- 不虚构法规、证书或检测结果；高影响未知项必须人工复核。
- `BLOCK` 有明确硬依据，`CONDITIONAL` 有可执行的补齐清单。
