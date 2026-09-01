# 黔脉 QianPulse｜A2 / A6 Draft Generation V1

## A2

A2 新增证据化首次外联 Draft：

```text
Buyer Company
+ Buyer Fit / why_fit / evidence_refs
+ Decision Maker
+ Seller Product
→ Outreach Draft
→ Human Approval
```

缺少 `why_fit`、买家公司、产品或证据时返回 `MORE_EVIDENCE`，不为了生成文案补造事实。

首封邮件 CTA 保持低摩擦，目标是确认品类负责人和继续沟通许可。

## A6

A6 新增 Key Question 与证据检查层：

```text
Reply Intent
→ Key Question
→ BUYER / SELLER audience
→ Evidence Requirement
→ Safe Draft
```

典型规则：

- 买家有兴趣：优先问一个资格判断问题。
- MOQ / 规格缺卖家事实：向卖家补资料。
- 交期缺确认数据：向卖家补资料。
- 认证缺证据：向卖家补资料。
- 样品缺政策：向卖家补资料。
- Wrong Person：请求转介绍。
- 正式价格 / 支付 / 合同：保留 Human Takeover。

Draft 只引用 seller context 中已存在的事实与 evidence refs。
