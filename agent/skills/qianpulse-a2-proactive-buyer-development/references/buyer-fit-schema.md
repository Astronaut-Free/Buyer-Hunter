# A2 Buyer Fit Schema

## 1. 目标

建立可解释、证据化的 Buyer Fit 输出。

## 2. 最小结构

```yaml
buyer_fit:
  buyer_company_id: string
  product_relevance:
    status: yes|no|unknown
    reasons: []
  buyer_type:
    value: importer|distributor|retailer|manufacturer|brand|other
    evidence_refs: []
  trade_relevance:
    status: strong|medium|weak|unknown
    evidence_refs: []
  market_relevance:
    status: strong|medium|weak|unknown
    evidence_refs: []
  why_fit: string
  why_now: string
  confidence: low|medium|high
  evidence_refs: []
```

## 3. 解释规则

`why_fit` 至少引用一种实体业务证据：

- 相关进口行为。
- 相关产品目录。
- 相关渠道定位。
- 相关客户市场。
- 相关业务描述。

`why_now` 只允许由近期证据生成；缺失时写为空或 `unknown`。

## 4. Gate 建议

一期先采用可解释规则，不使用复杂黑箱 0-100 分：

```text
READY CANDIDATE
= Product Relevance 有证据
+ Buyer Type 合理
+ Company Identity 可靠
+ 无明确阻断
```

贸易数据可以增强优先级，但不作为所有行业的强制条件。

## 5. 禁止

- 根据公司名称推断采购需求。
- 根据联系人职位单独推断公司采购意向。
- 将历史进口记录写成“当前正在采购”。
- 将模型推断写成已证实事实。