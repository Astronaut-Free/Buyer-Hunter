# Buyer Signal Database API v1.0 正式接口说明

本文件是 API v1.0 的简明正式说明；机器契约以 `contracts/buyer-signal-api-v1.yaml` 为准。OpenAPI 版本 `3.1.0`，接口版本 `1.0.0`，已完成 YAML 解析和 27 个内部 `$ref` 解析校验。

## 基础约定

- Base URL：`http://localhost:8000/api/v1`
- 鉴权：除 `/health` 外使用 Bearer JWT。
- 分页：`cursor + limit`，最大 100。
- 排序：`truth_score DESC, published_at DESC, id ASC`。
- 时间：ISO 8601；国家：ISO 3166-1 alpha-2；未知值返回 `null`。
- `truth_score` 是需求证据可信度，不是成交概率。
- 会员只控制买方主体与公开业务渠道解锁，不得改变真实性评分。

## 接口清单

| 方法 | 路径 | 主表/对象 |
|---|---|---|
| GET | `/health` | 运行状态 |
| GET | `/sources` | `source` |
| POST | `/crawl-runs` | `crawl_run`, `crawl_item` |
| GET | `/crawl-runs/{run_id}` | `crawl_run`, `crawl_item` |
| GET | `/buyer-signals` | `signal`, `buyer`, `evidence` |
| GET | `/buyer-signals/{signal_id}` | `signal`, `signal_evidence`, `field_observation`, `requirement` |
| GET | `/buyers/{buyer_id}` | `buyer`, `buyer_alias`, `buyer_relation` |
| GET | `/buyer-signals/{signal_id}/access-channels` | `buyer_access_channel`, `buyer_access_grant` |
| GET | `/data-quality/runs/{run_id}` | 清洗运行质量报告 |

## 实际运行样例

以下值直接来自 `20260827T212941Z/cleaned_v1/buyer_signals_qualified.csv`，不是手工编造：

```json
{
  "id": "0363e837fc9a023423f8ffab32d08891",
  "source_code": "go4worldbusiness",
  "category_code": "MATCHA",
  "title": "Wanted : Tea Like Sencha And Matcha Tea",
  "buyer_display_name": null,
  "buyer_country_code": "JP",
  "quantity_raw": "1 - 5 Kilograms",
  "published_at": "2026-08-04",
  "truth_dimensions": {
    "demand_explicitness": 35,
    "entity_authenticity": 5,
    "recency": 18,
    "corroboration": 4
  },
  "truth_score": 62,
  "truth_level": "B",
  "hard_gate_pass": true,
  "qualification_status": "QUALIFIED",
  "missing_fields": [
    "buyer_company",
    "buyer_domain",
    "independent_corroboration"
  ],
  "access_status": "PREVIEW",
  "ruleset_version": "truth-v1.0.0"
}
```

原始证据：`https://www.go4worldbusiness.com/buylead/view/1314744/wanted-:-tea-like-sencha-and-matcha-tea.html`。

## 错误结构

```json
{
  "code": "SIGNAL_NOT_FOUND",
  "message": "Buyer signal was not found.",
  "request_id": "req_01"
}
```

常用状态码：`200` 成功，`202` 采集已受理，`400` 参数错误，`401` 未登录，`403` 无会员/授权，`404` 资源不存在，`409` 重复运行冲突，`429` 限流，`500` 服务错误。
