# 真实数据到机会决策 API 闭环

更新时间：2026-08-28。

## 当前两条已实现链路

### A. 全平台采集与统一清洗

```text
各平台采集批次（Alibaba / Go4WorldBusiness / TradeKey / TradeWheel / EC21 / TED / SAM / UNGM / USAspending / 独立站等）
→ aggregate_full_collection_v1.py
→ 严格五品类匹配、时效判断、角色分层、去重
→ all_platform_records_cleaned.csv（210 条）
→ useful_current_opportunities.csv（51 条）
→ qualified_pending_entity_opportunities.csv（51 条）
→ formally_qualified_opportunities.csv（0 条）
→ supporting_evidence.csv（24 条）
```

本链路负责回答“全量抓了多少、清洗后剩多少、哪些是当前机会、哪些只能当佐证”。其中 51 条当前机会全部标记为 `QUALIFIED_PENDING_ENTITY`，允许进入机会排序；买方法定主体仍未完成解析，因此 `formally_qualified_opportunities.csv` 为 0 条。联系人不会被冒充为买家公司。

### B. SQLite 机会决策与 Demo API

```text
qualified_pending_entity_opportunities.csv（全平台 51 条）
→ build_opportunity_store_v1.py
→ Buyer / Evidence / Signal / Requirement
→ Opportunity Decision Engine v1
→ SQLite runtime/buyer_hunter.db
→ FastAPI /api/v1/opportunities/*
→ React Demo（API 优先，失败回退）
```

本链路负责回答“今天追谁、为什么现在、是否匹配、有什么风险、下一步做什么”。

## 已打通的数据适配边界

`build_opportunity_store_v1.py` 默认读取 `20260828T110920Z/qualified_pending_entity_opportunities.csv` 的 51 条当前机会。Alibaba 与 TradeWheel 缺失的四维子分先由统一清洗规则重算，低于 B 的记录降为 `NEEDS_VERIFICATION`，不会静默进入数据库。

适配始终遵守：

- `record_id` 映射为稳定 `signal_id`，不能只用共享 API URL 去重；
- 未解析主体按来源与信号单独建占位 Buyer，不以“姓名 + 国家”合并为公司；
- `contact_person_raw` 不得映射为法定买家公司；
- D2 为账户/商业场景可信度，法定身份由独立状态表达；
- `HISTORICAL_PURCHASE` 和 `BUYER_BACKGROUND` 只能进入证据层，不能生成当前机会；
- 官方采购没有未来截止时间时只能作为佐证。

## 生成数据库

```powershell
python pipeline\build_opportunity_store_v1.py
```

当前默认生成结果：

- 输入 51 条全平台合格需求；
- 生成 51 条可审计决策；
- 按当前卖方能力生成 Top 5；
- 保存数量字段观察、原始证据和匹配结果；
- 使用临时数据库构建，完成后原子替换正式 Demo 数据库。

## 启动 API

```powershell
python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
```

已实现接口：

- `GET /health`
- `GET /api/v1/opportunities/today?seller_profile_id=seller-guizhou-specialty-demo&limit=5`
- `GET /api/v1/opportunities/{id}/decision`
- `GET /api/v1/opportunities/{id}/access-channels`

Demo 权限头：

- `X-Demo-Member: true`：返回完整机会判断；
- 无会员头：只返回决策摘要；
- `X-Lead-Access: granted`：仅代表已获触达权限，接口仍只返回数据库中有证据的公开渠道。

正式环境需将 Demo 权限头替换为 Bearer Token、订阅与额度校验。

## 前端

Demo 默认请求 `http://127.0.0.1:8000/api/v1`，可通过 `VITE_BUYER_HUNTER_API` 覆盖。

- API 正常：显示 `LIVE PIPELINE · 今日快照`；
- API 不可用：明确显示 `FALLBACK · 演示样例`；
- 搜索框选择品类后，把 `category_code` 传给 `/opportunities/today`，由后端重新筛选、排序和编号；
- 市场筛选通过 `market_code` 传递，允许空结果，不回退成伪造机会。

## 数据诚信约束

- 买家公司未核验时，显示“国家 + 品类采购方 + 联系人/公司待核验”，不伪造公司名称；
- 未找到公开邮箱或电话时，Lead Access 返回空数组，不生成联系方式；
- 当前需求、历史采购和买家背景必须分层；
- 产品不精准、采购窗口关闭或证据不足时不进入当前有效机会；
- 每条决策保存规则版本和输入快照哈希。

## 验证

```powershell
python -m unittest api.test_app pipeline.test_opportunity_decision_engine_v1 pipeline.test_pipeline_stability_v1 pipeline.test_sales_intelligence_connectors_v1 pipeline.test_parser_quality_v1_1 pipeline.test_full_collection_aggregation_v1 -v
cd demo
npm run build
npm run test:sites
```

详细字段、请求响应和错误码见 `docs/12_数据库API_v1.0_正式接口说明.md`。
