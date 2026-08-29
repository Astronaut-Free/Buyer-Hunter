# QianPulse Agent 工作台集成包

这个包只包含 Agent 工作台和所需后端，不包含主首页 UI。队友可以把工作台嵌入现有前端，并保留自己的导航、主题和页面布局。

## 包含内容

- `workspace-reference.html`：当前工作台的结构参考，包含 `#workspace` 页面节点。
- `integration-reference.html`：可运行的完整参考页面，用于对照工作台交互，不要直接覆盖队友首页。
- `server/`：Agent、DeepSeek、卖家档案、Run、权限和匹配接口。
- `db/`：数据库结构和 Free 分支买家需求示例。

## 需要接入的接口

```text
POST /api/v1/agent/intake
POST /api/v1/agent/runs
GET  /api/public/opportunities
GET  /api/v1/seller/profile
POST /api/v1/seller/profile
```

## 集成规则

1. 迁移 `#workspace` 节点及其工作台专用样式。
2. 迁移工作台脚本，并确保页面提供 `#messages`、`#input`、`#rows`、`#status`、`#count` 等节点。
3. 不要覆盖队友的首页 `index.html`、导航和资源样式。
4. 后端部署时配置 `DEEPSEEK_API_KEY`，API Key 只放服务器 `.env`。
5. 保留 `Authorization: Bearer <token>`，Agent 和卖家档案接口需要登录。

## 本地参考运行

```bash
cd integration-reference
npm install
npm start
```

`integration-reference.html` 仅用于核对交互逻辑，最终合并时以队友主页面为入口。
