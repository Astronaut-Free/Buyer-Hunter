# A2 Implementation Notes

## Adapter 绑定建议

一期建议 provider 配置保持可替换：

```yaml
providers:
  trade_data: env:TRADE_DATA_PROVIDER
  contact_data: env:CONTACT_DATA_PROVIDER
  email_transport: env:EMAIL_TRANSPORT_PROVIDER
```

SKILL 不读取供应商品牌名做业务判断。

## Orchestrator 调用

```text
SELLER_QUERY / SYSTEM_NEW_SIGNAL
→ resolve Opportunity
→ invoke qianpulse.a2.proactive_buyer_development
→ persist CapabilityResultEnvelope
→ if READY and external send requested: create Approval
→ after send: WAITING_EXTERNAL
→ BUYER_MESSAGE: route A6
```

## 增量刷新

优先利用已有稳定结果：

- Target Definition 没变化：复用。
- Buyer Company 核心证据未过期：复用。
- Contact 已验证且仍有效：复用。
- 新信号只刷新 why_now 与 readiness，不全量重找买家。

## 可观测性

至少记录：

```text
capability_version
provider
input_hash
candidate_count
qualified_company_count
contact_count
readiness_status
evidence_refs
approval_id
external_message_id
error
```
