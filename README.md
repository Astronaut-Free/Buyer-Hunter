# Buyer Hunter MVP

单文件网站 MVP，直接打开 `index.html` 即可预览。首页和 AI 工作台已合并在同一个文件中，通过页面内导航切换。

## GitHub 上传

1. 打开仓库的 `MVP` 分支。
2. 选择 `Add file` -> `Upload files`。
3. 上传 ZIP 解压后的 `index.html` 和本文件。

AI 工作台入口使用 `index.html#workspace`，首页使用 `index.html#home`。

页面中的图片区域均为留白占位，可按提示替换为最终图片资源。

## AI 初筛与人工接管演示

在 AI 工作台点击“确认并开始扫描”后，结果表会展示匹配度、采购意向、沟通完整度和人工接管状态。只有同时满足匹配度 ≥ 60、采购意向 ≥ 60、沟通完整度 ≥ 50，且没有硬性履约阻断或高风险商务议题的买家，才进入“待人工接管”。

“接管并回复”和“编辑 AI 草稿”均只生成待人工确认的内容；本 MVP 不会向买家真实发送任何信息。

## 业务模块

- `业务工作台`：卖家供给档案（SKU、规格、MOQ、产能、样品周期、目标国家）与买家主动需求发布。
- `证据`：查看来源链接、采集日期、原文片段、AI 事实/推断/建议和可信度。
- `CRM 接管看板`：按待接管、已接管、已联系、等待回复、样品/报价阶段查看机会。

当前模块使用浏览器内存中的演示数据；接入后端时，将 `DATA`、保存档案、发布需求和 CRM 状态替换为 API 请求即可。

## 后端接口契约（建议 v0.1）

前端模块已经按以下资源边界组织，数据库完成后可以逐步替换本地状态：

```text
GET    /api/opportunities?market=US&category=matcha
GET    /api/opportunities/:id/evidence
POST   /api/sellers/:sellerId/products
PATCH  /api/sellers/:sellerId/profile
POST   /api/buyer-demands
POST   /api/matches/:id/handoff
PATCH  /api/crm/opportunities/:id   { stage, owner_id, next_follow_up_at, note }
GET    /api/crm/opportunities?stage=waiting_reply
```

统一返回建议包含 `id`、`status`、`updated_at`；匹配结果保留 `fit_score`、`intent_score`、`conversation_score`、`evidence_score`、`decision` 和 `reasons`。证据接口必须区分 `facts`（原文事实）、`inferences`（AI 推断）和 `recommendations`（行动建议），避免把推断误认为事实。
