# A6 Reply Intent Taxonomy

## 1. 固定标签

```text
INTERESTED
NEED_INFORMATION
PRICE_REQUEST
SAMPLE_REQUEST
MOQ_SPEC_REQUEST
DELIVERY_REQUEST
CERTIFICATION_REQUEST
PAYMENT_TERMS
WRONG_PERSON
REFERRAL
NOT_NOW
NOT_INTERESTED
OUT_OF_OFFICE
UNSUBSCRIBE
COMPLAINT
UNKNOWN
```

## 2. 多意图

一条消息允许存在主意图 + 次意图：

```yaml
intent:
  primary: PRICE_REQUEST
  secondary:
    - MOQ_SPEC_REQUEST
```

## 3. 原始消息保留

Intent 永远是分析结果。

必须保存并引用原始 ConversationEvent。

## 4. UNKNOWN

出现以下情况使用 UNKNOWN：

- 信息过短且无可解释上下文。
- 多义性高。
- 语言解析失败。
- 需要业务背景才能判断。

低置信度 UNKNOWN 不自动外发。