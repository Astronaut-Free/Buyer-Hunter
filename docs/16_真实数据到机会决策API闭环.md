# 真实数据到机会决策 API 闭环

## 已打通链路

```text
buyer_signals_qualified.csv（21 条）
→ build_opportunity_store_v1.py
→ Buyer / Evidence / Signal / Requirement
→ Opportunity Decision Engine v1
→ SQLite runtime/buyer_hunter.db
→ FastAPI /api/v1/opportunities/*
→ React Demo（API 优先，失败回退）
```

## 生成数据库

```powershell
python pipeline\build_opportunity_store_v1.py
```

生成结果：

- 输入 21 条合格需求；
- 生成 21 条可审计决策；
- 按当前卖方能力生成 Top 5；
- 保存 21 条数量字段观察和全部匹配结果；
- 每次使用临时数据库生成，完成后原子替换正式 Demo 数据库。

## 启动 API

```powershell
python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
```

主要接口：

- `GET /health`
- `GET /api/v1/opportunities/today?seller_profile_id=seller-guizhou-specialty-demo&limit=5`
- `GET /api/v1/opportunities/{id}/decision`
- `GET /api/v1/opportunities/{id}/access-channels`

Demo 权限头：

- `X-Demo-Member: true`：返回完整判断；
- 无会员头：只返回决策摘要；
- `X-Lead-Access: granted`：仅代表已获触达权限，接口仍只返回数据库中有证据的公开渠道。

正式环境需将 Demo 权限头替换为 Bearer Token、订阅与额度校验。

## 前端

Demo 默认请求：

```text
http://127.0.0.1:8000/api/v1
```

可通过 `VITE_BUYER_HUNTER_API` 覆盖。API 不可用时，前端明确显示 `FALLBACK · 演示样例`；API 正常时显示 `LIVE PIPELINE · 今日快照`。

## 数据诚信约束

- 买家公司未核验时，显示“国家 + 品类采购方 + 平台联系人”，不伪造公司名称；
- 未找到公开邮箱或电话时，Lead Access 显示不可用，仅保留原始需求链接；
- 真实性低于 60、产品不精准或窗口关闭时不进入可追机会；
- Top 5 只从非 `PASS` 决策中选择；
- 每条决策保存规则版本和输入快照哈希。

## 验证

```powershell
python -m unittest api.test_app pipeline.test_opportunity_decision_engine_v1 pipeline.test_pipeline_stability_v1 pipeline.test_sales_intelligence_connectors_v1 -v
cd demo
npm run build
npm run test:sites
```
