# 04 BD Mission Workspace Engineering

## 组件定位

BD Mission 是 AI 全球生意开发任务空间。

用户不是管理名单，而是向 AI BD 团队下达商务拓展目标。

---

# 能力边界

负责：

- 目标解析
- 策略生成
- Agent调度
- 执行状态管理

不负责：

- 数据采集
- 买家画像
- 成交管理

---

# 输入

```json
{
"market":"美国",
"industry":"食品",
"target":"采购商",
"goal":"寻找抹茶采购机会"
}
```

---

# 子模块

## Mission Builder

自然语言创建任务。

## Strategy Planner

生成：

- 数据源
- 搜索规则
- 联系渠道
- 风险规则

## Agent Dispatcher

调度：

- Discovery Agent
- Research Agent
- Conversation Agent

## Human Gate

处理：

- 报价
- 合同
- 高价值机会

---

# API

GET /missions

POST /missions

GET /missions/{id}

POST /missions/{id}/execute

---

# 验收

- 可以自然语言创建任务
- AI生成执行计划
- Agent状态可追踪
- 人工可随时接管
