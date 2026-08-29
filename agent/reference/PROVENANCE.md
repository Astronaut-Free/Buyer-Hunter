# agent/reference/ — 前端设计参考稿（未接线）

vendored from the `Agent` branch of this repository.

| | |
|---|---|
| Source branch | `origin/Agent` |
| Source commit | `f3f4862` |
| Vendored on | 2026-08-29 |
| Author | ccxioi |
| Method | `git show origin/Agent:<file>`（只取 HTML，图片资源未取——这些页面全部内联，不引用外部资源） |

## 这是什么

ccxioi 对**工作台前端**的平行设计稿。与 `agent/index.html`（当前实际运行的工作台）
同源同结构（`#auth` / `#home` / `#workspace` / `#business` 四视图 SPA），但走的是
另一条演进路线。

| | `agent/index.html`（在跑） | `agent/reference/app.html`（参考） |
|---|---|---|
| 实时采集面板 | ✅ | ✖ |
| 商机简报 PDF 入口 | ✅ | ✖ |
| 卖家入驻对话状态机 | 基础版 | ✅ 更完整（`installSellerIntakeState` / `installUnifiedSellerFlow`） |
| 买家对话 | ✖ | ✅ `installBuyerConversation` |
| 结构化事实抽取 | ✖ | ✅ `extractAssistantFacts` |

**两边互不为超集**，因此并存而非替换 —— 直接覆盖 `agent/index.html` 会丢掉采集面板和简报入口。

## 为什么能跑起来

这些页面调用 4 个后端接口。之前有 3 个在本仓库并不存在（`/api/public/opportunities`
返回 500，`/chat` 和 `/intake` 返回 404），已随本次整合补齐：

```
GET  /api/public/opportunities   免登录机会列表（脱敏投影）
POST /api/v1/agent/intake        卖家入驻对话（DeepSeek，无 key 走规则兜底）
POST /api/v1/agent/chat          针对单笔 Opportunity 的问答（同上）
POST /api/v1/agent/runs          已有
```

实现见 `agent/server/agent-conversation.js`。无 `DEEPSEEK_API_KEY` 时兜底逻辑
**只提问、只复述已记录字段**，绝不断言事实或编造买家需求。

## 怎么看

服务已在同源提供静态文件，起服务后直接访问：

```
http://127.0.0.1:3317/reference/app.html
http://127.0.0.1:3317/reference/integration-reference.html
```

## 后续

设计方向的取舍（是否把 `app.html` 的入驻对话流并入正在跑的工作台）留给团队评审，
本次只保证「参考稿能真实跑起来」，不做前端裁决。
