# Trademo / Volza / Apollo / Clay 接入实施与凭据办理

版本：1.0  
日期：2026-08-28  
范围：接入 Trademo、Volza、Apollo、Clay；6sense 暂缓。

## 1. 结论与优先级

| 排名 | 平台 | 在 Buyer Hunter 中的角色 | 接入方式 | 当前代码状态 | 真正可用还缺什么 |
|---:|---|---|---|---|---|
| 1 | Trademo | 贸易记录、在采买企业、买家公司画像 | 商务 API | 连接器已落地 | API Key、Base URL、鉴权和端点合同 |
| 2 | Volza | 贸易记录、买家画像、决策人联系方式 | 正式 REST API | Bearer 鉴权和自检已落地 | Volza API Token；付费业务端点以开通合同为准 |
| 3 | Apollo | 公司与决策人补全 | 正式 REST API | 搜公司、企业补全、人员补全、自检已落地 | Apollo API Key、套餐权限和 credits |
| 4 | Clay | Signal → Score → Action 编排 | Webhook | 标准机会推送和 dry-run 已落地 | Clay Webhook URL，可选 Token |

不能把四个平台当成四个同类“RFQ 网站”：Trademo/Volza 提供交易事实，Apollo 做实体和联系人补全，Clay 负责工作流。正确链路是：

`公开 RFQ/采购公告 → Trademo/Volza 交叉验证 → Apollo 补全公司和决策人 → 四维验真与机会排序 → Clay 执行动作`

## 2. 已实现的调用面

| Provider | 方法 | 用途 | 是否会消耗额度/产生写入 |
|---|---|---|---|
| Apollo | `GET /auth/health` | API Key 自检 | 通常不消耗数据额度 |
| Apollo | `POST /mixed_companies/search` | 公司搜索 | 取决于套餐 |
| Apollo | `GET /organizations/enrich?domain=` | 企业补全 | 官方说明可能消耗 credits |
| Apollo | `POST /people/match` | 决策人补全 | 官方说明可能消耗 credits；默认不请求个人邮箱和手机 |
| Volza | `GET /countries/list` | Token 自检 | 参考数据接口 |
| Volza | `contracted_request` | 公司、买家洞察、贸易记录、联系人 | 路径必须来自已开通合同，防止误扣费和猜接口 |
| Trademo | `contracted_request` | 买家清单、公司画像、贸易记录 | 域名、鉴权、路径必须来自商务合同 |
| Clay | Webhook POST | 推送标准化机会 | 默认 dry-run；只有显式 `--send-clay-test` 才外发 |

Apollo 的 Buying Intent 是产品能力，但截至 2026-08-28，其公开 OpenAPI 没有暴露独立 Buying Intent 读取端点。因此当前接入 Apollo 的公司/联系人能力；意图字段只能在套餐允许的官方导出或 Apollo 提供的批准端点出现后登记，禁止伪造。

## 3. 四个平台办理参数

### 3.1 Apollo

1. 登录 Apollo。
2. 进入 `Settings → Integrations → API Keys`。
3. 创建 scoped API key，至少申请 `auth health`、company search、organization enrichment、people enrichment 对应权限。
4. 保存为 Windows 用户环境变量 `APOLLO_API_KEY`。
5. 确认套餐 credits；Demo 不启用个人邮箱、手机号 reveal，避免无意扣费和隐私风险。

### 3.2 Volza

1. 登录/注册 Volza，进入 API 方案或联系 Sales。
2. 明确申请：Company Search、Buyer Insights、Trade Shipments、Company Contact。
3. 从账户 Dashboard 获取 API Token，保存为 `VOLZA_API_TOKEN`。
4. 由 Volza 合同/文档确认收费业务路径后，再配置 `VOLZA_COMPANY_SEARCH_PATH`、`VOLZA_BUYER_INSIGHTS_PATH`、`VOLZA_TRADE_SHIPMENTS_PATH`、`VOLZA_COMPANY_CONTACT_PATH`。
5. Volza 明确禁止抓取其网站/app；本项目只允许官方 API。

### 3.3 Trademo

Trademo 官网以 Talk to Sales 开通为主。向销售一次性索要以下参数：

- Sandbox 与 Production Base URL；
- API Key；
- 鉴权 Header 名和前缀；
- Health/Test endpoint；
- Global Buyer/Supplier List、Profile、Shipments、Company Matcher 的路径；
- 五品类关键词/HS Code 查询示例、分页、限流、计费和数据留存条款。

对应变量：`TRADEMO_API_KEY`、`TRADEMO_API_BASE_URL`、`TRADEMO_HEALTH_PATH`，以及合同端点路径。未拿到合同参数前状态必须保持 `WAITING_COMMERCIAL_API_CONTRACT`。

### 3.4 Clay

1. 在 Clay Workbook 底部点击 `+ Add`。
2. 搜索 `Webhooks`，选择 `Monitor webhook`。
3. 复制 Webhook URL；可选创建一次性显示的 Header Token。
4. 保存 `CLAY_WEBHOOK_URL` 和可选的 `CLAY_WEBHOOK_TOKEN`。
5. 先运行 health，再显式发送 smoke test；收到一行测试数据后才标记 LIVE。

## 4. 密钥保存与自检

在仓库根目录 PowerShell 运行：

```powershell
& ".\pipeline\save_sales_intelligence_secrets.ps1"
```

全部输入完成后关闭当前终端并新开一个终端，再运行：

```powershell
python .\pipeline\sales_intelligence_connectors_v1.py --health
```

状态定义：

| 状态 | 含义 | 能否宣称已接通 |
|---|---|---|
| `HEALTHY` | 凭据经上游接口验证 | 可以 |
| `CONFIGURED_UNVERIFIED` | 参数齐，但未做外部写入/缺 health 路径 | 不可以 |
| `WAITING_CREDENTIALS` / `WAITING_WEBHOOK` | 缺 Key、Token 或 URL | 不可以 |
| `WAITING_COMMERCIAL_API_CONTRACT` | 缺商务合同接口参数 | 不可以 |
| `AUTH_FAILED` / `RATE_LIMITED` / `UPSTREAM_ERROR` | 鉴权、限流或上游异常 | 不可以 |

Clay 外发测试会真实写入表格，只在确认 URL 后执行：

```powershell
python .\pipeline\sales_intelligence_connectors_v1.py --send-clay-test
```

## 5. 数据映射与四维验真

统一契约：`contracts/sales-intelligence-connector-v1.schema.json`。

| 数据层 | Trademo | Volza | Apollo | Clay | 对四维验真的作用 |
|---|---|---|---|---|---|
| 真实需求文本/规格 | 辅助 | 辅助 | 不提供 | 不提供 | D1 仍以 RFQ/公告原文为主 |
| 企业真实性 | 公司画像 | 公司搜索/画像 | 域名和企业补全 | 不提供 | 增强 D2 |
| 时间性 | 最近贸易记录 | 最近贸易记录 | 企业数据更新时间 | 工作流时间 | 增强 D3，但不得替代需求发布日期 |
| 交叉佐证 | 贸易记录 | 贸易记录和联系人 | 企业/人员交叉匹配 | 编排结果 | 增强 D4 |
| 联系方式 | 视合同 | 决策人 API | 人员补全 | 下游动作 | 只作为触达渠道，不直接提高 D1 |

外部 provider 的 intent score 不等于 Buyer Hunter 的 truth score，不能直接覆盖四维分数。必须保存 provider、主题、观察时间和可用方式，作为独立特征参与 Opportunity Engine。

## 6. Demo 的最小接入顺序

1. 先用现有精准 RFQ 记录获得买家公司名/域名。
2. Apollo company search/enrich 解决实体标准化；只对高分记录做人员补全，控制 credits。
3. Volza/Trademo 用五品类关键词和 HS Code 验证近期进口/采购行为。
4. 重算 D2/D3/D4，保留每条证据 URL/记录 ID，不覆盖原始字段。
5. 将 A/B 级机会 dry-run 到 Clay；人工确认后再打开真实 webhook 推送。

这条链路满足 36 小时 Demo：不建设通用 iPaaS，不同步 CRM，不自动群发，不做 6sense。

## 7. 验收清单

- [ ] `python -m unittest pipeline.test_sales_intelligence_connectors_v1 -v` 全绿。
- [ ] 四个 provider 的 health 均有真实状态，且日志无密钥。
- [ ] Apollo 企业/人员补全使用官方端点，默认不 reveal 个人邮箱/手机号。
- [ ] Volza 只使用正式 API，不抓取网站或 app。
- [ ] Trademo 未拿到合同参数前不伪造 endpoint。
- [ ] Clay 未显式 send 前零外部写入。
- [ ] 统一输出通过 JSON Schema，provider intent 与 truth score 分离。
