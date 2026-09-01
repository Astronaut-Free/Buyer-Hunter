# Buyer Hunter 数据库与机会决策 API v1.1

更新时间：2026-08-28

接口版本：`1.1.0`

运行实现：`api/app.py`

数据库模式：`db/schema.sql`、`db/migrations/002_opportunity_decision.sql`

## 1. 本版本的准确边界

本项目存在两个数据层，调用方不得把两者的数量混为一谈。

| 层级 | 当前状态 | 本次真实结果 | 对外用途 |
|---|---|---:|---|
| 全平台采集与清洗产物 | 已实现 | 原始结构化记录 323 条；去重清洗后 210 条；四维验真后当前有效机会 51 条；待实体核验机会 51 条；佐证记录 24 条 | 数据审计、质量复核、机会入库 |
| SQLite 机会决策库 | 已实现 | 默认输入全平台 51 条；生成 51 条机会决策并按卖方档案返回 Top 5 | 当前 React Demo 与 FastAPI |
| 全平台有效机会自动写入 SQLite | 已实现 | 51 条自动适配并写入 | 当前机会决策 API |

因此：`pipeline/data_full_collection/20260828T110920Z/useful_current_opportunities.csv` 中的 51 条是通过统一四维验真的当前机会，已由 `build_opportunity_store_v1.py` 自动适配进入 SQLite；`/api/v1/opportunities/*` 返回的就是这批机会的卖方特定决策。

## 2. 数据产物

全平台聚合运行：`20260828T110920Z`。

| 文件 | 记录数 | 定义 |
|---|---:|---|
| `all_platform_records_cleaned.csv` | 210 | 标准化、严格品类匹配、去重后的全部记录 |
| `useful_current_opportunities.csv` | 51 | 当前、直接采购需求或仍开放的官方采购机会 |
| `qualified_pending_entity_opportunities.csv` | 51 | 商业需求已确认并允许进入排序，但法定买方主体仍待核验 |
| `formally_qualified_opportunities.csv` | 0 | 当前有效需求且法定/官方买方主体已经解析 |
| `supporting_evidence.csv` | 24 | 历史采购、买家背景或已结束的官方采购证据，不作为当前需求 |
| `platform_summary.csv` | 按平台汇总 | 原始量、清洗量、有效量、正式合格量和佐证量 |
| `full_collection_quality_report.json` | 1 | 运行 ID、输入批次、质量口径和总量统计 |

当前 51 条有效机会按品类分布：`TEA=36`、`MATCHA=5`、`CHILI=9`、`BLUEBERRY=1`、`ROSA_ROXBURGHII=0`；按平台为 Go4WorldBusiness 23、TradeKey 19、Alibaba 6、TradeWheel 3。

### 2.1 全平台标准记录字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `record_id` | string | 来源内稳定记录标识；去重不能只依赖 URL |
| `source_code` | string | 来源平台代码 |
| `source_role` | enum | `DIRECT_RFQ`、`OFFICIAL_PROCUREMENT`、`HISTORICAL_PURCHASE`、`BUYER_BACKGROUND` |
| `category_code` | enum | `MATCHA`、`BLUEBERRY`、`ROSA_ROXBURGHII`、`CHILI`、`TEA` |
| `title` | string | 原始标题 |
| `description_raw` | string/null | 可追溯原始需求文本 |
| `buyer_name_raw` | string/null | 只有证据明确指向法定/采购主体时才填写 |
| `contact_person_raw` | string/null | 联系人，不得当作公司名称 |
| `buyer_country_code` | string/null | ISO 3166-1 alpha-2 |
| `buyer_country_raw` | string/null | 来源原始国家文本 |
| `quantity_raw` | string/null | 来源披露的原始数量，不猜测单位或数值 |
| `published_at` | date/null | ISO 8601 日期 |
| `deadline_at` | date/null | 官方采购截止日期；未知保持 `null` |
| `source_url` | uri | 可人工复核的原始证据链接 |
| `observed_at` | datetime | 系统采集时间 |
| `verification_status` | string | 来源和核验状态，不等同于成交概率 |
| `product_match` | boolean | 是否严格命中五类产品，排除口味、器具等噪声 |
| `timely` | boolean | 是否仍处于当前采购窗口 |
| `entity_resolved` | boolean | 是否已解析法定/官方买方主体 |
| `account_holder_type` | enum | `ORGANIZATION`、`PERSON_OR_AGENT`、`UNKNOWN`；只描述账户/联系人形态 |
| `business_context_status` | enum | `CONFIRMED`、`SUPPORTING_ONLY`、`UNCONFIRMED` |
| `buyer_entity_status` | enum | `CONFIRMED`、`UNRESOLVED`；与账户持有人类型分离 |
| `quality_status` | string | `FORMALLY_QUALIFIED`、`QUALIFIED_PENDING_ENTITY`、佐证、过期或拒绝状态 |
| `quality_reason` | string | 质量状态的可解释原因 |
| `d1_demand_explicitness` / `d2_account_business_context` / `d3_recency` / `d4_corroboration` | integer/null | 四维需求证据分；D2 只证明账户/商业场景，不证明法定公司 |
| `truth_score` | integer/null | 四维需求证据可信度，不是成交概率 |
| `truth_level` | enum/null | `A`、`B`、`C`、`D` |

## 3. SQLite 核心对象

```text
source -> evidence -> signal -> requirement
                         |
                         v
buyer -> opportunity -> opportunity_decision -> match_result
  |
  v
buyer_access_channel
```

| 对象 | 作用 |
|---|---|
| `source` | 数据源和采集约束 |
| `evidence` | URL、标题、原文片段、观察时间及快照哈希 |
| `buyer` | 标准买方实体；联系人与公司主体分离 |
| `signal` | 标准采购信号及真实性分数 |
| `requirement` | 产品、市场、认证等原子需求 |
| `opportunity` | 面向某卖方能力档案生成的机会 |
| `opportunity_decision` | Why Now、Fit、风险、优先级和下一步动作 |
| `match_result` | 买方原子需求与卖方能力逐项比较 |
| `buyer_access_channel` | 有证据的公开商务/采购渠道；单独做 Lead Access 门禁 |

未知值必须保存为 `NULL`，不得把联系人提升为法定买家公司，不得用平台“Verified”替代企业真实性验证。

## 4. 实际可调用接口

Base URL：`http://127.0.0.1:8000`。FastAPI 自动文档位于 `/docs`，机器可读契约位于 `/openapi.json`。下表只列 `api/app.py` 已实现接口。

| 方法 | 路径 | 权限 | 作用 |
|---|---|---|---|
| GET | `/health` | 无 | 数据库健康、决策数量、最近决策日期 |
| GET | `/api/v1/opportunities/today` | 摘要公开；Demo 会员头返回完整访问标记 | 按卖方档案、品类和市场返回排序机会 |
| GET | `/api/v1/opportunities/{opportunity_id}/decision` | 摘要公开；会员返回完整判断 | Why Now、评分组件、Gap、风险、证据、匹配和动作 |
| GET | `/api/v1/opportunities/{opportunity_id}/access-channels` | Lead Access | 返回数据库中已有证据的公开采购/商务渠道 |

`contracts/buyer-signal-api-v1.yaml` 描述的是后续数据库管理 API 契约，不代表其中的 `/sources`、`/crawl-runs`、`/buyer-signals`、`/buyers` 和 `/data-quality` 已在当前 FastAPI 中实现。

### 4.1 健康检查

```http
GET /health
```

```json
{
  "status": "ok",
  "decision_count": 51,
  "latest_decision_date": "2026-08-28"
}
```

数据库文件不存在时返回 `503`：

```json
{
  "detail": "Decision store is missing; run pipeline/build_opportunity_store_v1.py"
}
```

### 4.2 今日机会列表

```http
GET /api/v1/opportunities/today?seller_profile_id=seller-guizhou-specialty-demo&category_code=MATCHA&market_code=US&limit=5
X-Demo-Member: true
```

查询参数：

| 参数 | 必填 | 规则 |
|---|---|---|
| `seller_profile_id` | 是 | 当前 Demo 使用 `seller-guizhou-specialty-demo` |
| `limit` | 否 | `1..20`，默认 5 |
| `category_code` | 否 | 五品类枚举 |
| `market_code` | 否 | `US`、`JP`、`GB`、`AU`、`EU`；`EU` 映射到数据库内欧盟国家代码集合 |

响应结构：

```json
{
  "decision_date": "2026-08-28",
  "seller_profile_id": "seller-guizhou-specialty-demo",
  "category_code": "MATCHA",
  "market_code": "US",
  "data_mode": "LIVE_PIPELINE",
  "items": [
    {
      "id": "opp-...",
      "rank": 1,
      "buyer_display_name": "...",
      "country_code": "US",
      "demand_title": "...",
      "category_code": "MATCHA",
      "quantity_raw": "未披露",
      "published_at": "2026-08-27",
      "decision_status": "VERIFY_FIRST",
      "opportunity_score": 72.5,
      "truth_score": 69.0,
      "why_now": ["..."],
      "next_action_summary": "...",
      "decision_access": "FULL",
      "lead_access_status": "UNAVAILABLE",
      "seller_fit_score": 80.0,
      "data_mode": "LIVE"
    }
  ]
}
```

筛选后没有符合项时返回 `200` 和空 `items`；卖方档案没有任何决策时返回 `404`。

### 4.3 机会决策详情

```http
GET /api/v1/opportunities/{opportunity_id}/decision
X-Demo-Member: true
```

不带 `X-Demo-Member: true` 时只返回列表摘要字段，`decision_access=SUMMARY`。会员响应额外包含：

- `hard_gate_passed`
- `component_scores`：`timing`（30%）、`seller_fit`（30%）、`commercial_execution`（20%）、`procurement_channel_actionability`（10%）、`market_access`（10%）；`truth_score` 仅作前置门禁
- `gaps`、`blockers`、`risks`
- `evidence[]`：source_url、claim、observed_at
- `match_results[]`：field_code、buyer_value、seller_value、status、hard、reason
- `next_action`
- `ruleset_version`

机会不存在时返回 `404`。

### 4.4 公开采购/商务渠道

```http
GET /api/v1/opportunities/{opportunity_id}/access-channels
X-Lead-Access: granted
```

未提供有效 Demo 访问头时返回 `403`。成功响应只返回数据库中已保存且带证据的公开渠道：

```json
[
  {
    "type": "PROCUREMENT_URL",
    "value": "https://example.com/procurement",
    "source_url": "https://example.com/evidence",
    "verified_at": "2026-08-28T08:00:00+00:00"
  }
]
```

没有公开渠道时返回空数组，不编造邮箱或手机号。正式环境必须把两个 Demo Header 替换为 Bearer Token、会员状态与额度校验。

## 5. 错误与状态码

当前 FastAPI 使用标准结构：

```json
{"detail": "Opportunity not found"}
```

| 状态码 | 场景 |
|---:|---|
| 200 | 成功或筛选结果为空 |
| 403 | 未获得 Lead Access |
| 404 | 卖方档案无决策或机会不存在 |
| 422 | 参数缺失、枚举错误或超出范围 |
| 503 | SQLite 决策库不存在 |

## 6. 构建、启动与验证

```powershell
python pipeline\build_opportunity_store_v1.py
python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
python -m unittest api.test_app pipeline.test_opportunity_decision_engine_v1 pipeline.test_pipeline_stability_v1 pipeline.test_sales_intelligence_connectors_v1 pipeline.test_parser_quality_v1_1 pipeline.test_full_collection_aggregation_v1 -v
```

验收要求：

1. `PRAGMA integrity_check` 返回 `ok`；
2. `/health` 的 `decision_count` 与构建输入一致；
3. 列表按 `opportunity_score DESC, opportunity_id` 排序，筛选后重新编号；
4. 非会员详情不返回完整决策字段；
5. 未授权访问渠道必须返回 `403`；
6. 每条事实有 `source_url`，缺失字段保持 `null`；
7. 全平台 51 条已通过字段适配接入 SQLite；缺失四维子分必须由统一规则重算，不得由总分反推或平均填造。
