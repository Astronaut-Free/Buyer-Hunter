# A6 Changed Field Routing Contract

A6 只识别变化并输出 changed fields。QianPulse Agent Routing Policy 决定失效与重跑。

## 建议映射

| Changed field | Invalidate / rerun |
|---|---|
| quantity | A4；必要时 A3 |
| specification | A4 |
| destination | A5；必要时 A4 |
| certification | A4 + A5 |
| delivery_date | A3 + A4 |
| price_request | A6 Human Gate；若已有报价能力则请求报价任务 |
| payment_terms | A5 + A6 Human Gate |
| buyer_company | A3 + A4 + A5 |
| buyer_role | A6 当前会话判断 |
| sample_request | A6 Sample Task；产品/规格变化时 A4 |

## 边界

- 映射属于 Routing Policy 元数据，可版本化。
- A6 不自行执行被映射能力的专业判断。
- 没有实际字段变化时不得为了刷新结果制造 changed fields。
