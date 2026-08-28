# Buyer Hunter 采集、清洗、四维验真与数据库 API v1.0

版本：1.0.0  
规则版本：`truth-v1.0.0`  
定位：36 小时 Demo 的数据工程/后端交付，不扩张为全功能商业爬虫平台。

## 1. 本轮结论

| 项目 | 结果 | 判定 |
|---|---:|---|
| 新增直接运行渠道 | TradeKey、go4WorldBusiness | 已接入公开买家列表 |
| 公开列表入口 | 9 | 9/9 HTTP 200 |
| 原始记录 | 167 | 全部保留来源 URL 和页面快照 hash |
| 去重后记录 | 161 | 删除 6 条同指纹重复记录 |
| B 级可用需求 | 21 | 新规则标记为 `QUALIFIED_PENDING_ENTITY`，可进入候选排序并显示公司主体缺口 |
| C 级待核验 | 65 | 不进入 Top 5 |
| TED 官方 API 查询 | 13 | 13/13 成功 |
| TED 初始全文命中 | 33 | 不能直接当精准需求 |
| TED 精准复核通过 | 18 | 均为辣椒相关食品采购公告 |
| 稳定性自动测试 | 8 | 8/8 通过 |

重要限制：B2B 平台通常公开国家、采购品、规格、数量、日期和平台联系入口，但隐藏公司名。联系人姓名不能当作法律实体，公司主体缺失时 D2 不得给公司分。自 `truth-v1.1.0` 起，这类商业需求不再被主体门槛淘汰，而是进入 `QUALIFIED_PENDING_ENTITY`；主体核验后才升级为 `FORMALLY_QUALIFIED`。

## 2. 渠道分层与接入顺序

完整机器可读登记表：`pipeline/b2b_source_registry_v3.json`，共 23 个渠道。

| 层级 | 渠道 | 当前状态 | 用途 |
|---|---|---|---|
| P0 直接 RFQ | TradeKey、go4WorldBusiness、EC21 | 已运行/部分运行 | 当前采购需求主证据 |
| P0 官方采购 | SAM.gov、TED、USDA AMS | SAM/TED 已接入，USDA 待适配 | 买方、期限、规格、采购入口强证据 |
| P1 B2B 扩源 | TradeWheel、ExportHub、FreshDI、GlobalTradePlaza、ConnectAmericas、TradeFord、eWorldTrade、HKTDC | 已发现或待路由 | 增量 RFQ，必须保留访问状态 |
| 授权后 P0 | Alibaba RFQ、Made-in-China | 等供应商账号/API | 不在未授权状态模拟接入 |
| 授权后 P1 | RangeMe、Amazon Business | 等账号/API | 零售采购/企业需求信号 |
| P2 背景证据 | ImportYeti、Volza、Trademo | 背景层 | 证明历史采购，不单独证明当前需求 |

来源状态必须区分：`LIVE`、`LIVE_PARTIAL`、`READY`、`DISCOVERY_ONLY`、`WAITING_CREDENTIALS`、`BACKGROUND_ONLY`。搜索摘要只能进入待补证层。

## 3. 采集器稳定性设计

### 3.1 已实现

1. 仅访问公开列表或官方 API，不登录、不绕过 CAPTCHA/403/429、不解密联系方式。
2. 连接/读取超时分别为 7 秒/30 秒；官方 TED 读取上限 60 秒。
3. 仅对 `429/500/502/503/504` 和网络异常重试，最多 2 次指数退避并加入 jitter。
4. `403` 立即停止该请求，不重试，不换代理规避。
5. 每个成功页面先写原始 HTML/JSON，再解析；保存 SHA-256、观察时间和请求探针。
6. 最低 1.5 秒列表间隔；本轮使用 1.5 秒。
7. URL 去重与规范化指纹去重并存；不以标题相似就自动合并公司。
8. 任一渠道失败不影响其他渠道输出，运行结果保留 `PARTIAL` 语义。

### 3.2 稳定性测试

`pipeline/test_pipeline_stability_v1.py` 覆盖：

- 瞬时 503 后恢复；
- 403 不重试；
- 原始快照可重放解析；
- 清洗与评分确定性；
- 通用茶页面不吸收姜黄等无关产品；
- 抹茶不重复归类为普通茶；
- 硬门槛字段完整；
- 清洗后 `signal_id` 唯一。

## 4. 清洗和标准化

### 4.1 数据粒度

一行代表：`一个品类 + 一个公开买方需求 + 一个发布主体/国家 + 一个来源 URL`。

### 4.2 关键字段

| 域 | 字段 |
|---|---|
| 主键/来源 | `signal_id`, `source_code`, `source_type`, `evidence_url`, `listing_url` |
| 品类 | `category_code`, `product_terms`, `exact_product_match` |
| 需求 | `buying_action`, `title`, `description_raw`, `specs_present`, `quantity_raw`, `destination_present` |
| 买方主体 | `buyer_name_raw`, `contact_person_raw`, `buyer_country_code`, `buyer_domain`, `registration_id` |
| 时间 | `published_at`, `observed_at`, `age_days`, `time_precision` |
| 证据 | `evidence_excerpt`, `snapshot_sha256`, `verification_status`, `data_mode` |
| 验真 | `d1_demand_explicitness`, `d2_account_business_context`, `d3_recency`, `d4_corroboration`, `truth_score`, `truth_level`；法定身份另用 `buyer_identity_status` / `buyer_entity_status` |
| 治理 | `hard_gate_pass`, `qualification_status`, `dedupe_fingerprint`, `duplicate_count`, `ruleset_version` |

### 4.3 清洗原则

- 缺失保持 `null`，不由模型补写数量、日期、公司或联系方式。
- 联系人姓名与公司名分开；没有公司后缀或其他公司证据时只写 `contact_person_raw`。
- 五品类采用精确词边界和排除词；抹茶优先归入 `MATCHA`，不重复归入 `TEA`。
- 日期统一 ISO 8601；未来日期不给时效分。
- 数量保留 `quantity_raw`，下一版再增加可验证的数值/单位换算；当前不冒险误换算集装箱或 LCL。
- 同 URL 直接去重；同品类/规范标题/国家/主体生成指纹。母子公司不合并，只建立关系。

## 5. 四维真实需求判定

四维只判断需求证据可信度，不判断贵州卖家是否匹配。

| 维度 | 满分 | 固定规则 |
|---|---:|---|
| D1 需求明确性 | 35 | 产品 10；采购动作 10；规格 5；数量/频次 5；目的地/交付条件 5 |
| D2 账户/商业场景可信度 | 25 | 可追溯平台采购入口 10；公开账户/联系人 5；国家 5；明确采购动作 5。只证明商业场景，不证明法定公司 |
| D3 时间有效性 | 25 | ≤7 天 25；8–30 天 18；31–90 天 8；>90 天/未知 0 |
| D4 交叉印证 | 15 | 第二独立来源 7；90 天内重复 4；公开业务联系/采购入口 4 |

等级：A=`75–100`，B=`60–74`，C=`40–59`，D=`0–39`。

硬门槛：`evidence_url`、`observed_at`、`evidence_excerpt` 任一缺失即拒绝；过期或未知日期只能作为背景；规格/认证硬冲突不得进入 Top 5。

本轮全量统一重算后，51 条 A/B 级且资格状态合格的当前需求进入排序。D2 使用可观测的平台账户和商业场景证据；公司主体是否解析不再改变需求可信等级，而由 `QUALIFIED_PENDING_ENTITY` 与身份状态单独表达。

## 6. 数据库映射

| API 对象 | SQLite 表 | 说明 |
|---|---|---|
| Source | `source` | 渠道、访问策略、限速 |
| CrawlRun | `crawl_run`, `crawl_item` | 运行、阶段、HTTP 状态、错误 |
| Evidence | `evidence` | URL、原文、时间、快照 hash |
| Buyer | `buyer`, `buyer_alias`, `buyer_relation` | 实体、别名、母子/品牌关系 |
| BuyerSignal | `signal`, `signal_evidence` | 需求与四维验真 |
| Requirement | `requirement`, `field_observation` | 规格、认证、商业条件及原值/标准值 |
| AccessChannel | `buyer_access_channel`, `buyer_access_grant` | 会员解锁后的公开业务入口 |
| DataQualityReport | 由运行报告生成；Demo 读 JSON | 质量核验，不把原始日志塞入 signal |

数据库定义：`db/schema.sql`。四维明细进入 `signal.truth_breakdown_json`；数值总分进入 `signal.truth_score`，规则版本进入 `signal.extraction_version`。

## 7. API v1.0

机器可读契约：`contracts/buyer-signal-api-v1.yaml`。

### 7.1 接口

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/health` | 服务、数据库、规则版本 |
| GET | `/sources` | 渠道登记和适配器状态 |
| POST | `/crawl-runs` | 发起指定品类/渠道采集 |
| GET | `/crawl-runs/{run_id}` | 运行状态和阶段计数 |
| GET | `/buyer-signals` | 按品类、国家、来源、分数、等级、时间筛选 |
| GET | `/buyer-signals/{signal_id}` | 需求详情、四维分、缺失项、证据链 |
| GET | `/buyers/{buyer_id}` | 规范买方、别名和实体关系 |
| GET | `/buyer-signals/{signal_id}/access-channels` | 会员授权后返回公开业务联系/采购入口 |
| GET | `/data-quality/runs/{run_id}` | 完整率、重复率、有效性、时效报告 |

### 7.2 示例

```http
GET /api/v1/buyer-signals?category_code=MATCHA&min_truth_score=60&limit=20
Authorization: Bearer <token>
```

```json
{
  "items": [
    {
      "id": "9c0e5a5ecb6eac2e854a2e822106fc10",
      "category_code": "MATCHA",
      "title": "Wanted : Tea Like Sencha And Matcha Tea",
      "buyer_display_name": null,
      "buyer_country_code": "JP",
      "quantity_raw": "1 - 5 Kilograms",
      "published_at": "2026-08-04",
      "truth_score": 69,
      "truth_level": "B",
      "qualification_status": "QUALIFIED_PENDING_ENTITY",
      "access_status": "PREVIEW"
    }
  ],
  "next_cursor": null
}
```

详情必须返回四维分，而不是只返回总分：

```json
{
  "truth_dimensions": {
    "demand_explicitness": 35,
    "entity_authenticity": 5,
    "recency": 25,
    "corroboration": 4
  },
  "truth_score": 69,
  "truth_level": "B",
  "hard_gate_pass": true,
  "missing_fields": ["buyer_company", "buyer_domain", "independent_corroboration"],
  "ruleset_version": "truth-v1.0.0"
}
```

### 7.3 权限与错误

- `/health` 无鉴权，其余接口使用 Bearer JWT。
- 买方需求事实和评分不因会员状态改变。
- 会员只控制主体/公开业务联系入口是否解锁。
- 不返回绕过平台获得的邮箱、手机号或私人联系方式。
- 错误统一：`code`、`message`、`request_id`；404 与 403 不混用。

## 8. 运行命令

```powershell
python .\pipeline\collect_b2b_public_v3.py --delay 1.5 --retries 2
python .\pipeline\clean_and_score_buyer_signals_v1_1.py
python .\pipeline\collect_ted_precise.py
python .\pipeline\reaudit_ted_precise.py
python -m unittest .\pipeline\test_pipeline_stability_v1.py -v
```

## 9. 下一开发顺序

1. 把 21 条 B 级 RFQ 的公司主体补证，目标至少 5 条达到 A/B 且公司可识别。
2. 将 TED 18 条辣椒公告接入统一清洗字段，而非维持独立 CSV。
3. 接 USDA AMS 食品采购公告，优先蓝莓；接日本官方采购/业务撮合渠道。
4. 获得 Alibaba/Made-in-China 账号授权后接官方 RFQ，不做模拟数据。
5. 用 FastAPI 实现本契约的只读 Demo 端点，再接前端。
