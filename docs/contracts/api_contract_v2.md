# QianPulse V2｜API Contract

> 目标：统一 Python Signal API、Node Agent API 与 V2 前端的调用边界，优先复用现有接口；新增接口采用 additive 方式，禁止破坏现有 Runtime。

---

# 1. 当前服务面

## 1.1 Signal / Decision API

当前本地端口：`8000`

已存在的核心接口包括：

```text
GET  /api/v1/health
GET  /api/v1/matching-templates
POST /api/v1/seller-capability-profiles
POST /api/v1/crawl-runs
GET  /api/v1/crawl-runs/{run_id}
GET  /api/v1/buyer-requirements
GET  /api/v1/opportunities
GET  /api/v1/opportunities/{opportunity_id}
POST /api/v1/opportunities/{opportunity_id}/follow-ups
GET  /api/v1/me/membership
POST /api/v1/opportunities/{opportunity_id}/access-grants
POST /api/v1/opportunities/{opportunity_id}/outcomes
GET  /api/v1/buyers/{buyer_id}
```

## 1.2 Agent API

当前本地端口：`3317`

已确认核心接口：

```text
GET  /api/health
GET  /api/v1/agent/capabilities
GET  /api/v1/opportunities
GET  /api/v1/opportunities/{id}/workspace
POST /api/v1/agent/runs
GET  /api/v1/agent/runs/{run_id}
GET  /api/v1/agent/runs/{run_id}/trace
POST /api/v1/agent/runs/{run_id}/resume
POST /api/v1/opportunities/{id}/messages
GET  /api/v1/opportunities/{id}/threads
POST /api/v1/approvals/{approval_id}
GET  /api/v1/collection-runs
POST /api/v1/collection-runs
GET  /api/v1/collection-runs/{id}
POST /api/v1/agent/nl-targets
POST /api/v1/agent/intake
POST /api/v1/agent/chat
POST /api/v1/webhooks/smartlead
GET  /api/public/opportunities
```

---

# 2. V2 API 原则

1. 前端优先调用业务聚合 API。
2. 数据源适配器禁止暴露给页面层。
3. 现有接口保持兼容。
4. 新字段使用 additive 扩展。
5. 外部副作用接口必须幂等。
6. 权限裁剪在服务端完成。
7. UNKNOWN 显式返回，不用猜测值填充。

---

# 3. 统一 Response Envelope

成功：

```yaml
ok: true
data: any
meta:
  request_id: string | null
  generated_at: datetime | null
  contract_version: string | null
```

兼容现有直接对象返回的接口时，前端 Adapter 负责标准化；后端不要求一次性重写全部旧接口。

错误：

```yaml
ok: false
code: string
error: string
message: string | null
details: object | null
request_id: string | null
```

---

# 4. 标准错误码

```text
AUTH_REQUIRED
FORBIDDEN
NOT_FOUND
INVALID_JSON
INVALID_ARGUMENT
NEEDS_CONTEXT
NEEDS_INPUT
WAITING_EVIDENCE
IDEMPOTENCY_KEY_REQUIRED
DUPLICATE_REQUEST
APPROVAL_REQUIRED
DEPENDENCY_STALE
EXTERNAL_PROVIDER_ERROR
RATE_LIMITED
INTERNAL_ERROR
```

HTTP 语义：

- 400 参数 / JSON 错误
- 401 未认证
- 403 无权限
- 404 不存在
- 409 冲突 / 重复状态
- 422 上下文或业务前置条件不足
- 429 限流
- 500 服务内部错误
- 502 / 503 外部依赖不可用

---

# 5. Idempotency

所有产生副作用的接口建议支持：

```text
Idempotency-Key: <stable-key>
```

当前 Agent Runtime 已要求 `idempotency_key` 用于 Run 与 Resume。

必须幂等的动作：

- Agent Run
- Resume
- Approval 执行
- 外部消息发送
- 外部 Lead 创建
- Outcome 回写
- Mission Start

重复请求返回同一业务结果，禁止重复外发。

---

# 6. Pagination

列表接口统一建议：

```yaml
items: object[]
page:
  cursor: string | null
  next_cursor: string | null
  limit: integer
  has_more: boolean
```

V2 前端不得依赖无界数组。

---

# 7. Opportunity API

## 7.1 列表

现有：

```text
GET /api/v1/opportunities
```

V2 列表视图标准字段：

```yaml
id: string
buyer: object
product: string | null
stage: string | null
status: string | null
priority: object | null
score: object | null
why_now: string[]
next_action: object | null
updated_at: datetime | null
```

## 7.2 Workspace

现有 Agent API：

```text
GET /api/v1/opportunities/{id}/workspace
```

该接口作为 V2 Opportunity Workspace 的首选聚合入口。

至少包含：

- opportunity
- score
- a2
- a6
- next_action
- blockers
- approvals
- activity
- integration
- evidence

---

# 8. Buyer API

当前 Python API 已提供：

```text
GET /api/v1/buyers/{buyer_id}
```

V2 可 additive 增加：

```text
GET /api/v2/buyers/{buyer_id}/intelligence
```

建议返回：

- company
- contacts
- business_events
- procurement_intelligence
- supplier_intelligence
- evidence_summary

若暂不新增 endpoint，可由 BFF Adapter 聚合现有数据。

---

# 9. Mission API

现有能力入口：

```text
POST /api/v1/agent/nl-targets
POST /api/v1/agent/runs
```

V2 Mission 层建议 additive：

```text
POST /api/v2/missions
GET  /api/v2/missions/{id}
POST /api/v2/missions/{id}/start
POST /api/v2/missions/{id}/pause
POST /api/v2/missions/{id}/resume
GET  /api/v2/missions/{id}/workspace
```

Mission API 只编排现有 A2/A6 Run，禁止复制一套 Runtime。

---

# 10. Conversation API

现有：

```text
POST /api/v1/opportunities/{id}/messages
GET  /api/v1/opportunities/{id}/threads
POST /api/v1/agent/chat
```

V2 可 additive 增加 Thread Detail / Voice Session：

```text
GET  /api/v2/threads/{thread_id}/messages
POST /api/v2/voice-sessions
POST /api/v2/voice-sessions/{id}/events
POST /api/v2/voice-sessions/{id}/end
```

Voice 事件最终必须进入 Conversation / Agent Event。

---

# 11. Approval API

现有：

```text
POST /api/v1/approvals/{approval_id}
```

请求：

```yaml
status: APPROVED | REJECTED
edited_payload: object | null
```

服务端负责：

- 权限
- 状态校验
- 执行器调用
- External Action 结果
- 审计记录

---

# 12. Auth / Role

现有角色：

```text
SELLER
BUYER
INTERNAL
SYSTEM
```

原则：

- BUYER 只能访问买家可见投影。
- SELLER 访问与自身 Seller / Capability Profile 绑定的 Opportunity。
- INTERNAL 可查看更完整运行时信息。
- Trace 仅 INTERNAL。

---

# 13. Versioning

```text
/api/v1/* = 当前实现与兼容层
/api/v2/* = 新增 Mission / Intelligence / Voice 等聚合能力
```

单纯增加字段优先留在 v1；语义改变或新业务资源再进入 v2。

---

# 14. 验收

- [ ] 当前 8000 / 3317 API 有明确边界
- [ ] V2 优先复用 `/workspace`
- [ ] 新接口 additive
- [ ] 错误码统一
- [ ] 副作用具备幂等性
- [ ] 权限由服务端裁剪
- [ ] 列表支持分页策略
- [ ] Mission / Voice 不复制 Agent Runtime
