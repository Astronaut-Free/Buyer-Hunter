# 买家猎手 / 黔脉 QianPulse

面向贵州卖家的 **全球采购商机智能平台**：持续抓取、清洗、验证海外买方需求，结合卖方能力判断今天最值得追的机会，并围绕目标市场自动开发潜在客户、推进已进入对话的商机。

商业模式：卖家购买决策会员，获得每日 Top 5、为什么现在、供需匹配、市场准入、风险、Gap 和下一步行动。采购入口与公开 B2B 联系方式是独立的 Lead Access 执行资源。Demo 只模拟会员权限与额度，不接真实支付。

---

## 架构：一个仓库，两个运行时 + 一个静态前门

| 运行时 | 语言 | 覆盖模块 | 目录 | 测试 |
|---|---|---|---|---|
| **pipeline + api** | Python 3.12 / FastAPI / SQLite | A1 采集 · A3 时机 · A4 供需匹配 · A5 准入风控 · 机会决策引擎 · 读接口 | `pipeline/` `api/` `db/` | `pytest` — 115 |
| **agent** | Node.js（零依赖） | A2 主动商机拓展 · A6 成交自动推进 · A3/A4/A5 会话内刷新 · Agent 控制面 | `agent/` | `npm test` — 127 |
| demo | React / Vite | 卖家决策台（5 屏） | `demo/` | `npm run build` |
| site | 静态 HTML（无构建） | 门户前门：首页 + 全球商机展示页（vendored 自 `ui` 分支） | `site/` | 审计静态校验 |

两个运行时通过 **双向数据桥** 连接：Python 流水线产出 `runtime/buyer_hunter.db`，`scripts/export_opportunities_for_agent.py` 导出为 `agent/db/opportunities.json`，agent 启动时读入（merge-on-reload 保留 A6 变更）；反向 agent 的 A6 结果与 A2 发现目标经 `agent/db/agent-outcomes.json` 由 `scripts/import_agent_outcomes.py` 幂等回写 Free store（`deal_outcome` + `agent_discovered_target`，含 domain 实体解析）。契约见 [`contracts/opportunity-bridge-v1.md`](contracts/opportunity-bridge-v1.md)。A6 会话内刷新 A3/A4/A5 时经 capability CLI 调 Python 权威实现（`contracts/capability-result-envelope.schema.json`），运行时故障返回结构化 `ERROR`，不切换到另一套业务算法。前门 `site/` 通过 `site/nav-bridge.js` 把登录/CTA 指向 demo，商机页经 `site/opportunities-live.js` 拉 `/api/v1` 实时数据（API 不可用时回退静态样例）。

```
site:4180 前门 ──「立即寻找商机 / 登录」──→ demo:4173 工作台 ──VITE_BUYER_HUNTER_API──→ api:8000

A1 采集 ─┐
         ├─→ 清洗/验真/去重 ─→ A3 时机 ─→ A4 供需 ─→ A5 风控 ─→ 机会决策 ─→ runtime/buyer_hunter.db
         │                                                                        │
A2 目标市场 ─→ 发现买家 ─→ Fit ─→ 联系人 ─→ 首封邮件(Human Gate) ─→ Smartlead ──┐   │ 数据桥
                                                                              ↓   ↓
                                              买家回复 ─→ A6 Analysis ─→ 刷新 A3/A4/A5 ─→ A6 Final ─→ Communication Brief ─→ Reply Composer ─→ Human Gate
```

---

## 运行

```powershell
# Windows
.\run.ps1 -Setup      # pip install + npm ci
.\run.ps1 -Build      # 从 committed fixture 重建决策 store
.\run.ps1 -Export     # 桥：store -> agent feed + agent 结果回写 store（双向）
.\run.ps1 -Up         # 起 site(:4180) + demo(:4173) + api(:8000) + agent(:3317)
.\run.ps1 -Down       # 停
.\run.ps1 -Test       # pytest + npm test
.\run.ps1 -Audit      # 跨运行时审计 -> docs/AUDIT_<date>.md
```

```bash
# Linux / macOS / WSL / CI
make setup && make up
make test
make audit
```

起来后打开 **http://127.0.0.1:4180**（前门）或 **http://127.0.0.1:4173**（工作台）。
端口：site `4180` · demo `4173` · FastAPI `8000` · agent `3317`。

实网（真实外联）需要 `QIANPULSE_EXTERNAL_MODE=live` + `SMARTLEAD_API_KEY` `SMARTLEAD_CAMPAIGN_ID` `SMARTLEAD_WEBHOOK_SECRET` `APOLLO_API_KEY` `TRADEMO_BUYER_LIST_URL`。未配置时以 sandbox 模式运行。详见 [`docs/18_整合架构与运行.md`](docs/18_整合架构与运行.md)。

---

## 文档索引

**产品与范围**
1. [项目理解与范围](docs/00_项目理解与范围.md) · [PRD](docs/01_PRD.md) · [数据工程与后端实现](docs/02_数据工程与后端实现.md)
2. [参考稿冲突矩阵与统一方案 V2](docs/04_参考稿冲突矩阵与统一方案_v2.md) · [五人分工](docs/05_五人分工与3号位执行手册.md)

**A1 / A3 / A4 / A5（Python）**
3. [采集清洗验真与数据库 API V1.0](docs/11_采集清洗验真与数据库API_v1.0.md) · [全平台采集与 API 接入状态](docs/14_全平台采集与API接入状态总表.md)
4. [机会决策驱动重构说明](docs/15_机会决策驱动重构说明.md) · [真实数据到机会决策 API 闭环](docs/16_真实数据到机会决策API闭环.md)
5. [Opportunity Decision OpenAPI](contracts/opportunity-decision-api-v1.yaml) · [SQLite Schema](db/schema.sql)

**A2 / A6（Node）**
6. [A2/A6 模块索引](docs/17_A2_A6_模块索引.md)

**整合**
7. [整合架构与运行](docs/18_整合架构与运行.md) · [数据桥契约](contracts/opportunity-bridge-v1.md) · [最新审计](docs/AUDIT_20260829.md)

**Demo**
8. [交互 Demo](demo/README.md)

---

平台当前不是店铺、商品展示商城、买家名录或双边交易市场。合同、支付、订单、报关、物流与履约不在开发范围。所有对外动作经人工审批；只采集公开 B2B 信息。
