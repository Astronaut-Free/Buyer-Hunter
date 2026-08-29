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

- `业务工作台`：卖家供给档案（企业能力与准入字段）与独立的产品库（SKU、规格、MOQ、产能、样品周期、目标国家）；两者是分开的入口和数据区域，另含买家主动需求发布。
- `证据`：查看来源链接、采集日期、原文片段、AI 事实/推断/建议和可信度。
- `CRM 接管看板`：按待接管、已接管、已联系、等待回复、样品/报价阶段查看机会。

当前模块使用浏览器内存中的演示数据；接入后端时，将 `DATA`、保存档案、发布需求和 CRM 状态替换为 API 请求即可。

## QianPulse V15 信息架构

首页一级 Tab 已按 `qianpulse_website_layout_v15.svg` 统一为：`全球商机`、`核心能力`、`主动拓展`、`真实案例`、`关于黔脉`。其中 `主动拓展` 进入卖家供给档案 / 买家需求发布业务入口；首页底部 `黔脉智能体` 区块进入 AI 工作台。AI 工作台侧栏对应：`商机任务`、`企业能力`、`今日 Top 5`；产品库、买家主动需求和 CRM 看板作为业务工作台中的具体功能。

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

## DeepSeek Agent 服务

目录中的 `server/index.js` 是可运行的 Node.js API 骨架，使用 DeepSeek OpenAI 兼容接口。启动方式：

```bash
cp .env.example .env
# 在 .env 中填写 DEEPSEEK_API_KEY
npm start
```

默认访问地址为 `http://localhost:3317`；如果你的环境允许 3000 端口，可在 `.env` 中设置 `PORT=3000`。

可用接口：`POST /api/agent/parse-demand`、`/qualify-buyer`、`/draft-reply`、`/match-explain`、`/handoff-summary`，以及 `GET /api/health`。没有配置 Key 时，解析、草稿和解释接口会返回安全的规则兜底；不会把 Key 暴露给浏览器。

## QianPulse Agent Control Plane（PRD V1.1）

后端已加入一期控制面，严格区分 Agent 调度与专业能力：

- `POST /api/v1/agent/runs`：创建 AgentRun，支持 `SELLER_QUERY`、`SELLER_UPDATE`、`SYSTEM_REFRESH`、`MANUAL_RESUME` 等事件。
- `GET /api/v1/agent/runs/:run_id`：读取运行状态。
- `POST /api/v1/agent/runs/:run_id/resume`：从最近运行继续。
- `POST /api/v1/opportunities/:opportunity_id/messages`：写入模拟买家消息并触发增量路由。
- `GET /api/v1/opportunities/:opportunity_id/threads`：读取 Seller / Buyer Thread。
- `POST /api/v1/approvals/:approval_id`：Approve、Edit 或 Reject 对外动作。
- `GET /api/v1/agent/runs/:run_id/trace`：读取完整 Trace。
- `GET /api/v1/agent/capabilities`：读取能力注册表。

本地演示使用 `server/agent-state.json` 保存 Opportunity、ConversationEvent、AgentRun、AgentStep、Checkpoint、Approval 和 Trace；该文件已加入 `.gitignore`。买家消息中的普通致谢不会触发能力重跑，预算、交期、数量、认证和规格等变化只会触发路由策略中受影响的能力。任何回复草稿都标记为待人工确认，不会自动发送。

## 注册与登录

首页登录入口使用统一认证页。用户可注册为 `SELLER` 或 `BUYER`，后端使用 Node `scrypt` 保存密码哈希，登录返回 7 天会话 Token。卖家注册后进入卖家供给档案，买家注册后进入买家需求发布页。`INTERNAL` 注册为邀请制：服务器设置 `INTERNAL_INVITE_CODE` 后，注册请求携带匹配的 `invite_code` 才可创建 INTERNAL 账号（未设置环境变量则 INTERNAL 注册整体关闭）。认证状态保存在服务端 `server/agent-state.json`，前端只保存 Token；生产环境请设置随机 `AUTH_SECRET` 环境变量并迁移到正式数据库。

认证接口：

```text
POST /api/v1/auth/register  { email, password, role, company_name[, invite_code] }
POST /api/v1/auth/login     { email, password }
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

控制面安全约束：Agent 写入接口必须提供 `idempotency_key`；事件会保存到 `state.events` 后再执行。Run、Thread 和 Opportunity 按登录角色做访问校验，完整 Trace 只允许 `INTERNAL`，Approval 只能由 `INTERNAL` 审批；Buyer 投影不会返回内部评分、风险或调试字段。

AI 工作台已接入 AgentRun：确认扫描会创建 `SYSTEM_NEW_SIGNAL` Run，卖家追问会创建 `SELLER_QUERY` Run，结果区会展示 Run Timeline、能力调用和 Checkpoint 状态。Run 处于等待证据或失败状态时可点击“从 Checkpoint 恢复”。真实服务运行时需先登录；当前示例 Opportunity 对已登录的买家或卖家开放，正式环境应替换为数据库中的成员关系。

## Free 分支数据导入

已导入 Free 分支的核心 SQLite 迁移结构到 `db/schema.sql`，并将 `demo/src/data.js` 中的 5 条机会整理为 `db/free-opportunities.json`。`server/repository.js` 在服务启动时加载这些机会，标记数据源为 `origin/Free`；`GET /api/v1/opportunities` 会按登录角色返回投影后的机会列表。后续接 PostgreSQL 时只需替换 Repository，不改 Agent 控制面。
