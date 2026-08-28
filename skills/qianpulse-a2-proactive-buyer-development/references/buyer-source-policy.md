# A2 Buyer Source Policy

## 1. 目标

限制主动开发的数据源范围，优先提高 Buyer Company 质量，避免把 A2 做成无边界社媒抓取器。

## 2. 一期优先级

| 优先级 | 来源 | 主要用途 |
|---|---|---|
| P1 | 贸易行为数据 | 找真实进口商、买家、供应链关系 |
| P2 | 企业官网 / 产品目录 | 验证公司是否经营、使用或销售相关产品 |
| P3 | 展会 / 商协会 / 公开目录 | 补充目标市场企业候选 |
| P4 | 联系人数据库 | 在 Buyer Company 已通过 Gate 后找决策人 |

## 3. 公司优先原则

检索顺序固定为：

```text
Buyer Company
→ Company Evidence
→ Buyer Fit
→ Decision Maker
```

联系人不得作为公司采购意向的替代证据。

## 4. 一期暂缓来源

```text
LinkedIn 自动抓取
Facebook 自动抓取
Instagram 自动抓取
TikTok 自动抓取
X 自动抓取
Reddit 大规模抓取
WhatsApp 群组抓取
```

允许保存公开社交主页 URL，但不得因为存在主页就提升 Buyer Fit。

## 5. 贸易数据 Adapter

业务层只依赖统一能力：

```yaml
trade_data.search_buyers:
  inputs:
    countries: []
    product_keywords: []
    hs_codes: []
  outputs:
    companies: []
    evidence_refs: []
```

供应商可以替换，不进入 SKILL 核心逻辑。

## 6. 公开网页 Adapter

只采集：

- 企业身份。
- 经营产品。
- 产品目录。
- 市场覆盖。
- 公开联系方式。
- 公开商业信号。

页面中的推广语言必须与事实字段分离。

## 7. 停止扩源条件

满足任一条件停止继续扩大数据源：

- 已达到 `max_candidates`。
- 候选质量已达到当前任务要求。
- 新来源带来的有效 Buyer Company 边际增益明显下降。
- 新来源需要额外高风险账号授权。
- 新来源违反一期渠道边界。