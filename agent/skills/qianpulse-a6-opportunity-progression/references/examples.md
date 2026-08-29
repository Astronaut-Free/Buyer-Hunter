# A6 Examples

## 数量和目的地变化

Buyer：`We need 20 tons, not 5 tons, and shipment should go to Dubai.`

输出重点：

```text
changed_fields = [quantity, destination]
→ Routing Policy invalidate A4/A5（必要时 A3）
→ 等待刷新结果
→ 再生成 Next Best Action
```

A6 不直接判断哪家贵州企业能供 20 吨，也不自行判断 UAE 准入。

## 正式商业条件

Buyer：`Send formal quotation and payment terms. Can you give us exclusive rights?`

输出：

```text
Intent = PRICE_REQUEST + PAYMENT_TERMS
Next Action = HUMAN_TAKEOVER
Execution Mode = HUMAN
```

禁止自动承诺。

## 礼貌感谢

Buyer：`Thanks, received.`

如果没有业务变化：

```text
changed_fields = []
Stage 可保持
Next Action = WAIT / 单个关键问题
```

禁止全量重跑 A3-A5。
